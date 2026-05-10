'use client';
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /**
   * When true, renders a spinner in place of the children's icon-side and
   * disables the button. Use this for any async user action so the press
   * registers visually even before the server responds.
   */
  loading?: boolean;
};

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-paper border-doodle shadow-doodle hover:translate-y-[-1px] hover:shadow-doodle-lg',
  secondary:
    'bg-paper text-ink border-doodle shadow-doodle hover:translate-y-[-1px] hover:shadow-doodle-lg',
  ghost: 'text-ink hover:bg-ink/5',
  danger:
    'bg-[hsl(0_70%_55%)] text-paper border-doodle shadow-doodle hover:translate-y-[-1px] hover:shadow-doodle-lg',
  accent:
    'bg-coral text-ink border-doodle shadow-doodle hover:translate-y-[-1px] hover:shadow-doodle-lg',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-md',
  md: 'h-11 px-5 text-base rounded-lg',
  lg: 'h-14 px-7 text-lg rounded-xl',
};

const spinnerSize: Record<Size, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const isDisabled = !!loading || !!disabled;
    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          'press-doodle relative inline-flex select-none items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <Loader2
            className={cn('animate-spin', spinnerSize[size])}
            aria-hidden="true"
          />
        )}
        <span className={cn('inline-flex items-center gap-2', loading && 'opacity-90')}>
          {children}
        </span>
      </button>
    );
  },
);
Button.displayName = 'Button';
