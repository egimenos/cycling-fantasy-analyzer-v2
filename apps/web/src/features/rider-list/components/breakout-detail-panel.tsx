import type { BreakoutResult } from '@cycling-analyzer/shared-types';
import { FlagChip } from './bpi-badge';

interface BreakoutDetailPanelProps {
  breakout: BreakoutResult;
  prediction: number;
}

interface SignalConfig {
  key: keyof BreakoutResult['signals'];
  label: string;
  max: number;
  description: string;
}

const SIGNAL_CONFIGS: SignalConfig[] = [
  {
    key: 'trajectory',
    label: 'Trajectory',
    max: 25,
    description: 'Career trend direction — rising, stable, or declining',
  },
  {
    key: 'form',
    label: 'Form',
    max: 25,
    description: 'Recent 90-day performance vs career average — current hot streak',
  },
  {
    key: 'comeback',
    label: 'Comeback',
    max: 20,
    description: 'Gap to historical peak with evidence of recovery',
  },
  {
    key: 'routeFit',
    label: 'Route Fit',
    max: 15,
    description: 'How well rider profile matches the race parcours',
  },
  {
    key: 'variance',
    label: 'Variance',
    max: 15,
    description: 'Score volatility — high variance means bigger boom-or-bust potential',
  },
];

const FLAG_DESCRIPTIONS: Record<string, string> = {
  EMERGING_TALENT: 'Young rider with steep upward career trajectory',
  HOT_STREAK: 'Strong recent form — last 90 days well above career average',
  DEEP_VALUE: 'Cheap rider with above-median points per hillio',
  COMEBACK: 'Historical peak far exceeds prediction with recovery signs',
  SPRINT_OPPORTUNITY: 'Sprint profile on a flat-friendly course',
  BREAKAWAY_HUNTER: 'Mountain points on a budget — breakaway potential',
  RACE_SPECIALIST: 'Historically outperforms predictions in this race',
};

function SignalBar({ config, value }: { config: SignalConfig; value: number }) {
  const isRouteFitNA = config.key === 'routeFit' && value === 0;
  const pct = Math.min((value / config.max) * 100, 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-outline uppercase tracking-wider">
          {config.label}
        </span>
        <span className="text-[10px] font-mono text-on-surface-variant">
          {isRouteFitNA ? 'N/A' : `${value.toFixed(1)} / ${config.max}`}
        </span>
      </div>
      {isRouteFitNA ? (
        <p className="text-[10px] font-mono italic text-outline">N/A — no race profile provided</p>
      ) : (
        <div className="h-2 w-full rounded-sm bg-surface-container-high overflow-hidden">
          <div
            className="h-full rounded-sm bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className="text-[10px] text-on-surface-variant">{config.description}</p>
    </div>
  );
}

export function BreakoutDetailPanel({ breakout, prediction }: BreakoutDetailPanelProps) {
  const upsidePct =
    prediction > 0 && breakout.upsideP80 > prediction
      ? (((breakout.upsideP80 - prediction) / prediction) * 100).toFixed(0)
      : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Left column — Signal Bars */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-mono text-outline uppercase">BPI Signal Breakdown</h4>
        <div className="space-y-3">
          {SIGNAL_CONFIGS.map((config) => (
            <SignalBar key={config.key} config={config} value={breakout.signals[config.key]} />
          ))}
        </div>
      </div>

      {/* Right column — Upside + Flags */}
      <div className="space-y-4">
        {/* Upside Scenario */}
        <h4 className="text-[10px] font-mono text-outline uppercase">Upside Scenario</h4>
        <div className="bg-surface-container-high rounded-sm p-4 border border-outline-variant/10">
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <p className="text-[9px] font-mono text-outline uppercase">Prediction</p>
              <p className="font-mono font-bold text-lg">{prediction.toFixed(1)}</p>
            </div>
            <span className="text-outline text-lg">&rarr;</span>
            <div className="text-center">
              <p className="text-[9px] font-mono text-outline uppercase">P80 Upside</p>
              <p className="font-mono font-bold text-lg text-primary">
                {breakout.upsideP80.toFixed(1)}
              </p>
            </div>
          </div>
          {upsidePct && (
            <p className="text-center text-xs font-mono text-on-surface-variant mt-2">
              +{upsidePct}% upside potential
            </p>
          )}
        </div>

        {/* Breakout Indicators */}
        {breakout.flags.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-mono text-outline uppercase">Breakout Indicators</h4>
            <div className="space-y-2">
              {breakout.flags.map((flag) => (
                <div key={flag} className="flex items-start gap-2">
                  <FlagChip flag={flag} />
                  <span className="text-xs text-on-surface-variant">
                    {FLAG_DESCRIPTIONS[flag] ?? flag}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
