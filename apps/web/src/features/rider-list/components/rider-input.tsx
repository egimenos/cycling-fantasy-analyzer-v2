import { useState, useMemo, useCallback } from 'react';
import type { PriceListEntryDto, ProfileSummary } from '@cycling-analyzer/shared-types';
import { RaceType } from '@cycling-analyzer/shared-types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Loader2, Download, Globe, Link, BarChart3 } from 'lucide-react';
import type { useRaceProfile } from '../hooks/use-race-profile';
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
  text: string;
  onTextChange: (text: string) => void;
  raceUrl: string;
  onRaceUrlChange: (url: string) => void;
  gameUrl: string;
  onGameUrlChange: (url: string) => void;
  budget: number;
  onBudgetChange: (budget: number) => void;
  profileState: ReturnType<typeof useRaceProfile>;
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

export function RiderInput({
  onAnalyze,
  isLoading,
  text,
  onTextChange: setText,
  raceUrl,
  onRaceUrlChange: setRaceUrl,
  gameUrl,
  onGameUrlChange: setGameUrl,
  budget,
  onBudgetChange: setBudget,
  profileState,
}: RiderInputProps) {
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [importError, setImportError] = useState('');

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
    <div className="flex flex-col gap-6">
      <header className="mb-2">
        <span className="text-secondary font-mono text-xs tracking-widest uppercase mb-1 block">
          Analysis Engine
        </span>
        <h1 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">
          Roster Setup
        </h1>
      </header>

      <div className="bg-surface-container-low rounded-sm p-8 flex flex-col gap-6 shadow-xl border border-outline-variant/15">
        {/* Race URL */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-body uppercase tracking-wider text-on-primary-container font-semibold">
              Race URL (ProCyclingStats)
            </label>
            <span className="text-[10px] text-primary/60 font-mono uppercase">
              Auto-detect enabled
            </span>
          </div>
          <div className="relative group">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline group-focus-within:text-primary" />
            <Input
              data-testid="setup-race-url-input"
              value={raceUrl}
              onChange={(e) => setRaceUrl(e.target.value)}
              placeholder="Paste race startlist URL to auto-detect riders..."
              className="pl-10"
            />
          </div>
          {profileState.status === 'loading' && (
            <div className="flex items-center gap-2 text-xs text-on-primary-container">
              <Loader2 className="h-3 w-3 animate-spin" />
              Fetching race profile from PCS...
            </div>
          )}
          {profileState.status === 'error' && (
            <Alert variant="destructive" className="mt-1">
              <AlertDescription>
                Could not fetch race profile. Check the URL and try again.
              </AlertDescription>
            </Alert>
          )}
          {profileState.status === 'success' && (
            <div className="mt-1">
              <RaceProfileSummary profile={profileState.data} />
            </div>
          )}
        </div>

        {/* Import Price List */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-body uppercase tracking-wider text-on-primary-container font-semibold">
            Import Price List
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1 group">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline group-focus-within:text-primary" />
              <Input
                data-testid="setup-game-url-input"
                value={gameUrl}
                onChange={(e) => setGameUrl(e.target.value)}
                placeholder="Fantasy platform price URL"
                className="pl-10"
              />
            </div>
            <Button
              data-testid="setup-fetch-btn"
              variant="secondary"
              onClick={handleImport}
              disabled={!gameUrl || importStatus === 'loading'}
              className="border border-primary/20"
            >
              {importStatus === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Fetch
            </Button>
          </div>
          {importStatus === 'error' && <p className="text-xs text-error">{importError}</p>}
        </div>

        <div className="h-px bg-outline-variant/10 my-2" />

        {/* Manual Rider Input */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-body uppercase tracking-wider text-on-primary-container font-semibold">
            Rider List Manual Input
          </label>
          <Textarea
            data-testid="setup-riders-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Tadej Pogacar, UAD, 500\nJonas Vingegaard, TVL, 480`}
            rows={8}
            className="font-mono text-sm"
          />
          <div className="flex gap-3 text-[10px] text-outline font-mono uppercase tracking-tighter">
            <span>Format: Name, Team, Price (One per line)</span>
            {parsedRiders.length > 0 && (
              <span data-testid="setup-valid-count" className="text-secondary">
                {parsedRiders.length} valid
              </span>
            )}
            {invalidCount > 0 && (
              <span data-testid="setup-invalid-count" className="text-tertiary">
                {invalidCount} invalid
              </span>
            )}
          </div>
        </div>

        {/* Budget */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-body uppercase tracking-wider text-on-primary-container font-semibold">
            Budget
          </label>
          <div className="relative group max-w-full">
            <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline" />
            <Input
              data-testid="setup-budget-input"
              type="number"
              min={1}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="pl-10"
            />
          </div>
        </div>

        {/* Analyze CTA */}
        <Button
          data-testid="setup-analyze-btn"
          variant="cta"
          size="lg"
          onClick={handleSubmit}
          disabled={parsedRiders.length === 0 || isLoading}
          className="mt-4 w-full py-4"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <BarChart3 className="h-4 w-4" />
              Analyze Riders
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export { parseRiderLines };
