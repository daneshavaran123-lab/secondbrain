import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { keepRefUrls, referenceFor, type AssistantReference } from '@/lib/assistantLinks';

/** An assistant answer; records it names link to their page in the app, nothing else links out. */
export function AssistantMarkdown({ content, references, onOpen }: {
  content: string;
  references?: AssistantReference[];
  onOpen?: () => void;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={keepRefUrls}
      components={{
        p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-5 marker:text-muted-foreground">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-5 marker:text-muted-foreground">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        // No pictures from anywhere: their description is shown instead
        img: ({ alt }) => <span>{alt}</span>,
        // Only records of this answer become links, to their page in the app; any other link stays text
        a: ({ children, href }) => {
          const ref = referenceFor(href, references);
          if (!ref) return <span>{children}</span>;
          return (
            <Link
              to={ref.path}
              onClick={onOpen}
              aria-label={ref.label ? `${ref.label}: ${ref.title}` : ref.title}
              className="font-medium text-signal underline decoration-signal/40 underline-offset-4 hover:decoration-signal"
            >
              {children}
            </Link>
          );
        },
        h1: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold">{children}</h3>,
        h2: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold">{children}</h3>,
        h3: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold">{children}</h3>,
        code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{children}</code>,
        blockquote: ({ children }) => <blockquote className="my-2 border-s-2 border-border ps-3 text-muted-foreground">{children}</blockquote>,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border-b border-border bg-muted/50 px-2 py-1.5 text-start font-medium">{children}</th>,
        td: ({ children }) => <td className="border-b border-border/60 px-2 py-1.5">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
