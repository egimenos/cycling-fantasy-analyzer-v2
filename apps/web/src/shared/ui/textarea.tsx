import * as React from 'react';
import { cn } from '@/shared/lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[60px] w-full rounded-sm border-none bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-outline/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-fixed disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
