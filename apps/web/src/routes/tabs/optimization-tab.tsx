import { OptimizerPanel } from '@/features/optimizer/components/optimizer-panel';
import type { useOptimize } from '@/features/optimizer/hooks/use-optimize';
import { Trophy } from 'lucide-react';

export interface OptimizationTabProps {
  optimizeState: ReturnType<typeof useOptimize>['state'];
  budget: number;
  onApplyToRoster: () => void;
}

export function OptimizationTab({ optimizeState, budget, onApplyToRoster }: OptimizationTabProps) {
  if (optimizeState.status !== 'success') {
    return (
      <div
        data-testid="tab-content-optimization"
        className="flex flex-col items-center justify-center py-24 animate-fade-in"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-tertiary/15 to-primary/10 flex items-center justify-center mb-6 ring-1 ring-tertiary/20">
          <Trophy className="h-10 w-10 text-tertiary/60" />
        </div>
        <h3 className="text-xl font-headline font-extrabold text-on-surface mb-2 tracking-tight">
          No Results Yet
        </h3>
        <p className="text-sm text-on-surface-variant max-w-sm text-center">
          Run the optimizer from the Dashboard tab to find the best lineup for your budget.
        </p>
        <div className="flex items-center gap-2 text-[10px] font-mono text-outline uppercase tracking-widest mt-4">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary/30" />
          Awaiting Optimization
        </div>
      </div>
    );
  }

  return (
    <div data-testid="tab-content-optimization">
      <OptimizerPanel data={optimizeState.data} budget={budget} onApplyToRoster={onApplyToRoster} />
    </div>
  );
}
