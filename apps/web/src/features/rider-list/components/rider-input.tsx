import { useState, useMemo, useCallback } from 'react';
import type {
  PriceListEntryDto,
  ProfileSummary,
  RaceListItem,
} from '@cycling-analyzer/shared-types';
import { RaceType } from '@cycling-analyzer/shared-types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Loader2, Download, Globe, Link, BarChart3, Settings, ChevronDown } from 'lucide-react';
import type { useRaceProfile } from '../hooks/use-race-profile';
import type { GmvImportState } from '../hooks/use-gmv-auto-import';
import { RaceProfileSummary } from './race-profile-summary';
import { RaceSelector } from './race-selector';
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
  budget: number;
  onBudgetChange: (budget: number) => void;
  profileState: ReturnType<typeof useRaceProfile>;
  // Race selector props
  races: RaceListItem[];
  raceCatalogLoading: boolean;
  selectedRace: RaceListItem | null;
  onRaceSelect: (race: RaceListItem | null) => void;
  upcomingOnly: boolean;
  onUpcomingChange: (value: boolean) => void;
  gmvImportState: GmvImportState;
  // Manual fallback props
  raceUrl: string;
  onRaceUrlChange: (url: string) => void;
  gameUrl: string;
  onGameUrlChange: (url: string) => void;
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
  budget,
  onBudgetChange: setBudget,
  profileState,
  races,
  raceCatalogLoading,
  selectedRace,
  onRaceSelect,
  upcomingOnly,
  onUpcomingChange,
  gmvImportState,
  raceUrl,
  onRaceUrlChange: setRaceUrl,
  gameUrl,
  onGameUrlChange: setGameUrl,
}: RiderInputProps) {
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [importError, setImportError] = useState('');
  const [showManual, setShowManual] = useState(false);

  const raceType =
    profileState.status === 'success'
      ? profileState.data.raceType
      : (selectedRace?.raceType ?? RaceType.GRAND_TOUR);

  const parsedRiders = useMemo(() => parseRiderLines(text), [text]);
  const lineCount = text.split('\n').filter((l) => l.trim().length > 0).length;
  const invalidCount = lineCount - parsedRiders.length;

  // Auto-expand manual fallback when GMV match fails
  const shouldShowManual =
    showManual ||
    (gmvImportState.status === 'success' && !gmvImportState.data.matched) ||
    gmvImportState.status === 'error';

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
    // raceSlug/year come from the selected race (combobox) — don't gate on profile success
    const raceSlug =
      selectedRace?.raceSlug ??
      (profileState.status === 'success' ? profileState.data.raceSlug : undefined);
    const year =
      selectedRace?.year ??
      (profileState.status === 'success' ? profileState.data.year : undefined);
    onAnalyze(parsedRiders, raceType, budget, profileSummary, raceSlug, year);
  };

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <header className="flex-shrink-0">
        <span className="text-secondary font-mono text-xs tracking-widest uppercase mb-1 flex items-center gap-1.5">
          <Settings className="h-3.5 w-3.5" />
          Analysis Engine
        </span>
        <h1 className="text-2xl lg:text-xl font-headline font-extrabold text-on-surface tracking-tight">
          Roster Setup
        </h1>
      </header>

      <div className="bg-surface-container-low rounded-sm p-4 md:p-5 flex flex-col gap-4 shadow-xl border border-outline-variant/15 lg:overflow-y-auto lg:min-h-0 lg:flex-1">
        {/* Race Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-body uppercase tracking-wider text-on-primary-container font-semibold">
            Select Race
          </label>
          <RaceSelector
            races={races}
            isLoading={raceCatalogLoading}
            selectedRace={selectedRace}
            onSelect={onRaceSelect}
            upcomingOnly={upcomingOnly}
            onUpcomingChange={onUpcomingChange}
            gmvImportState={gmvImportState}
          />
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

        {/* Manual URL fallback (collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowManual(!showManual)}
            className="flex items-center gap-1.5 text-xs text-outline hover:text-on-surface transition-colors"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${shouldShowManual ? 'rotate-0' : '-rotate-90'}`}
            />
            Enter URLs manually
          </button>

          {shouldShowManual && (
            <div className="mt-3 flex flex-col gap-4 rounded-sm border border-outline-variant/10 bg-surface-container/50 p-4">
              {/* Race URL */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="race-url"
                  className="text-xs font-body uppercase tracking-wider text-on-primary-container font-semibold"
                >
                  Race URL (ProCyclingStats)
                </label>
                <div className="relative group">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline group-focus-within:text-primary" />
                  <Input
                    id="race-url"
                    data-testid="setup-race-url-input"
                    value={raceUrl}
                    onChange={(e) => setRaceUrl(e.target.value)}
                    placeholder="Paste race startlist URL to auto-detect riders..."
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Import Price List */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="game-url"
                  className="text-xs font-body uppercase tracking-wider text-on-primary-container font-semibold"
                >
                  Import Price List
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1 group">
                    <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline group-focus-within:text-primary" />
                    <Input
                      id="game-url"
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
            </div>
          )}
        </div>

        <div className="h-px bg-outline-variant/10" />

        {/* Manual Rider Input */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="riders-textarea"
            className="text-xs font-body uppercase tracking-wider text-on-primary-container font-semibold"
          >
            Rider List Manual Input
          </label>
          <Textarea
            id="riders-textarea"
            data-testid="setup-riders-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Tadej Pogacar, UAD, 500\nJonas Vingegaard, TVL, 480`}
            rows={3}
            className="font-mono text-sm"
          />
          <div
            className="flex gap-3 text-[10px] text-outline font-mono uppercase tracking-tighter"
            aria-live="polite"
          >
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
          <label
            htmlFor="budget-input"
            className="text-xs font-body uppercase tracking-wider text-on-primary-container font-semibold"
          >
            Budget
          </label>
          <div className="relative group max-w-full">
            <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline" />
            <Input
              id="budget-input"
              data-testid="setup-budget-input"
              type="number"
              min={1}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Analyze CTA — outside card so it's always visible */}
      <Button
        data-testid="setup-analyze-btn"
        variant="cta"
        size="lg"
        onClick={handleSubmit}
        disabled={parsedRiders.length === 0 || isLoading}
        className="w-full py-3.5 flex-shrink-0"
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
  );
}

export { parseRiderLines };
