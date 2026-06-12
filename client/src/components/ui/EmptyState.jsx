import React from 'react';

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-16 ${className}`}>
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-paper dark:bg-ink border border-paper-rule dark:border-ink-rule flex items-center justify-center mb-4">
          <Icon size={26} className="text-ink/30 dark:text-paper/30" />
        </div>
      )}
      {title && (
        <h3 className="text-base font-semibold text-ink dark:text-paper">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-ink/60 dark:text-paper/60 mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
