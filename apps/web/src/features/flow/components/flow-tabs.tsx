import { Lock } from 'lucide-react';
import type { FlowStep } from '../types';
import { FLOW_STEPS, FLOW_STEP_LABELS } from '../types';
import { useFlowState } from '../hooks/use-flow-state';
import { cn } from '@/shared/lib/utils';

interface FlowTabsProps {
  activeTab: FlowStep;
  onTabChange: (tab: FlowStep) => void;
}

export function FlowTabs({ activeTab, onTabChange }: FlowTabsProps) {
  const { isUnlocked } = useFlowState();

  return (
    <div className="flex gap-1 border-b border-outline-variant/10 bg-surface-container-low px-6">
      {FLOW_STEPS.map((step) => {
        const unlocked = isUnlocked(step);
        const active = step === activeTab;

        return (
          <button
            key={step}
            data-testid={`flow-tab-${step}`}
            onClick={() => unlocked && onTabChange(step)}
            disabled={!unlocked}
            className={cn(
              'px-4 py-3 text-xs font-mono uppercase tracking-widest transition-colors relative',
              active && 'text-on-surface font-bold',
              !active && unlocked && 'text-on-surface-variant hover:text-on-surface cursor-pointer',
              !unlocked && 'text-on-primary-container/50 cursor-not-allowed',
            )}
          >
            <span className="flex items-center gap-1.5">
              {!unlocked && <Lock className="h-3 w-3" />}
              {FLOW_STEP_LABELS[step]}
            </span>
            {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}
