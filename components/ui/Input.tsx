'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-12 w-full rounded-lg border-2 border-ink bg-paper px-4 text-ink placeholder:text-ink-faint',
          'shadow-doodle-soft focus:outline-none focus:ring-2 focus:ring-coral',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
