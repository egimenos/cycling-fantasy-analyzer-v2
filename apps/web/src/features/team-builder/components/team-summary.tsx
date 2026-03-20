import type { AnalyzedRider } from '@cycling-analyzer/shared-types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';
import { BudgetIndicator } from '@/shared/ui/budget-indicator';
import { MlBadge } from '@/shared/ui/ml-badge';
import { Button } from '@/shared/ui/button';
import { formatNumber } from '@/shared/lib/utils';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { useState } from 'react';

interface TeamSummaryProps {
  riders: AnalyzedRider[];
  totalCost: number;
  totalScore: number;
  mlTotalScore: number | null;
  budget: number;
  onReset: () => void;
}

export function TeamSummary({
  riders,
  totalCost,
  totalScore,
  mlTotalScore,
  budget,
  onReset,
}: TeamSummaryProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const lines = riders.map(
      (r) => `${r.rawName} (${r.rawTeam}) - ${formatNumber(r.priceHillios)}H`,
    );
    const scoreLine =
      mlTotalScore !== null
        ? `Total: ${formatNumber(totalCost)}H | Rules: ${totalScore.toFixed(1)} | ML: ${mlTotalScore.toFixed(1)}`
        : `Total: ${formatNumber(totalCost)}H | Score: ${totalScore.toFixed(1)}`;
    const text = ['Team Selection', '---', ...lines, '---', scoreLine].join('\n');

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-green-700 dark:text-green-300">
          <Check className="h-4 w-4" />
          Team Complete!
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {riders.map((rider) => (
            <div key={rider.rawName} className="flex items-center justify-between py-1.5 text-sm">
              <span className="font-medium">{rider.rawName}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {formatNumber(rider.priceHillios)}H
                </span>
                <span className="w-12 text-right font-medium">
                  {rider.totalProjectedPts?.toFixed(1) ?? '---'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {mlTotalScore !== null ? 'Rules' : 'Total Score'}
          </span>
          <span className="text-lg font-bold">{totalScore.toFixed(1)}</span>
        </div>
        {mlTotalScore !== null && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              ML <MlBadge />
            </span>
            <span className="text-lg font-bold">{mlTotalScore.toFixed(1)}</span>
          </div>
        )}
        <BudgetIndicator spent={totalCost} total={budget} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied!' : 'Copy Team'}
          </Button>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
