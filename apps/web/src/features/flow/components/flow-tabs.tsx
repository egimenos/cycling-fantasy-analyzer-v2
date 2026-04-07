import { Check, Lock } from 'lucide-react';
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

function useStepStates(activeTab: FlowStep) {
  const { isUnlocked } = useFlowState();
  const activeIndex = FLOW_STEPS.indexOf(activeTab);

  return FLOW_STEPS.map((step, i) => {
    const unlocked = isUnlocked(step);
    const active = step === activeTab;
    // A step is "completed" if it's unlocked AND comes before the active tab
    const completed = unlocked && !active && i < activeIndex;
    return { step, unlocked, active, completed };
  });
}

export function FlowTabs({ activeTab, onTabChange }: FlowTabsProps) {
  const stepStates = useStepStates(activeTab);

  return (
    <div className="border-b border-outline-variant/10 bg-surface-container-low">
      {/* Mobile: compact icon tabs */}
      <div className="flex md:hidden">
        {stepStates.map(({ step, unlocked, active, completed }) => {
          const Icon = completed ? Check : unlocked ? FLOW_STEP_ICONS[step] : Lock;

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
                completed && 'text-stage',
                !active && !completed && unlocked && 'text-on-surface-variant',
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

      {/* Desktop: numbered stepper with connection lines */}
      <div className="hidden md:flex items-center justify-center px-8 py-4">
        {stepStates.map(({ step, unlocked, active, completed }, i) => {
          const Icon = FLOW_STEP_ICONS[step];
          const isLast = i === FLOW_STEPS.length - 1;
          // The connecting line is "filled" if the NEXT step is unlocked
          const nextCompleted = !isLast && stepStates[i + 1].unlocked;

          return (
            <div key={step} className="flex items-center">
              {/* Step circle + label */}
              <button
                data-testid={`flow-tab-${step}-desktop`}
                onClick={() => unlocked && onTabChange(step)}
                disabled={!unlocked}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-2 group transition-all relative',
                  unlocked && !active && 'cursor-pointer',
                  !unlocked && 'cursor-not-allowed',
                )}
              >
                {/* Circle */}
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-all border-2',
                    active &&
                      'bg-secondary border-secondary text-secondary-foreground shadow-lg shadow-secondary/30',
                    completed && 'bg-stage/20 border-stage text-stage',
                    !active &&
                      !completed &&
                      unlocked &&
                      'border-outline-variant/30 text-on-surface-variant group-hover:border-secondary/50 group-hover:text-secondary',
                    !unlocked &&
                      'border-outline-variant/15 text-on-primary-container/30 bg-surface-container/50',
                  )}
                >
                  {completed ? (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  ) : !unlocked ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'text-[10px] font-mono uppercase tracking-widest whitespace-nowrap transition-colors',
                    active && 'text-on-surface font-bold',
                    completed && 'text-stage font-medium',
                    !active &&
                      !completed &&
                      unlocked &&
                      'text-on-surface-variant group-hover:text-on-surface',
                    !unlocked && 'text-on-primary-container/30',
                  )}
                >
                  {FLOW_STEP_LABELS[step]}
                </span>
              </button>

              {/* Connection line */}
              {!isLast && (
                <div
                  className={cn(
                    'w-20 lg:w-28 xl:w-36 h-0.5 mx-3 transition-colors rounded-full',
                    nextCompleted ? 'bg-stage/50' : 'bg-outline-variant/15',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
