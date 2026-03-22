import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type { FlowAction, FlowState, FlowStep } from '../types';
import { FLOW_STEPS } from '../types';

function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'ANALYZE_SUCCESS':
      return {
        unlockedSteps: new Set([...state.unlockedSteps, 'dashboard']),
      };
    case 'OPTIMIZE_SUCCESS':
      return {
        unlockedSteps: new Set([...state.unlockedSteps, 'optimization']),
      };
    case 'TEAM_COMPLETE':
      return {
        unlockedSteps: new Set([...state.unlockedSteps, 'roster']),
      };
    case 'RESET':
      return { unlockedSteps: new Set<FlowStep>(['setup']) };
    case 'INVALIDATE_FROM': {
      const stepIndex = FLOW_STEPS.indexOf(action.step);
      const kept = FLOW_STEPS.filter((_, i) => i < stepIndex);
      return {
        unlockedSteps: new Set<FlowStep>([...kept, 'setup']),
      };
    }
    default:
      return state;
  }
}

export interface FlowContextValue {
  state: FlowState;
  dispatch: React.Dispatch<FlowAction>;
  isUnlocked: (step: FlowStep) => boolean;
}

export const FlowContext = createContext<FlowContextValue | null>(null);

export function useFlowReducer(): FlowContextValue {
  const [state, dispatch] = useReducer(flowReducer, {
    unlockedSteps: new Set<FlowStep>(['setup']),
  });

  const isUnlocked = useCallback(
    (step: FlowStep) => state.unlockedSteps.has(step),
    [state.unlockedSteps],
  );

  return useMemo(() => ({ state, dispatch, isUnlocked }), [state, dispatch, isUnlocked]);
}

export function useFlowState(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) {
    throw new Error('useFlowState must be used within a FlowProvider');
  }
  return ctx;
}
