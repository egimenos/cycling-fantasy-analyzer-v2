import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalysisStepId,
} from '@cycling-analyzer/shared-types';
import { ANALYSIS_STEPS } from '@cycling-analyzer/shared-types';
import { analyzeRidersStream } from '@/shared/lib/api-client';

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface StepState {
  id: AnalysisStepId;
  displayName: string;
  status: StepStatus;
  elapsedMs?: number;
  errorMessage?: string;
}

export type AnalyzeState =
  | { status: 'idle' }
  | { status: 'loading'; steps: StepState[] }
  | { status: 'success'; data: AnalyzeResponse; steps: StepState[] }
  | { status: 'error'; error: string; steps: StepState[]; failedStep?: AnalysisStepId };

function createInitialSteps(): StepState[] {
  return ANALYSIS_STEPS.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    status: 'pending' as StepStatus,
  }));
}

export function useAnalyze() {
  const [state, setState] = useState<AnalyzeState>({ status: 'idle' });
  const [lastRequest, setLastRequest] = useState<AnalyzeRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (request: AnalyzeRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLastRequest(request);
    setState({ status: 'loading', steps: createInitialSteps() });

    try {
      await analyzeRidersStream(request, {
        signal: controller.signal,
        onProgress(event) {
          setState((prev) => {
            if (prev.status !== 'loading') return prev;
            const steps = prev.steps.map((s) =>
              s.id === event.step
                ? { ...s, status: event.status as StepStatus, elapsedMs: event.elapsedMs }
                : s,
            );
            return { ...prev, steps };
          });
        },
        onResult(result) {
          // Mark all steps as completed first so the user sees them finish
          setState((prev) => {
            if (prev.status !== 'loading') return prev;
            const steps = prev.steps.map((s) =>
              s.status !== 'completed' ? { ...s, status: 'completed' as StepStatus } : s,
            );
            return { ...prev, steps };
          });
          // Brief delay before showing results so the last steps are visible
          setTimeout(() => {
            setState((prev) => {
              const steps = 'steps' in prev ? prev.steps : createInitialSteps();
              return { status: 'success', data: result, steps };
            });
          }, 600);
        },
        onError(error) {
          setState((prev) => {
            const steps = prev.status === 'loading' ? prev.steps : createInitialSteps();
            const failedStep = 'step' in error ? error.step : undefined;
            if (failedStep) {
              const updatedSteps = steps.map((s) =>
                s.id === failedStep
                  ? { ...s, status: 'failed' as StepStatus, errorMessage: error.message }
                  : s,
              );
              return { status: 'error', error: error.message, steps: updatedSteps, failedStep };
            }
            return { status: 'error', error: error.message, steps };
          });
        },
      });
    } catch {
      if (!controller.signal.aborted) {
        setState((prev) => {
          const steps = prev.status === 'loading' ? prev.steps : createInitialSteps();
          return { status: 'error', error: 'Connection lost', steps };
        });
      }
    }
  }, []);

  const retry = useCallback(() => {
    if (lastRequest) {
      void analyze(lastRequest);
    }
  }, [lastRequest, analyze]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: 'idle' });
    setLastRequest(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { state, analyze, retry, reset };
}
