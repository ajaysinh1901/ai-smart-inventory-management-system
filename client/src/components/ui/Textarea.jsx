import React, { forwardRef, useId } from 'react';

const Textarea = forwardRef(function Textarea(
  {
    label,
    error,
    helperText,
    required,
    className = '',
    containerClassName = '',
    id,
    rows = 3,
    ...rest
  },
  ref
) {
  const autoId = useId();
  const textareaId = id || autoId;
  const hasError = !!error;

  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      {label && (
        <label
          htmlFor={textareaId}
          className="text-xs font-semibold text-ink/70 dark:text-paper/70 block"
        >
          {label}
          {required && <span className="text-primary ml-0.5">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        aria-invalid={hasError || undefined}
        className={`w-full px-3.5 py-2.5 border rounded-xl text-sm text-ink dark:text-paper placeholder:text-ink/30 dark:placeholder:text-paper/30 outline-none transition-colors bg-paper-card dark:bg-ink-card resize-none leading-relaxed
          focus:ring-4 ${
            hasError
              ? 'border-primary/50 dark:border-primary/60 focus:ring-primary/20 dark:focus:ring-primary/25 focus:border-primary'
              : 'border-paper-rule dark:border-ink-rule hover:border-paper-rule dark:hover:border-ink-rule focus:ring-primary/15 focus:border-primary'
          } disabled:bg-paper dark:disabled:bg-ink disabled:text-ink/40 disabled:cursor-not-allowed ${className}`}
        {...rest}
      />
      {hasError ? (
        <p className="text-xs text-primary font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-ink/50 dark:text-paper/50">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Textarea;
