import { useState } from 'react';
import { useCheckPreset, useDiscoveryAutomation, useSaveSearchPreset, useSearchPresets } from '../api/hooks';
import type { SearchPreset, SearchPresetCriteria } from '../api/types';
import { ApiError } from './ApiError';

export function SearchPresets({ criteria, onLoad, onReview, searching }: {
  criteria: SearchPresetCriteria;
  onLoad: (criteria: SearchPresetCriteria) => void;
  onReview: (id: string, criteria: SearchPresetCriteria) => void;
  searching: boolean;
}) {
  const presets = useSearchPresets();
  const save = useSaveSearchPreset();
  const [name, setName] = useState('');
  const [automatic, setAutomatic] = useState(false);
  const check = useCheckPreset();
  const automation = useDiscoveryAutomation();
  const select = (preset: SearchPreset, review: boolean) => {
    setName(preset.name);
    setAutomatic(preset.automatic ?? false);
    save.reset();
    if (review) onReview(preset.id, preset); else onLoad(preset);
  };

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">Saved search presets</h2>
      <p className="text-xs text-slate-400">Load a preset to edit its fields. Check a saved preset to retain matches, then review and save selected adverts to the tracker.</p>
      <div className="space-y-2">
        {presets.data?.map((preset) => {
          const running = Boolean(preset.runningUntil && new Date(preset.runningUntil) > new Date());
          return <div key={preset.id} className="flex flex-wrap items-center gap-2">
          <button className="btn" disabled={searching || save.isPending} onClick={() => select(preset, false)}>{preset.name}</button>
          <button className="btn" disabled={running || searching || check.isPending} onClick={() => {
            check.mutate(preset.id, { onSuccess: () => select(preset, true) });
          }}>Check {preset.name}</button>
          <button className="btn" disabled={searching} onClick={() => select(preset, true)}>Review {preset.name}</button>
          <span className="text-xs text-slate-400">
            {preset.automatic ? 'Automatic · ' : 'Manual · '}
            {running ? 'Checking…' : preset.lastCheckedAt ? `Checked ${new Date(preset.lastCheckedAt).toLocaleString()} · ${preset.lastNewCount ?? 0} new matches` : 'Not checked yet'}
            {preset.runningUntil && !running && ' · previous check interrupted; check again'}
          </span>
          {preset.lastErrors?.map((error) => <p key={error.site} role="status" className="w-full text-xs text-amber-300">{error.site}: {error.message}</p>)}
          </div>;
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-300">
          Preset name
          <input className="input mt-1" maxLength={80} value={name} placeholder="Name this search"
            onChange={(e) => { setName(e.target.value); save.reset(); }} />
        </label>
        <button className="btn" disabled={!name.trim() || !criteria.sites.length || searching || save.isPending}
          onClick={() => save.mutate({ ...criteria, name: name.trim(), automatic })}>
          {save.isPending ? 'Saving…' : 'Save preset'}
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} />
        Run this preset automatically at 08:00 and 17:00{automation.data?.timezone ? ` (${automation.data.timezone})` : ''}
      </label>
      <p className="text-xs text-slate-400">Saving updates the schedule; it does not start a check. External notifications are off.</p>
      <p className="text-xs text-slate-400">Saves the fields below. Using an existing name replaces that preset.</p>
      {presets.isError && <ApiError error={presets.error} fallback="Saved presets could not be loaded." />}
      {save.isError && <ApiError error={save.error} fallback="The preset could not be saved. Please try again." />}
      {check.isError && <ApiError error={check.error} fallback="The saved search could not be started." />}
      {save.isSuccess && <p role="status" className="text-sm text-emerald-300">Preset saved.</p>}
    </div>
  );
}
