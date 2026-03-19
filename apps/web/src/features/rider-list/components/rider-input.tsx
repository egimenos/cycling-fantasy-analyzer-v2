import { useState, useMemo } from 'react';
import type { PriceListEntryDto, ProfileSummary } from '@cycling-analyzer/shared-types';
import { RaceType } from '@cycling-analyzer/shared-types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Loader2 } from 'lucide-react';
import { useRaceProfile } from '../hooks/use-race-profile';
import { RaceProfileSummary } from './race-profile-summary';

interface RiderInputProps {
  onAnalyze: (
    riders: PriceListEntryDto[],
    raceType: RaceType,
    budget: number,
    seasons: number,
    profileSummary?: ProfileSummary,
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

export function RiderInput({ onAnalyze, isLoading }: RiderInputProps) {
  const [text, setText] = useState('');
  const [raceUrl, setRaceUrl] = useState('');
  const [budget, setBudget] = useState(2000);
  const [seasons, setSeasons] = useState(3);

  const profileState = useRaceProfile(raceUrl);
  const raceType =
    profileState.status === 'success' ? profileState.data.raceType : RaceType.GRAND_TOUR;

  const parsedRiders = useMemo(() => parseRiderLines(text), [text]);
  const lineCount = text.split('\n').filter((l) => l.trim().length > 0).length;
  const invalidCount = lineCount - parsedRiders.length;

  const handleSubmit = () => {
    if (parsedRiders.length === 0) return;
    const profileSummary =
      profileState.status === 'success' ? profileState.data.profileSummary : undefined;
    onAnalyze(parsedRiders, raceType, budget, seasons, profileSummary);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="race-url" className="mb-1.5 block text-sm font-medium">
          PCS Race URL
        </label>
        <Input
          id="race-url"
          value={raceUrl}
          onChange={(e) => setRaceUrl(e.target.value)}
          placeholder="https://www.procyclingstats.com/race/tour-de-france/2025"
        />
        {profileState.status === 'idle' && raceUrl === '' && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Enter a PCS race URL to see the race profile and auto-detect the race type.
          </p>
        )}
        {profileState.status === 'loading' && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Fetching race profile from PCS...
          </div>
        )}
        {profileState.status === 'error' && (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>
              Could not fetch race profile. Check the URL and try again.
            </AlertDescription>
          </Alert>
        )}
        {profileState.status === 'success' && (
          <div className="mt-2">
            <RaceProfileSummary profile={profileState.data} />
          </div>
        )}
      </div>

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
