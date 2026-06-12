import React, { forwardRef } from 'react';

const PADDINGS = {
  none:    '',
  sm:      'p-4',
  md:      'p-6',
  lg:      'p-8',
  default: 'p-6',
};

const Card = forwardRef(function Card(
  { padding = 'default', className = '', children, ...rest },
  ref
) {
  const pad = PADDINGS[padding] !== undefined ? PADDINGS[padding] : PADDINGS.default;
  return (
    <div
      ref={ref}
      className={`bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card ${pad} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

export const CardHeader = ({ className = '', children, ...rest }) => (
  <div className={`flex items-start justify-between gap-3 mb-5 ${className}`} {...rest}>
    {children}
  </div>
);

export const CardTitle = ({ className = '', children, ...rest }) => (
  <h3 className={`text-base font-semibold text-ink dark:text-paper ${className}`} {...rest}>
    {children}
  </h3>
);

export const CardDescription = ({ className = '', children, ...rest }) => (
  <p className={`text-sm text-ink/60 dark:text-paper/60 mt-0.5 ${className}`} {...rest}>
    {children}
  </p>
);

export const CardContent = ({ className = '', children, ...rest }) => (
  <div className={className} {...rest}>
    {children}
  </div>
);

export const CardFooter = ({ className = '', children, ...rest }) => (
  <div
    className={`flex items-center justify-end gap-3 mt-5 pt-4 border-t border-paper-rule dark:border-ink-rule ${className}`}
    {...rest}
  >
    {children}
  </div>
);

export default Card;
