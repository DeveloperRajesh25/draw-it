'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
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

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'press-doodle inline-flex select-none items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
