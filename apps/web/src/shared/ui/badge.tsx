import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs font-semibold font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-surface-container-high text-on-surface',
        secondary: 'border-secondary/30 bg-secondary-container/20 text-secondary',
        destructive: 'border-error/30 bg-error-container/20 text-error',
        outline: 'text-on-surface border-outline-variant/30',
        success: 'border-green-500/20 bg-green-500/10 text-green-400',
        warning: 'border-tertiary/20 bg-tertiary/10 text-tertiary',
        gc: 'border-gc/30 bg-gc/10 text-gc',
        stage: 'border-stage/30 bg-stage/10 text-stage',
        mountain: 'border-mountain/30 bg-mountain/10 text-mountain',
        sprint: 'border-sprint/30 bg-sprint/10 text-sprint',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
