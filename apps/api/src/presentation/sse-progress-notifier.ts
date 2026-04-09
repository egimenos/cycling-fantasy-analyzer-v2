import type { Request, Response } from 'express';
import type { ProgressNotifier } from '../application/analyze/ports/progress-notifier.port';
import type {
  AnalysisStepId,
  AnalysisProgressEvent,
  AnalysisErrorEvent,
  AnalysisResultEvent,
} from '@cycling-analyzer/shared-types';

const TOTAL_STEPS = 6;

const STEP_INDEX: Record<AnalysisStepId, number> = {
  matching_riders: 1,
  loading_history: 2,
  fetching_startlist: 3,
  ml_predictions: 4,
  breakout_computation: 5,
  building_results: 6,
};

export class SseProgressNotifier implements ProgressNotifier {
  private cancelled = false;

  constructor(
    private readonly res: Response,
    req: Request,
  ) {
    req.on('close', () => {
      this.cancelled = true;
    });
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  stepStarted(step: AnalysisStepId): void {
    if (this.cancelled) return;
    const event: AnalysisProgressEvent = {
      step,
      status: 'in_progress',
      stepIndex: STEP_INDEX[step],
      totalSteps: TOTAL_STEPS,
    };
    this.sendEvent('progress', event);
  }

  stepCompleted(step: AnalysisStepId, elapsedMs: number): void {
    if (this.cancelled) return;
    const event: AnalysisProgressEvent = {
      step,
      status: 'completed',
      stepIndex: STEP_INDEX[step],
      totalSteps: TOTAL_STEPS,
      elapsedMs,
    };
    this.sendEvent('progress', event);
  }

  stepFailed(step: AnalysisStepId, message: string): void {
    if (this.cancelled) return;
    const event: AnalysisErrorEvent = { step, message };
    this.sendEvent('error', event);
  }

  sendResult(result: AnalysisResultEvent): void {
    if (this.cancelled) return;
    this.sendEvent('result', result);
  }

  private sendEvent(type: string, data: unknown): void {
    this.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}
