import type { AnalysisStepId } from '@cycling-analyzer/shared-types';

export interface ProgressNotifier {
  stepStarted(step: AnalysisStepId): void;
  stepCompleted(step: AnalysisStepId, elapsedMs: number): void;
  stepFailed(step: AnalysisStepId, message: string): void;
  readonly isCancelled: boolean;
}
