import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * ErrorBoundary — Top-level safety net for unhandled render errors.
 * Wrap routes inside this so that a crashing component doesn't blank the
 * entire app. Provides a friendly recovery screen with a Reload button.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log for diagnostics; production projects could ship this to Sentry/Datadog.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen w-full bg-paper dark:bg-ink flex items-center justify-center p-6">
        <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={28} />
          </div>
          <h1 className="text-xl font-extrabold text-ink dark:text-paper mb-2">Something went wrong</h1>
          <p className="text-sm text-ink/60 dark:text-paper/60 leading-relaxed mb-6">
            An unexpected error interrupted the page. Reloading usually fixes it. If the issue
            keeps happening, please contact support.
          </p>
          {this.state.error?.message && (
            <pre className="text-[11px] text-ink/50 dark:text-paper/50 bg-paper dark:bg-ink border border-paper-rule dark:border-ink-rule rounded-lg p-3 mb-6 text-left overflow-x-auto">
              {String(this.state.error.message)}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors"
          >
            <RefreshCw size={16} /> Reload Page
          </button>
        </div>
      </div>
    );
  }
}
