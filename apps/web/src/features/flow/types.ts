import { Settings, BarChart3, Zap, Users } from 'lucide-react';

export type FlowStep = 'setup' | 'dashboard' | 'optimization' | 'roster';

export const FLOW_STEPS: readonly FlowStep[] = [
  'setup',
  'dashboard',
  'optimization',
  'roster',
] as const;

export const FLOW_STEP_LABELS: Record<FlowStep, string> = {
  setup: 'Setup',
  dashboard: 'Dashboard',
  optimization: 'Optimization',
  roster: 'Roster',
};

export const FLOW_STEP_ICONS: Record<FlowStep, typeof Settings> = {
  setup: Settings,
  dashboard: BarChart3,
  optimization: Zap,
  roster: Users,
};

export interface FlowState {
  unlockedSteps: ReadonlySet<FlowStep>;
}

export type FlowAction =
  | { type: 'ANALYZE_SUCCESS' }
  | { type: 'OPTIMIZE_SUCCESS' }
  | { type: 'TEAM_COMPLETE' }
  | { type: 'RESET' }
  | { type: 'INVALIDATE_FROM'; step: FlowStep };
