import { useState, useMemo } from 'react';
import type { PriceListEntryDto } from '@cycling-analyzer/shared-types';
import { RaceType } from '@cycling-analyzer/shared-types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Loader2 } from 'lucide-react';

interface RiderInputProps {
  onAnalyze: (
    riders: PriceListEntryDto[],
    raceType: RaceType,
    budget: number,
    seasons: number,
  ) => void;
  isLoading: boolean;
}

function parseRiderLines(text: string): PriceListEntryDto[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(/[,\t]+/).map((p) => p.trim());
      if (parts.length < 3) return null;
      const name = parts[0];
      const team = parts[1];
      const price = Number(parts[2]);
      if (!name || !team || Number.isNaN(price) || price <= 0) return null;
      return { name, team, price };
    })
    .filter((entry): entry is PriceListEntryDto => entry !== null);
}

const RACE_TYPE_LABELS: Record<RaceType, string> = {
  [RaceType.GRAND_TOUR]: 'Grand Tour',
  [RaceType.CLASSIC]: 'Classic',
  [RaceType.MINI_TOUR]: 'Mini Tour',
};

export function RiderInput({ onAnalyze, isLoading }: RiderInputProps) {
  const [text, setText] = useState('');
  const [raceType, setRaceType] = useState<RaceType>(RaceType.GRAND_TOUR);
  const [budget, setBudget] = useState(2000);
  const [seasons, setSeasons] = useState(3);

  const parsedRiders = useMemo(() => parseRiderLines(text), [text]);
  const lineCount = text.split('\n').filter((l) => l.trim().length > 0).length;
  const invalidCount = lineCount - parsedRiders.length;

  const handleSubmit = () => {
    if (parsedRiders.length === 0) return;
    onAnalyze(parsedRiders, raceType, budget, seasons);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rider-input" className="mb-1.5 block text-sm font-medium">
          Rider List
        </label>
        <Textarea
          id="rider-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'One rider per line: Name, Team, Price\ne.g. Pogačar, UAE, 700'}
          rows={8}
          className="font-mono text-sm"
        />
        <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
          <span>
            {parsedRiders.length} valid rider{parsedRiders.length !== 1 ? 's' : ''}
          </span>
          {invalidCount > 0 && (
            <span className="text-yellow-600">
              {invalidCount} invalid line{invalidCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label htmlFor="race-type" className="mb-1.5 block text-sm font-medium">
            Race Type
          </label>
          <Select value={raceType} onValueChange={(v) => setRaceType(v as RaceType)}>
            <SelectTrigger id="race-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(RaceType).map((rt) => (
                <SelectItem key={rt} value={rt}>
                  {RACE_TYPE_LABELS[rt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[140px]">
          <label htmlFor="budget" className="mb-1.5 block text-sm font-medium">
            Budget (Hillios)
          </label>
          <Input
            id="budget"
            type="number"
            min={1}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            placeholder="Budget in Hillios"
          />
        </div>

        <div className="min-w-[120px]">
          <label htmlFor="seasons" className="mb-1.5 block text-sm font-medium">
            Seasons
          </label>
          <Select value={String(seasons)} onValueChange={(v) => setSeasons(Number(v))}>
            <SelectTrigger id="seasons">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 (current)</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSubmit} disabled={parsedRiders.length === 0 || isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" />
              Analyzing...
            </>
          ) : (
            'Analyze'
          )}
        </Button>
      </div>
    </div>
  );
}

export { parseRiderLines };
