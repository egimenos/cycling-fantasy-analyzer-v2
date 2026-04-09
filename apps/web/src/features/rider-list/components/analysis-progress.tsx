import { Circle, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import type { StepState, StepStatus } from '../hooks/use-analyze';

interface AnalysisProgressProps {
  steps: StepState[];
  error?: string;
  failedStep?: string;
  onRetry?: () => void;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'pending':
      return <Circle className="h-5 w-5 text-outline" />;
    case 'in_progress':
      return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    case 'completed':
      return <CheckCircle2 className="h-5 w-5 text-tertiary" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-error" />;
  }
}

function stepTextClass(status: StepStatus): string {
  switch (status) {
    case 'pending':
      return 'text-outline';
    case 'in_progress':
      return 'font-medium text-on-surface';
    case 'completed':
      return 'text-on-surface-variant';
    case 'failed':
      return 'text-error font-medium';
  }
}

function ProgressStep({ step }: { step: StepState }) {
  return (
    <div
      className="flex items-center gap-3 py-1.5"
      role="listitem"
      aria-label={`${step.displayName}: ${step.status.replace('_', ' ')}`}
    >
      <StepIcon status={step.status} />
      <span className={`text-sm ${stepTextClass(step.status)}`}>{step.displayName}</span>
      {step.status === 'completed' && step.elapsedMs != null && (
        <span className="ml-auto font-mono text-xs text-outline">
          {formatElapsed(step.elapsedMs)}
        </span>
      )}
      {step.status === 'failed' && step.errorMessage && (
        <span className="ml-auto text-xs text-error">{step.errorMessage}</span>
      )}
    </div>
  );
}

export function AnalysisProgress({ steps, error, failedStep, onRetry }: AnalysisProgressProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-1">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-outline font-mono text-xs uppercase tracking-tight">
            {error ? 'Analysis Failed' : 'Analyzing Riders'}
          </span>
        </div>
        <div role="list" aria-label="Analysis steps">
          {steps.map((step) => (
            <ProgressStep key={step.id} step={step} />
          ))}
        </div>
        {error && (
          <div className="mt-6 rounded-sm border border-error/20 bg-error-container/[0.06] p-4">
            <p className="text-sm font-mono text-error leading-relaxed">
              {failedStep ? error : 'Connection lost. Please try again.'}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-error/10 hover:bg-error/20 border border-error/30 text-error font-mono font-bold text-xs uppercase tracking-wider rounded-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Analysis
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
