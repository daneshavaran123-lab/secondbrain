import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Lazy load tesseract.js to avoid CommonJS/ESM issues
let TesseractModule: typeof import('tesseract.js') | null = null;

async function getTesseract() {
  if (!TesseractModule) {
    TesseractModule = await import('tesseract.js');
  }
  return TesseractModule;
}

// Lazy load pdfjs-dist to avoid ESM issues
let pdfjs: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist');
    // Worker is bundled with the app instead of fetched from a CDN
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
  return pdfjs;
}

export interface OCRResult {
  text: string;
  confidence: number;
  language: string;
  pages?: number;
}

export interface DocumentInfo {
  type: 'image' | 'pdf';
  pages: number;
  size: number;
}

/** progress: 0..1 for the current stage; `stage` is a short Persian label. */
export type OCRProgress = (progress: number, stage: string) => void;

const MAX_OCR_PAGES = 10;

/**
 * Many Persian PDFs (browser "Save as PDF", some Word exports) store text as
 * individual glyph shapes in visual order, so the text layer reads reversed and
 * broken. Such pages are OCRed from the rendered image instead.
 */
const PRESENTATION_FORMS = /[\uFB50-\uFDFF\uFE70-\uFEFF]/g;
function hasBrokenTextLayer(text: string): boolean {
  const letters = text.replace(/\s/g, '').length;
  return (text.match(PRESENTATION_FORMS)?.length ?? 0) > letters * 0.1;
}

/**
 * Grayscale and bring the image to a resolution Tesseract reads well:
 * small phone crops are upscaled, huge photos are scaled down for speed.
 */
async function prepareForOcr(image: Blob): Promise<HTMLCanvasElement | Blob> {
  try {
    const bitmap = await createImageBitmap(image);
    const targetWidth = Math.min(Math.max(bitmap.width, 1800), 2800);
    const scale = targetWidth / bitmap.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;
    ctx.filter = 'grayscale(1) contrast(1.15)';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  } catch {
    return image;
  }
}

class OCRService {
  private worker: any = null;
  private progressListener: OCRProgress | null = null;

  async initializeWorker(): Promise<void> {
    if (this.worker) return;

    const Tesseract = await getTesseract();
    // Optional self-hosted OCR files (worker.min.js, tesseract-core*.wasm*, fas/eng.traineddata.gz)
    // for when the jsDelivr CDN is unreachable; unset means the CDN defaults.
    const assets = (import.meta.env.VITE_OCR_ASSETS_URL as string | undefined)?.replace(/\/+$/, '');
    this.worker = await Tesseract.createWorker('fas+eng', 1, {
      logger: (m: { status: string; progress: number }) => {
        const stage = m.status === 'recognizing text' ? 'در حال خواندن متن' : 'در حال آماده‌سازی خواننده متن';
        this.progressListener?.(m.progress ?? 0, stage);
      },
      ...(assets ? { workerPath: `${assets}/worker.min.js`, corePath: assets, langPath: assets } : {}),
    });
    // No character whitelist: it dropped Persian digits, «/», «،» and Arabic letter forms
    // that letter numbers and dates rely on.
    await this.worker.setParameters({ preserve_interword_spaces: '1' });
  }

  async extractTextFromImage(imageFile: Blob, onProgress?: OCRProgress): Promise<OCRResult> {
    this.progressListener = onProgress ?? null;
    try {
      onProgress?.(0, 'در حال آماده‌سازی خواننده متن');
      await this.initializeWorker();

      if (!this.worker) {
        throw new Error('OCR worker not initialized');
      }

      const { data } = await this.worker.recognize(await prepareForOcr(imageFile));

      return {
        text: data.text.trim(),
        confidence: data.confidence,
        language: 'fas+eng',
        pages: 1
      };
    } finally {
      this.progressListener = null;
    }
  }

  async extractTextFromPDF(pdfFile: File, onProgress?: OCRProgress): Promise<OCRResult> {
    const pdfjsLib = await getPdfjs();
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

    let fullText = '';
    let totalConfidence = 0;
    const totalPages = Math.min(pdf.numPages, MAX_OCR_PAGES);

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const pageLabel = totalPages > 1 ? ` (صفحه ${pageNum.toLocaleString('fa-IR')} از ${totalPages.toLocaleString('fa-IR')})` : '';
      onProgress?.((pageNum - 1) / totalPages, `در حال خواندن متن${pageLabel}`);

      // First try the PDF's own text layer
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => `${item.str ?? ''}${item.hasEOL ? '\n' : ' '}`)
        .join('')
        .trim();

      if (pageText.length > 20 && !hasBrokenTextLayer(pageText)) {
        fullText += pageText + '\n';
        totalConfidence += 95; // High confidence for direct text extraction
        continue;
      }

      // Scanned page: render it and OCR the image
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas: canvas
      }).promise;

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });

      const ocrResult = await this.extractTextFromImage(blob, (p, stage) =>
        onProgress?.((pageNum - 1 + p) / totalPages, `${stage}${pageLabel}`)
      );
      fullText += ocrResult.text + '\n';
      totalConfidence += ocrResult.confidence;
    }

    onProgress?.(1, 'پایان خواندن');
    return {
      text: fullText.trim(),
      confidence: totalConfidence / totalPages,
      language: 'fas+eng',
      pages: totalPages
    };
  }

  async analyzeDocument(file: File): Promise<DocumentInfo> {
    if (file.type.startsWith('image/')) {
      return {
        type: 'image',
        pages: 1,
        size: file.size
      };
    } else if (file.type === 'application/pdf') {
      const pdfjsLib = await getPdfjs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

      return {
        type: 'pdf',
        pages: pdf.numPages,
        size: file.size
      };
    }

    throw new Error('Unsupported file type');
  }

  async processDocument(file: File, onProgress?: OCRProgress): Promise<OCRResult> {
    if (file.type === 'application/pdf') {
      return this.extractTextFromPDF(file, onProgress);
    }
    if (file.type.startsWith('image/')) {
      return this.extractTextFromImage(file, onProgress);
    }
    throw new Error('Unsupported file type');
  }

  async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export const ocrService = new OCRService();
