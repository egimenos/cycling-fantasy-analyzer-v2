import { useState, useMemo, useCallback } from 'react';
import type { PriceListEntryDto, ProfileSummary } from '@cycling-analyzer/shared-types';
import { RaceType } from '@cycling-analyzer/shared-types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Loader2, Download } from 'lucide-react';
import { useRaceProfile } from '../hooks/use-race-profile';
import { RaceProfileSummary } from './race-profile-summary';
import { importPriceList } from '@/shared/lib/api-client';

interface RiderInputProps {
  onAnalyze: (
    riders: PriceListEntryDto[],
    raceType: RaceType,
    budget: number,
    profileSummary?: ProfileSummary,
    raceSlug?: string,
    year?: number,
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
  const [gameUrl, setGameUrl] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [importError, setImportError] = useState('');
  const [budget, setBudget] = useState(2000);

  const profileState = useRaceProfile(raceUrl);
  const raceType =
    profileState.status === 'success' ? profileState.data.raceType : RaceType.GRAND_TOUR;

  const parsedRiders = useMemo(() => parseRiderLines(text), [text]);
  const lineCount = text.split('\n').filter((l) => l.trim().length > 0).length;
  const invalidCount = lineCount - parsedRiders.length;

  const handleImport = useCallback(async () => {
    if (!gameUrl) return;
    setImportStatus('loading');
    setImportError('');
    const result = await importPriceList(gameUrl);
    if (result.status === 'success') {
      const lines = result.data.riders.map((r) => `${r.name}, ${r.team}, ${r.price}`).join('\n');
      setText(lines);
      setImportStatus('idle');
    } else {
      setImportStatus('error');
      setImportError(result.error);
    }
  }, [gameUrl]);

  const handleSubmit = () => {
    if (parsedRiders.length === 0) return;
    const profileSummary =
      profileState.status === 'success' ? profileState.data.profileSummary : undefined;
    const raceSlug = profileState.status === 'success' ? profileState.data.raceSlug : undefined;
    const year = profileState.status === 'success' ? profileState.data.year : undefined;
    onAnalyze(parsedRiders, raceType, budget, profileSummary, raceSlug, year);
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
        <label htmlFor="game-url" className="mb-1.5 block text-sm font-medium">
          Game Price List URL
          <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
        </label>
        <div className="flex gap-2">
          <Input
            id="game-url"
            value={gameUrl}
            onChange={(e) => setGameUrl(e.target.value)}
            placeholder="https://grandesminivueltas.com/index.php/..."
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={!gameUrl || importStatus === 'loading'}
          >
            {importStatus === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Import
          </Button>
        </div>
        {importStatus === 'error' && <p className="mt-1 text-xs text-red-600">{importError}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Import riders and prices from a fantasy game page, or paste manually below.
        </p>
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
