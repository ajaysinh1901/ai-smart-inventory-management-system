import React, { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(function Select(
  {
    label,
    error,
    helperText,
    required,
    icon: Icon,
    className = '',
    containerClassName = '',
    id,
    children,
    ...rest
  },
  ref
) {
  const autoId = useId();
  const selectId = id || autoId;
  const hasError = !!error;

  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      {label && (
        <label
          htmlFor={selectId}
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
        <select
          ref={ref}
          id={selectId}
          aria-invalid={hasError || undefined}
          className={`w-full ${
            Icon ? 'pl-10' : 'pl-3.5'
          } pr-10 h-10 border rounded-xl text-sm text-ink dark:text-paper outline-none transition-colors bg-paper-card dark:bg-ink-card appearance-none cursor-pointer
            focus:ring-4 ${
              hasError
                ? 'border-primary/50 dark:border-primary/60 focus:ring-primary/20 dark:focus:ring-primary/25 focus:border-primary'
                : 'border-paper-rule dark:border-ink-rule hover:border-paper-rule dark:hover:border-ink-rule focus:ring-primary/15 focus:border-primary'
            } disabled:bg-paper dark:disabled:bg-ink disabled:text-ink/40 disabled:cursor-not-allowed ${className}`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40 pointer-events-none"
        />
      </div>
      {hasError ? (
        <p className="text-xs text-primary font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-ink/50 dark:text-paper/50">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Select;
