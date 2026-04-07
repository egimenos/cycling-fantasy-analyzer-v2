import type {
  AnalyzeResponse,
  PriceListEntryDto,
  ProfileSummary,
  RaceListItem,
} from '@cycling-analyzer/shared-types';
import { type RaceType } from '@cycling-analyzer/shared-types';
import { RiderInput } from '@/features/rider-list/components/rider-input';
import { LoadingSpinner } from '@/shared/ui/loading-spinner';
import { TableSkeleton } from '@/shared/ui/table-skeleton';
import { TrendingUp, AlertTriangle, RefreshCw, CheckCircle2, RotateCcw } from 'lucide-react';
import type { useRaceProfile } from '@/features/rider-list/hooks/use-race-profile';
import type { GmvImportState } from '@/features/rider-list/hooks/use-gmv-auto-import';

export interface SetupTabProps {
  onAnalyze: (
    riders: PriceListEntryDto[],
    raceType: RaceType,
    budget: number,
    profileSummary?: ProfileSummary,
    raceSlug?: string,
    year?: number,
  ) => void;
  isLoading: boolean;
  error?: string;
  onRetry?: () => void;
  onReset?: () => void;
  budget: number;
  riderText: string;
  onRiderTextChange: (text: string) => void;
  raceUrl: string;
  onRaceUrlChange: (url: string) => void;
  gameUrl: string;
  onGameUrlChange: (url: string) => void;
  onBudgetChange: (budget: number) => void;
  profileState: ReturnType<typeof useRaceProfile>;
  races: RaceListItem[];
  raceCatalogLoading: boolean;
  selectedRace: RaceListItem | null;
  onRaceSelect: (race: RaceListItem | null) => void;
  upcomingOnly: boolean;
  onUpcomingChange: (value: boolean) => void;
  gmvImportState: GmvImportState;
  analyzeResult?: AnalyzeResponse;
  totalCost: number;
  totalScore: number;
}

