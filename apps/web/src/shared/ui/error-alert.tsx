import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

interface ErrorAlertProps extends React.ComponentPropsWithoutRef<'div'> {
  message: string;
  onRetry?: () => void;
}

export function ErrorAlert({ message, onRetry, ...rest }: ErrorAlertProps) {
  return (
    <Alert variant="destructive" {...rest}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{message}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
