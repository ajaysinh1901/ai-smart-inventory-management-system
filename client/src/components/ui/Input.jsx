import React, { forwardRef, useId } from 'react';

const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    required,
    icon: Icon,
    className = '',
    containerClassName = '',
    id,
    ...rest
  },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  const hasError = !!error;

  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-ink/70 dark:text-paper/70 block"
        >
          {label}
          {required && <span className="text-primary ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40 pointer-events-none"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={hasError || undefined}
          aria-describedby={
            hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          className={`w-full ${
            Icon ? 'pl-10' : 'pl-3.5'
          } pr-3.5 h-10 border rounded-xl text-sm text-ink dark:text-paper placeholder:text-ink/30 dark:placeholder:text-paper/30 outline-none transition-all bg-paper-card dark:bg-ink-card
            focus:ring-4 ${
              hasError
                ? 'border-primary/50 dark:border-primary/60 focus:ring-primary/20 dark:focus:ring-primary/25 focus:border-primary'
                : 'border-paper-rule dark:border-ink-rule hover:border-paper-rule dark:hover:border-ink-rule focus:ring-primary/20 focus:border-primary'
            } disabled:bg-paper dark:disabled:bg-ink disabled:text-ink/40 dark:disabled:text-paper/40 disabled:cursor-not-allowed ${className}`}
          {...rest}
        />
      </div>
      {hasError ? (
        <p id={`${inputId}-error`} className="text-xs text-primary font-medium">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-helper`} className="text-xs text-ink/50 dark:text-paper/50">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
