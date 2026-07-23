import React from 'react';
import { AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

export interface SectionTimingItem {
  id: string;
  name: string;
  isManual: boolean;
  manualDuration: number | null;
  effectiveDuration: number;
}

export interface SectionTimingSummary {
  overallDuration: number;
  manualTotal: number;
  autoTotal: number;
  remainingTime: number;
  isValid: boolean;
  validationError: string | null;
  items: SectionTimingItem[];
}

export function computeSectionTimingSummary(
  overallDuration: number,
  sections: Array<{ id: string; name: string; duration_minutes?: number | string | null }>
): SectionTimingSummary {
  const safeOverall = Math.max(1, overallDuration || 60);
  let manualTotal = 0;
  const manualSections: Array<{ index: number; duration: number }> = [];
  const blankSectionIndices: number[] = [];

  sections.forEach((sec, idx) => {
    const raw = sec.duration_minutes;
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      const parsed = parseInt(String(raw), 10);
      if (!isNaN(parsed) && parsed > 0) {
        manualTotal += parsed;
        manualSections.push({ index: idx, duration: parsed });
      } else {
        blankSectionIndices.push(idx);
      }
    } else {
      blankSectionIndices.push(idx);
    }
  });

  const remainingForBlank = safeOverall - manualTotal;
  const blankCount = blankSectionIndices.length;
  const isValid = remainingForBlank >= 0;

  let validationError: string | null = null;
  if (!isValid) {
    validationError = `Cannot publish assessment. Total manual section durations (${manualTotal} Mins) exceed total assessment duration (${safeOverall} Mins).`;
  }

  const items: SectionTimingItem[] = new Array(sections.length);

  manualSections.forEach(m => {
    items[m.index] = {
      id: sections[m.index].id,
      name: sections[m.index].name,
      isManual: true,
      manualDuration: m.duration,
      effectiveDuration: m.duration
    };
  });

  let autoTotal = 0;
  if (blankCount > 0) {
    if (remainingForBlank > 0) {
      const baseAlloc = Math.floor(remainingForBlank / blankCount);
      const remainder = remainingForBlank % blankCount;

      blankSectionIndices.forEach((secIdx, i) => {
        const extra = i < remainder ? 1 : 0;
        const allocated = baseAlloc + extra;
        autoTotal += allocated;
        items[secIdx] = {
          id: sections[secIdx].id,
          name: sections[secIdx].name,
          isManual: false,
          manualDuration: null,
          effectiveDuration: allocated
        };
      });
    } else {
      blankSectionIndices.forEach(secIdx => {
        items[secIdx] = {
          id: sections[secIdx].id,
          name: sections[secIdx].name,
          isManual: false,
          manualDuration: null,
          effectiveDuration: 0
        };
      });
    }
  }

  const remainingTime = safeOverall - manualTotal - autoTotal;

  return {
    overallDuration: safeOverall,
    manualTotal,
    autoTotal,
    remainingTime,
    isValid,
    validationError,
    items
  };
}

interface AssessmentTimingSettingsProps {
  totalDurationMinutes: number;
  sections: Array<{ id: string; name: string; duration_minutes?: number | string | null }>;
  onTotalDurationChange: (mins: number) => void;
}

export const AssessmentTimingSettings: React.FC<AssessmentTimingSettingsProps> = ({
  totalDurationMinutes,
  sections,
  onTotalDurationChange
}) => {
  const summary = computeSectionTimingSummary(totalDurationMinutes, sections);

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 font-sans">
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <label className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Assessment Duration & Dynamic Timing Engine
          </label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Define total assessment duration. Manually set section times are preserved; remaining time is automatically distributed across unconfigured sections.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Total Duration Control */}
        <div className="p-3 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl">
          <label className="text-[10px] uppercase font-bold text-muted-foreground block">
            Overall Duration (Mins)
          </label>
          <input
            type="number"
            value={totalDurationMinutes}
            onChange={e => onTotalDurationChange(parseInt(e.target.value, 10) || 60)}
            className="w-full p-2 border rounded-lg text-sm bg-transparent mt-1 text-slate-900 dark:text-white font-mono font-bold border-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            min={1}
            required
          />
        </div>

        {/* Manual Time Summary */}
        <div className="p-3 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
          <label className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block">
            Manual Section Time
          </label>
          <div className="text-base font-mono font-black text-indigo-600 dark:text-indigo-400 mt-1">
            {summary.manualTotal} Mins
          </div>
          <span className="text-[9px] text-muted-foreground block mt-0.5">Fixed manual durations</span>
        </div>

        {/* Auto Allocated Time Summary */}
        <div className="p-3 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <label className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
            Auto-Allocated Time
          </label>
          <div className="text-base font-mono font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {summary.autoTotal} Mins
          </div>
          <span className="text-[9px] text-muted-foreground block mt-0.5">Distributed to blank sections</span>
        </div>

        {/* Remaining Time Summary */}
        <div className={`p-3 border rounded-xl ${
          summary.isValid 
            ? 'bg-slate-100 dark:bg-slate-955 border-slate-200 dark:border-slate-800' 
            : 'bg-rose-500/10 border-rose-500/30'
        }`}>
          <label className={`text-[10px] uppercase font-bold block ${summary.isValid ? 'text-muted-foreground' : 'text-rose-500'}`}>
            Remaining Unallocated
          </label>
          <div className={`text-base font-mono font-black mt-1 ${summary.isValid ? 'text-slate-700 dark:text-slate-300' : 'text-rose-500'}`}>
            {summary.remainingTime} Mins
          </div>
          <span className="text-[9px] text-muted-foreground block mt-0.5">Must equal 0 mins</span>
        </div>
      </div>

      {/* Per Section Allocation Live Breakdown */}
      {sections.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <label className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider block">
            Live Section Timing Distribution ({sections.length} Sections)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {summary.items.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-2.5 rounded-xl border bg-white dark:bg-slate-955 border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
              >
                <div className="truncate mr-2">
                  <span className="font-bold block text-slate-800 dark:text-slate-200 truncate">{item.name}</span>
                  <span className={`text-[9px] font-extrabold uppercase ${
                    item.isManual 
                      ? 'text-indigo-600 dark:text-indigo-400' 
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {item.isManual ? 'Manual Configured' : 'Auto Allocated'}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="font-mono font-black text-slate-900 dark:text-white text-xs block">
                    {item.effectiveDuration} Mins
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Validation Error Banner */}
      {!summary.isValid && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{summary.validationError}</span>
        </div>
      )}
    </div>
  );
};
