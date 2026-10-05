import { useState } from 'react';
import { useSaveSearchPreset, useSearchPresets } from '../api/hooks';
import type { SearchPresetCriteria } from '../api/types';

export function SearchPresets({ criteria, onLoad, searching }: {
  criteria: SearchPresetCriteria;
  onLoad: (criteria: SearchPresetCriteria) => void;
  searching: boolean;
}) {
  const presets = useSearchPresets();
  const save = useSaveSearchPreset();
  const [name, setName] = useState('');

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">Saved search presets</h2>
      <p className="text-xs text-slate-400">Load a preset, adjust the fields, then click Search. Presets never run automatically.</p>
      <div className="flex flex-wrap gap-2">
        {presets.data?.map((preset) => (
          <button key={preset.id} className="btn" disabled={searching || save.isPending} onClick={() => {
            setName(preset.name);
            save.reset();
            onLoad(preset);
          }}>{preset.name}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-300">
          Preset name
          <input className="input mt-1" maxLength={80} value={name} placeholder="Name this search"
            onChange={(e) => { setName(e.target.value); save.reset(); }} />
        </label>
        <button className="btn" disabled={!name.trim() || !criteria.sites.length || searching || save.isPending}
          onClick={() => save.mutate({ ...criteria, name: name.trim() })}>
          {save.isPending ? 'Saving…' : 'Save preset'}
        </button>
      </div>
      <p className="text-xs text-slate-400">Saves the fields below. Using an existing name replaces that preset.</p>
      {presets.isError && <p role="status" className="text-sm text-red-400">Saved presets could not be loaded.</p>}
      {save.isError && <p role="status" className="text-sm text-red-400">The preset could not be saved. Please try again.</p>}
      {save.isSuccess && <p role="status" className="text-sm text-emerald-300">Preset saved.</p>}
    </div>
  );
}
