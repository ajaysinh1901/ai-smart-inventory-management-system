import React from 'react';

const VARIANTS = {
  default: 'bg-paper dark:bg-ink text-ink/70 dark:text-paper/70 border-paper-rule dark:border-ink-rule',
  success: 'text-[#2E7D32] dark:text-[#4CAF50] bg-[#2E7D32]/10 dark:bg-[#4CAF50]/12 border-[#2E7D32]/30 dark:border-[#4CAF50]/30',
  warning: 'bg-brass/10 dark:bg-brass/15 text-brass-deep dark:text-brass border-brass/30',
  danger: 'bg-primary/8 dark:bg-primary/15 text-primary border-primary/25',
  info: 'bg-paper-card dark:bg-ink-card text-ink/60 dark:text-paper/60 border-paper-rule dark:border-ink-rule',
  primary: 'bg-primary/10 text-primary border-primary/20',
};

export default function Badge({
  variant = 'default',
  className = '',
  children,
  icon: Icon,
  ...rest
}) {
  const styles = VARIANTS[variant] || VARIANTS.default;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${styles} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
}