export function SetupTab({
  onAnalyze,
  isLoading,
  error,
  onRetry,
  onReset,
  budget,
  riderText,
  onRiderTextChange,
  raceUrl,
  onRaceUrlChange,
  gameUrl,
  onGameUrlChange,
  onBudgetChange,
  profileState,
  races,
  raceCatalogLoading,
  selectedRace,
  onRaceSelect,
  upcomingOnly,
  onUpcomingChange,
  gmvImportState,
  analyzeResult,
  totalCost,
  totalScore,
}: SetupTabProps) {
  const hasResult = !!analyzeResult;

  return (
    <div
      data-testid="tab-content-setup"
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 pt-2 lg:h-[calc(100dvh-12rem)] lg:max-h-[calc(100dvh-12rem)]"
    >
      <div className="lg:col-span-6 xl:col-span-5 flex flex-col lg:min-h-0">
        <RiderInput
          onAnalyze={onAnalyze}
          isLoading={isLoading}
          text={riderText}
          onTextChange={onRiderTextChange}
          raceUrl={raceUrl}
          onRaceUrlChange={onRaceUrlChange}
          gameUrl={gameUrl}
          onGameUrlChange={onGameUrlChange}
          budget={budget}
          onBudgetChange={onBudgetChange}
          profileState={profileState}
          races={races}
          raceCatalogLoading={raceCatalogLoading}
          selectedRace={selectedRace}
          onRaceSelect={onRaceSelect}
          upcomingOnly={upcomingOnly}
          onUpcomingChange={onUpcomingChange}
          gmvImportState={gmvImportState}
        />
      </div>

      <div className="lg:col-span-6 xl:col-span-7 flex flex-col lg:min-h-0">
        <div className="flex justify-between items-end mb-4 px-2">
          <div className="flex flex-col">
            <span className="text-outline font-mono text-xs uppercase tracking-tight">
              Real-time Preview
            </span>
            <h2 className="text-xl font-headline font-bold text-on-surface-variant">
              {error
                ? 'Analysis Failed'
                : isLoading
                  ? 'Analyzing...'
                  : hasResult
                    ? 'Analysis Complete'
                    : 'Analysis Pending'}
            </h2>
          </div>
        </div>

        {error ? (
          /* Error state */
          <div className="flex-1 rounded-sm bg-error-container/[0.06] border border-error/20 flex flex-col items-center justify-center p-8 relative overflow-hidden animate-fade-in">
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, transparent, transparent 20px, currentColor 20px, currentColor 22px)',
                color: 'var(--error)',
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-error/[0.04] to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center max-w-lg">
              <div className="relative mb-8">
                <div className="absolute inset-0 w-24 h-24 rounded-full bg-error/10 animate-pulse" />
                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-error/20 to-error-container/30 flex items-center justify-center ring-1 ring-error/30">
                  <AlertTriangle className="h-11 w-11 text-error" />
                </div>
              </div>

              <h3 className="text-2xl font-headline font-extrabold text-on-surface mb-3 tracking-tight">
                Something Went Wrong
              </h3>

              <div className="bg-surface-container-high/80 border border-outline-variant/15 rounded-sm px-5 py-4 mb-6 w-full backdrop-blur-sm">
                <p className="text-sm font-mono text-error leading-relaxed break-words">{error}</p>
              </div>

              <p className="text-on-surface-variant font-body text-sm leading-relaxed mb-8 max-w-sm">
                The analysis could not be completed. Check that all services are running and your
                configuration is correct, then try again.
              </p>

              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-error/10 hover:bg-error/20 border border-error/30 text-error font-mono font-bold text-sm uppercase tracking-wider rounded-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry Analysis
                </button>
              )}

              <div className="flex items-center gap-2 text-[10px] font-mono text-error/60 uppercase tracking-widest mt-6">
                <span className="w-1.5 h-1.5 rounded-full bg-error/40" />
                Error
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center gap-3 px-1">
              <LoadingSpinner />
              <span className="text-sm text-on-surface-variant">Analyzing riders...</span>
            </div>
            <TableSkeleton rows={10} />
          </div>
        ) : hasResult ? (
          /* Analysis complete — show summary */
          <div className="hidden lg:flex flex-1 rounded-sm bg-surface-container-low/30 border border-secondary/20 flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-secondary/[0.04] to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center max-w-md animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center mb-6 ring-1 ring-secondary/30">
                <CheckCircle2 className="h-10 w-10 text-secondary" />
              </div>
              <h3 className="text-2xl font-headline font-extrabold text-on-surface mb-3 tracking-tight">
                Analysis Complete
              </h3>

              <div className="grid grid-cols-3 gap-4 w-full mb-6">
                <div className="bg-surface-container-high/60 rounded-sm p-3 border border-outline-variant/10">
                  <span className="text-2xl font-mono font-bold text-secondary">
                    {analyzeResult.totalMatched}
                  </span>
                  <span className="block text-[10px] font-mono text-outline uppercase tracking-wider mt-1">
                    Matched
                  </span>
                </div>
                <div className="bg-surface-container-high/60 rounded-sm p-3 border border-outline-variant/10">
                  <span className="text-2xl font-mono font-bold text-on-surface">
                    {analyzeResult.totalSubmitted}
                  </span>
                  <span className="block text-[10px] font-mono text-outline uppercase tracking-wider mt-1">
                    Submitted
                  </span>
                </div>
                <div className="bg-surface-container-high/60 rounded-sm p-3 border border-outline-variant/10">
                  <span className="text-2xl font-mono font-bold text-tertiary">
                    {analyzeResult.unmatchedCount}
                  </span>
                  <span className="block text-[10px] font-mono text-outline uppercase tracking-wider mt-1">
                    Unmatched
                  </span>
                </div>
              </div>

              <p className="text-on-surface-variant font-body leading-relaxed mb-6 text-sm">
                Your analysis is ready. Head to the Dashboard to explore results, or re-analyze with
                different settings.
              </p>

              {onReset && (
                <button
                  onClick={onReset}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/20 text-on-surface-variant font-mono text-xs uppercase tracking-wider rounded-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Start New Analysis
                </button>
              )}

              <div className="flex items-center gap-2 text-[10px] font-mono text-secondary/60 uppercase tracking-widest mt-6">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary/60" />
                Complete
              </div>
            </div>
          </div>
        ) : (
          /* Idle state — awaiting input */
          <div className="hidden lg:flex flex-1 rounded-sm bg-surface-container-low/30 border border-dashed border-outline-variant/20 flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 flex justify-center pointer-events-none">
              <div className="w-px h-full bg-gradient-to-b from-transparent via-outline-variant/10 to-transparent" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-secondary/[0.02] to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center max-w-md animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-secondary/20 to-primary/10 flex items-center justify-center mb-6 ring-1 ring-secondary/20">
                <TrendingUp className="h-10 w-10 text-secondary" />
              </div>
              <h3 className="text-2xl font-headline font-extrabold text-on-surface mb-3 tracking-tight">
                Ready to Ride
              </h3>
              <p className="text-on-surface-variant font-body leading-relaxed mb-6 text-sm">
                Configure your race profile and rider list to unlock the analysis engine. Your
                optimized lineup will appear here.
              </p>
              <div className="flex items-center gap-2 text-[10px] font-mono text-outline uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary/40 animate-pulse" />
                Awaiting Input
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 bg-surface-container-high/40 p-3 md:p-4 rounded-sm border border-outline-variant/10 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-0 md:flex md:justify-between md:items-center">
            <div className="flex flex-col">
              <span className="text-[10px] md:text-xs text-outline uppercase font-mono tracking-tighter">
                Selected Riders
              </span>
              <span className="text-base md:text-lg font-mono font-bold text-outline">
                {hasResult ? `${analyzeResult.totalMatched}` : '--'} / 9
              </span>
            </div>
            <div className="hidden md:block h-8 w-px bg-outline-variant/15" />
            <div className="flex flex-col">
              <span className="text-[10px] md:text-xs text-outline uppercase font-mono tracking-tighter">
                Budget
              </span>
              <span className="text-base md:text-lg font-mono font-bold text-outline">
                {hasResult ? totalCost : 0} / {budget}
                <span className="text-[10px] ml-0.5 text-outline/50">H</span>
              </span>
            </div>
            <div className="hidden md:block h-8 w-px bg-outline-variant/15" />
            <div className="flex flex-col">
              <span className="text-[10px] md:text-xs text-outline uppercase font-mono tracking-tighter">
                Projected Score
              </span>
              <span className="text-base md:text-lg font-mono font-bold text-outline">
                {hasResult && totalScore > 0 ? totalScore.toFixed(1) : '—'}
              </span>
            </div>
            <div className="flex gap-2 items-center bg-surface-container-highest/50 px-2 md:px-3 py-1.5 rounded-sm justify-center md:justify-start">
              <span
                className={`w-1.5 h-1.5 rounded-full ${hasResult ? 'bg-secondary/60' : 'bg-secondary/40 animate-pulse'}`}
              />
              <span className="text-[10px] text-on-surface-variant uppercase font-mono tracking-wider font-medium">
                {hasResult ? 'Analysis Done' : 'System Ready'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
