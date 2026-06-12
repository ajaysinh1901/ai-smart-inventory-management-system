import React from 'react';
import { AlertCircle, X, RefreshCw } from 'lucide-react';

export default function ErrorBanner({
  message,
  onDismiss,
  onRetry,
  className = '',
  title,
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`bg-primary/8 dark:bg-primary/15 border border-primary/25 dark:border-primary/30 rounded-xl p-4 flex items-start gap-3 text-primary ${className}`}
    >
      <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-bold">{title}</p>}
        <p className={`text-sm font-medium ${title ? 'mt-0.5' : ''}`}>{message}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border border-primary/25 bg-paper-card dark:bg-ink-card hover:bg-primary/5 text-primary transition-colors"
          >
            <RefreshCw size={12} /> Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="text-primary/60 hover:text-primary p-1 rounded-lg hover:bg-primary/10 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
