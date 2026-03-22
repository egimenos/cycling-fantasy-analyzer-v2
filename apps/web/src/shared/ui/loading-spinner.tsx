interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-surface-container-highest border-t-primary" />
      {message && <p className="text-sm text-on-surface-variant">{message}</p>}
    </div>
  );
}
