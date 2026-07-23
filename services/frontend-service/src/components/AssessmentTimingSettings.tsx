import React from 'react';
import { Clock, CheckCircle2 } from 'lucide-react';

interface AssessmentTimingSettingsProps {
  timingMode: 'overall' | 'section';
  totalDurationMinutes: number;
  sections: Array<{ id: string; name: string; duration_minutes?: number | string | null }>;
  onTimingModeChange: (mode: 'overall' | 'section') => void;
  onTotalDurationChange: (mins: number) => void;
}

export const AssessmentTimingSettings: React.FC<AssessmentTimingSettingsProps> = ({
  timingMode,
  totalDurationMinutes,
  sections,
  onTimingModeChange,
  onTotalDurationChange
}) => {
  const count = Math.max(1, sections.length);
  const baseMins = Math.floor(totalDurationMinutes / count);
  const remainderMins = totalDurationMinutes - (baseMins * count);

  return (
    <div className="p-5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm">
      <div className="flex justify-between items-center">
        <div>
          <label className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Assessment Duration & Automated Timing Engine
          </label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Admin sets the overall assessment duration. Section time limits are automatically calculated and balanced across all sections.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] uppercase font-extrabold text-slate-500 block mb-1">
            Total Assessment Duration (Minutes)
          </label>
          <input
            type="number"
            value={totalDurationMinutes}
            onChange={e => onTotalDurationChange(Math.max(1, parseInt(e.target.value) || 60))}
            className="w-full p-3 border rounded-xl text-sm font-bold bg-white dark:bg-slate-950 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500"
            min={1}
            required
          />
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-extrabold text-emerald-500 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Automated Section Allocation
          </span>
          <p className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
            {sections.length > 0
              ? `${sections.length} Sections • ~${baseMins} Mins per Section`
              : 'Add sections to see dynamic per-section time allocation'}
          </p>
          <span className="text-[10px] text-muted-foreground block">
            {remainderMins > 0 ? `${remainderMins} extra minute(s) distributed to initial sections` : 'Equal distribution across all sections'}
          </span>
        </div>
      </div>

      {sections.length > 0 && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-2">Live Allocated Section Durations</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {sections.map((sec, idx) => {
              const allocated = baseMins + (idx < remainderMins ? 1 : 0);
              return (
                <div key={sec.id || idx} className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-center">
                  <span className="text-[10px] font-bold text-indigo-400 block truncate">{sec.name}</span>
                  <span className="text-xs font-mono font-extrabold text-slate-900 dark:text-white">{allocated} Mins</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
