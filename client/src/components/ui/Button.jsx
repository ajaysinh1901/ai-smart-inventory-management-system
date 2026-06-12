import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Button — Carta-inspired editorial CTAs.
 *
 * - "primary": solid ink (near-black) with 2px inset border. On hover, inverts
 *   to white-bg/dark-text via the inset border. This is Carta's signature CTA.
 * - "brand":   keeps SmartStock navy for product-recognition surfaces.
 * - "secondary": outlined dark-on-white with the same 2px inset border, inverts on hover.
 * - "ghost", "danger", "outline" preserved for in-app usage.
 *
 * Easing: cubic-bezier(0, 0, 0.2, 1) — Carta's "carta" timing curve.
 */
const VARIANTS = {
  primary:
    'bg-ink text-paper shadow-[inset_0_0_0_2px_#1A1A1A] hover:bg-paper hover:text-ink ' +
    'dark:bg-paper dark:text-ink dark:shadow-[inset_0_0_0_2px_#F1F1F1] dark:hover:bg-ink dark:hover:text-paper ' +
    'disabled:hover:bg-ink disabled:hover:text-paper dark:disabled:hover:bg-paper dark:disabled:hover:text-ink',
  brand:
    'bg-primary text-white shadow-[inset_0_0_0_2px_#213467] hover:bg-primary-deep ' +
    'dark:bg-primary-soft dark:shadow-[inset_0_0_0_2px_#406EB5] dark:hover:bg-primary ' +
    'disabled:hover:bg-primary dark:disabled:hover:bg-primary-soft',
  secondary:
    'bg-paper text-ink shadow-[inset_0_0_0_2px_#1A1A1A] hover:bg-ink hover:text-paper ' +
    'dark:bg-transparent dark:text-paper dark:shadow-[inset_0_0_0_2px_#F1F1F1] dark:hover:bg-paper dark:hover:text-ink ' +
    'disabled:hover:bg-paper disabled:hover:text-ink dark:disabled:hover:bg-transparent dark:disabled:hover:text-paper',
  danger:
    'bg-coral-deep text-white shadow-[inset_0_0_0_2px_#E55A30] hover:bg-coral ' +
    'dark:bg-coral dark:shadow-[inset_0_0_0_2px_#FF7D55] dark:hover:bg-coral-deep ' +
    'disabled:hover:bg-coral-deep dark:disabled:hover:bg-coral',
  ghost:
    'text-ink/70 dark:text-paper/70 hover:bg-paper-soft dark:hover:bg-ink-soft hover:text-ink dark:hover:text-paper disabled:hover:bg-transparent',
  outline:
    'bg-transparent text-ink dark:text-paper shadow-[inset_0_0_0_1px_#E5E5E5] dark:shadow-[inset_0_0_0_1px_#333333] hover:shadow-[inset_0_0_0_1px_#1A1A1A] dark:hover:shadow-[inset_0_0_0_1px_#F1F1F1] hover:bg-paper-soft dark:hover:bg-ink-soft',
};

const SIZES = {
  sm: 'h-9  px-4   text-xs  rounded-btn gap-1.5',
  md: 'h-11 px-7   text-sm  rounded-btn gap-2',
  lg: 'h-12 px-10  text-sm  rounded-btn gap-2',
};

const ICON_SIZES = { sm: 13, md: 15, lg: 16 };

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconPosition = 'left',
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  const iconSize = ICON_SIZES[size] || 15;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ink/30 dark:focus-visible:ring-paper/30 focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:focus-visible:ring-offset-ink disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px transition-[background-color,color,transform,box-shadow] duration-200 ease-carta ${
        VARIANTS[variant] || VARIANTS.primary
      } ${SIZES[size] || SIZES.md} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" />
      ) : (
        Icon && iconPosition === 'left' && <Icon size={iconSize} />
      )}
      {children && <span>{children}</span>}
      {!loading && Icon && iconPosition === 'right' && <Icon size={iconSize} />}
    </button>
  );
});

export default Button;
