import React from 'react';
import { AlertCircle, Clock } from 'lucide-react';

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
  // Timing distribution calculations
  const configuredSections = sections.filter(s => s.duration_minutes && parseInt(String(s.duration_minutes)) > 0);
  const unconfiguredSections = sections.filter(s => !s.duration_minutes || parseInt(String(s.duration_minutes)) <= 0);

  const totalConfiguredMins = configuredSections.reduce(
    (acc, curr) => acc + parseInt(String(curr.duration_minutes || 0)),
    0
  );

  const isExceeded = timingMode === 'section' && totalConfiguredMins > totalDurationMinutes;
  const remainingMins = Math.max(0, totalDurationMinutes - totalConfiguredMins);
  const autoDistributedPerSection = unconfiguredSections.length > 0
    ? Math.floor(remainingMins / unconfiguredSections.length)
    : 0;

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <label className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
            Assessment Timing & Duration Engine
          </label>
          <p className="text-[11px] text-muted-foreground">
            Choose between a single overall timer or individual per-section timers with dynamic time distribution.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label
          className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-3 ${
            timingMode === 'overall'
              ? 'bg-indigo-600/10 border-indigo-500 text-slate-900 dark:text-white shadow-sm ring-1 ring-indigo-500/30 font-bold'
              : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
          }`}
        >
          <input
            type="radio"
            name="timingMode"
            value="overall"
            checked={timingMode === 'overall'}
            onChange={() => onTimingModeChange('overall')}
            className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="font-extrabold block text-xs">Overall Timer Only</span>
            <span className="text-[10px] text-muted-foreground font-normal leading-relaxed block mt-0.5">
              Students spend time freely across all sections under one single overall exam countdown timer.
            </span>
          </div>
        </label>

        <label
          className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-3 ${
            timingMode === 'section'
              ? 'bg-indigo-600/10 border-indigo-500 text-slate-900 dark:text-white shadow-sm ring-1 ring-indigo-500/30 font-bold'
              : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
          }`}
        >
          <input
            type="radio"
            name="timingMode"
            value="section"
            checked={timingMode === 'section'}
            onChange={() => onTimingModeChange('section')}
            className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="font-extrabold block text-xs">Per-Section Timers</span>
            <span className="text-[10px] text-muted-foreground font-normal leading-relaxed block mt-0.5">
              Each section has its own timer. Unconfigured section durations are automatically distributed equally.
            </span>
          </div>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        <div>
          <label className="text-[10px] uppercase font-bold text-muted-foreground">Total Assessment Duration (Mins)</label>
          <input
            type="number"
            value={totalDurationMinutes}
            onChange={e => onTotalDurationChange(parseInt(e.target.value) || 60)}
            className="w-full p-2.5 border rounded-xl text-xs bg-transparent mt-1 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800"
            min={1}
            required
          />
        </div>

        {timingMode === 'section' && (
          <>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Configured Section Time</label>
              <div className="w-full p-2.5 border rounded-xl text-xs bg-slate-100 dark:bg-slate-900 mt-1 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {totalConfiguredMins} Mins
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Auto-Allocated per Blank Section</label>
              <div className="w-full p-2.5 border rounded-xl text-xs bg-slate-100 dark:bg-slate-900 mt-1 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {autoDistributedPerSection} Mins / Section
              </div>
            </div>
          </>
        )}
      </div>

      {isExceeded && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>
            Validation Error: Total configured section durations ({totalConfiguredMins} Mins) exceed total assessment duration ({totalDurationMinutes} Mins). Please adjust section times before publishing.
          </span>
        </div>
      )}
    </div>
  );
};
