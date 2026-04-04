import { Lock } from 'lucide-react';
import type { FlowStep } from '../types';
import { FLOW_STEPS, FLOW_STEP_LABELS, FLOW_STEP_ICONS } from '../types';
import { useFlowState } from '../hooks/use-flow-state';
import { cn } from '@/shared/lib/utils';

const FLOW_STEP_SHORT: Record<FlowStep, string> = {
  setup: 'Setup',
  dashboard: 'Board',
  optimization: 'Optim.',
  roster: 'Roster',
};

interface FlowTabsProps {
  activeTab: FlowStep;
  onTabChange: (tab: FlowStep) => void;
}

export function FlowTabs({ activeTab, onTabChange }: FlowTabsProps) {
  const { isUnlocked } = useFlowState();

  return (
    <div className="border-b border-outline-variant/10 bg-surface-container-low">
      {/* Mobile: equal-width icon tabs */}
      <div className="flex md:hidden">
        {FLOW_STEPS.map((step) => {
          const unlocked = isUnlocked(step);
          const active = step === activeTab;
          const Icon = unlocked ? FLOW_STEP_ICONS[step] : Lock;

          return (
            <button
              key={step}
              data-testid={`flow-tab-${step}`}
              onClick={() => unlocked && onTabChange(step)}
              disabled={!unlocked}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-mono uppercase tracking-wider transition-all relative',
                active && 'text-on-surface font-bold',
                !active && unlocked && 'text-on-surface-variant',
                !unlocked && 'text-on-primary-container/40 cursor-not-allowed',
              )}
            >
              <Icon className="h-4 w-4" />
              {FLOW_STEP_SHORT[step]}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-secondary to-secondary/50" />
              )}
            </button>
          );
        })}
      </div>

      {/* Desktop: icons + full labels */}
      <div className="hidden md:flex px-6">
        {FLOW_STEPS.map((step) => {
          const unlocked = isUnlocked(step);
          const active = step === activeTab;
          const Icon = unlocked ? FLOW_STEP_ICONS[step] : Lock;

          return (
            <button
              key={step}
              data-testid={`flow-tab-${step}-desktop`}
              onClick={() => unlocked && onTabChange(step)}
              disabled={!unlocked}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'px-5 py-3.5 text-xs font-mono uppercase tracking-widest transition-all relative flex items-center gap-2 whitespace-nowrap flex-shrink-0',
                active && 'text-on-surface font-bold bg-surface-container/50',
                !active &&
                  unlocked &&
                  'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/30 cursor-pointer',
                !unlocked && 'text-on-primary-container/40 cursor-not-allowed',
              )}
            >
              <Icon className={cn('h-4 w-4 flex-shrink-0', active && 'text-secondary')} />
              {FLOW_STEP_LABELS[step]}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-secondary to-secondary/50" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
