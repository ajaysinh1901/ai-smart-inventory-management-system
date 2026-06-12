import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  className = '',
  closeOnBackdrop = true,
  hideCloseButton = false,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) onClose?.();
  };

  return (
    <div
      onMouseDown={handleBackdrop}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-modalFade"
      style={{ background: 'rgba(13,27,42,0.55)', backdropFilter: 'blur(8px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={dialogRef}
        className={`bg-paper-card dark:bg-ink-card rounded-t-3xl sm:rounded-xl shadow-2xl w-full ${
          SIZES[size] || SIZES.md
        } border-t sm:border border-paper-rule dark:border-ink-rule overflow-hidden flex flex-col max-h-[92vh] animate-modalSlide ${className}`}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between px-6 py-4 border-b border-paper-rule dark:border-ink-rule flex-shrink-0">
            <div className="min-w-0">
              {title && (
                <h3 id="modal-title" className="text-lg font-semibold text-ink dark:text-paper">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-sm text-ink/60 dark:text-paper/60 mt-0.5">{description}</p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-ink/40 dark:text-paper/40 hover:text-ink/70 dark:hover:text-paper/70 p-1 rounded-lg hover:bg-paper dark:hover:bg-ink transition-colors flex-shrink-0 ml-3"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-paper-rule dark:border-ink-rule flex items-center justify-end gap-3 flex-shrink-0 bg-paper/50 dark:bg-ink/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
