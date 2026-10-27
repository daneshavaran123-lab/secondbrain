import React from 'react';

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
          <h2 className="text-xl font-bold">این صفحه باز نشد</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            خطایی در اجرای برنامه پیش آمد. دوباره امتحان کنید؛ اگر تکرار شد، از حساب خارج شوید و دوباره وارد شوید.
          </p>
          {this.state.error?.message && (
            <pre dir="ltr" className="max-w-xl overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card px-4 py-3 text-left text-xs text-destructive">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              تلاش دوباره
            </button>
            <button
              onClick={() => { localStorage.clear(); window.location.href = '/auth'; }}
              className="h-10 rounded-md border border-input bg-card px-5 text-sm transition-colors hover:bg-accent"
            >
              خروج و ورود دوباره
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
