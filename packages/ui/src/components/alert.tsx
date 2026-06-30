import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const alertVariants = cva('rounded-md border px-4 py-3 text-sm', {
  variants: {
    variant: {
      info: 'border-border bg-muted text-foreground',
      success: 'border-success/30 bg-success/10 text-success',
      error: 'border-danger/30 bg-danger/10 text-danger',
      warning: 'border-warning/30 bg-warning/10 text-warning',
    },
  },
  defaultVariants: { variant: 'info' },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, role = 'alert', ...props }, ref) => (
    <div ref={ref} role={role} className={cn(alertVariants({ variant }), className)} {...props} />
  ),
);
Alert.displayName = 'Alert';

export { Alert, alertVariants };
