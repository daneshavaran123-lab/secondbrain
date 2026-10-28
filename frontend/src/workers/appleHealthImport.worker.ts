/// <reference lib="webworker" />
import { readAppleHealthExport } from '@/lib/appleHealthExport';

/** Parses an Apple Health export off the main thread; see lib/appleHealthExport. */
self.onmessage = async (event: MessageEvent<{ file: File; sinceDay: string }>) => {
  const { file, sinceDay } = event.data;
  let lastReport = 0;
  try {
    const samples = await readAppleHealthExport(file, sinceDay, (share, records) => {
      const now = Date.now();
      if (now - lastReport > 200) {
        lastReport = now;
        self.postMessage({ type: 'progress', share, records });
      }
    });
    self.postMessage({ type: 'done', samples });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
