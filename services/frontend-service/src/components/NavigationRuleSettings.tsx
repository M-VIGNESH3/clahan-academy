import React from 'react';

interface NavigationRuleSettingsProps {
  value: 'free' | 'locked' | 'sequential' | 'sequential_locked';
  onChange: (mode: 'free' | 'locked' | 'sequential' | 'sequential_locked') => void;
}

export const NavigationRuleSettings: React.FC<NavigationRuleSettingsProps> = ({ value, onChange }) => {
  const options = [
    {
      mode: 'free',
      title: 'Option A: Free Navigation (Default)',
      desc: 'Candidates can freely navigate and switch between any section until overall time expires. No confirmation popup required.'
    },
    {
      mode: 'locked',
      title: 'Option B: Locked Navigation',
      desc: 'Candidates can switch sections freely, but once a section is completed/submitted, it becomes permanently locked against editing.'
    },
    {
      mode: 'sequential',
      title: 'Option C: Sequential Navigation',
      desc: 'Candidates must attempt sections in strict order. Candidates cannot jump ahead to future sections, but may return to previous sections.'
    },
    {
      mode: 'sequential_locked',
      title: 'Option D: Sequential Locked Navigation',
      desc: 'Candidates must complete sections in strict order. Submitting a section permanently locks it from being revisited.'
    }
  ];

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
      <label className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
        Candidate Section Navigation Rule
      </label>
      <p className="text-[11px] text-muted-foreground">
        Configure how candidates navigate between assessment sections during their proctored attempt.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {options.map(opt => (
          <label
            key={opt.mode}
            className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-3 ${
              value === opt.mode
                ? 'bg-indigo-600/10 border-indigo-500 text-slate-900 dark:text-white shadow-sm ring-1 ring-indigo-500/30 font-bold'
                : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
            }`}
          >
            <input
              type="radio"
              name="navigationMode"
              value={opt.mode}
              checked={value === opt.mode}
              onChange={() => onChange(opt.mode as any)}
              className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="font-extrabold block text-xs">{opt.title}</span>
              <span className="text-[10px] text-muted-foreground font-normal leading-relaxed block mt-0.5">{opt.desc}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};
