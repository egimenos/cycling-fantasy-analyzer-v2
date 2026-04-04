import { useState, useMemo } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search, Loader2 } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/shared/lib/utils';
import type { RaceListItem } from '@cycling-analyzer/shared-types';
import type { GmvImportState } from '../hooks/use-gmv-auto-import';

const RACE_TYPE_LABELS: Record<string, string> = {
  grand_tour: 'Grand Tour',
  mini_tour: 'Stage Race',
  classic: 'Classic',
};

interface RaceSelectorProps {
  races: RaceListItem[];
  isLoading: boolean;
  selectedRace: RaceListItem | null;
  onSelect: (race: RaceListItem | null) => void;
  gmvImportState: GmvImportState;
}

export function RaceSelector({
  races,
  isLoading,
  selectedRace,
  onSelect,
  gmvImportState,
}: RaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const filteredRaces = useMemo(() => {
    if (!typeFilter) return races;
    return races.filter((r) => r.raceType === typeFilter);
  }, [races, typeFilter]);

  const groupedByYear = useMemo(() => {
    const groups = new Map<number, RaceListItem[]>();
    for (const race of filteredRaces) {
      const existing = groups.get(race.year) ?? [];
      existing.push(race);
      groups.set(race.year, existing);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b - a);
  }, [filteredRaces]);

  const selectedLabel = selectedRace
    ? `${selectedRace.raceName} (${selectedRace.year})`
    : 'Search races...';

  return (
    <div className="space-y-2">
      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1.5">
        <FilterPill active={typeFilter === null} onClick={() => setTypeFilter(null)}>
          All
        </FilterPill>
        {Object.entries(RACE_TYPE_LABELS).map(([value, label]) => (
          <FilterPill
            key={value}
            active={typeFilter === value}
            onClick={() => setTypeFilter(typeFilter === value ? null : value)}
          >
            {label}
          </FilterPill>
        ))}
      </div>

      {/* Combobox */}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            role="combobox"
            aria-expanded={open}
            data-testid="race-selector-trigger"
            className={cn(
              'flex h-9 w-full items-center justify-between rounded-sm border-none bg-surface-container-high px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-fixed disabled:cursor-not-allowed disabled:opacity-50',
              !selectedRace && 'text-outline/70',
            )}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading races...
              </span>
            ) : (
              <span className="truncate">{selectedLabel}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className="z-50 w-[var(--radix-popover-trigger-width)] rounded-sm border border-outline-variant/15 bg-surface-container-high shadow-lg"
            sideOffset={4}
            align="start"
          >
            <Command className="w-full">
              <div className="flex items-center border-b border-outline-variant/15 px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <Command.Input
                  data-testid="race-selector-input"
                  placeholder="Search races..."
                  className="flex h-9 w-full bg-transparent py-2 text-sm text-on-surface outline-none placeholder:text-outline/70"
                />
              </div>
              <Command.List className="max-h-60 overflow-y-auto p-1">
                <Command.Empty className="py-4 text-center text-sm text-outline">
                  No races found.
                </Command.Empty>
                {groupedByYear.map(([year, yearRaces]) => (
                  <Command.Group key={year} heading={String(year)} className="text-xs text-outline">
                    {yearRaces.map((race) => {
                      const isSelected =
                        selectedRace?.raceSlug === race.raceSlug &&
                        selectedRace?.year === race.year;
                      return (
                        <Command.Item
                          key={`${race.raceSlug}-${race.year}`}
                          value={`${race.raceName} ${race.year}`}
                          data-testid="race-selector-item"
                          onSelect={() => {
                            onSelect(isSelected ? null : race);
                            setOpen(false);
                          }}
                          className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-on-surface outline-none data-[selected=true]:bg-surface-container-highest"
                        >
                          <Check
                            className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')}
                          />
                          <span className="flex-1 truncate">{race.raceName}</span>
                          <span className="ml-2 text-xs text-outline">
                            {RACE_TYPE_LABELS[race.raceType] ?? race.raceType}
                          </span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* GMV import status */}
      <GmvImportStatus state={gmvImportState} />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-on-primary'
          : 'border-outline-variant/30 text-outline hover:bg-surface-container-highest',
      )}
    >
      {children}
    </button>
  );
}

function GmvImportStatus({ state }: { state: GmvImportState }) {
  if (state.status === 'idle') return null;

  return (
    <div data-testid="gmv-import-status" className="text-xs">
      {state.status === 'loading' && (
        <span className="flex items-center gap-1.5 text-outline">
          <Loader2 className="h-3 w-3 animate-spin" />
          Searching for price list...
        </span>
      )}
      {state.status === 'success' && state.data.matched && (
        <span className="flex items-center gap-1.5 text-green-400">
          <Check className="h-3 w-3" />
          Found: {state.data.postTitle}
        </span>
      )}
      {state.status === 'success' && !state.data.matched && (
        <span className="text-yellow-400">No price list found for this race</span>
      )}
      {state.status === 'error' && (
        <span className="text-red-400">Failed to search for price list</span>
      )}
    </div>
  );
}
