import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/**
 * Catches a crash while drawing a screen so the person sees a way forward instead of a blank page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen failed to render', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-[60vh] place-items-center px-4 py-16">
        <div role="alert" className="glass max-w-md p-7">
          <h1 className="text-[2.25rem] leading-none font-black">This screen stopped working</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-muted">
            Your saved vehicles and trips are safe. Reload the page to try again, or go back to the
            start.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Reload the page
            </button>
            <a href="/" className="btn-secondary">
              Go to the start
            </a>
          </div>
        </div>
      </div>
    );
  }
}
