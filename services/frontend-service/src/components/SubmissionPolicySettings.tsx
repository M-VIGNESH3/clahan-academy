import React from 'react';

interface SubmissionPolicySettingsProps {
  value: 'manual' | 'auto';
  onChange: (mode: 'manual' | 'auto') => void;
}

export const SubmissionPolicySettings: React.FC<SubmissionPolicySettingsProps> = ({ value, onChange }) => {
  const options = [
    {
      mode: 'manual',
      title: 'Manual Submission',
      desc: 'Candidates may review and modify answers before submitting manually. Submit button is visible. Timer expiry automatically submits saved answers.'
    },
    {
      mode: 'auto',
      title: 'Automatic Submission',
      desc: 'Candidates cannot submit early. Answers become locked & read-only after completing all sections. Automatic submission occurs when timer expires.'
    }
  ];

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
      <label className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
        Assessment Submission Policy
      </label>
      <p className="text-[11px] text-muted-foreground">
        Configure how candidate answers are submitted and reviewed at assessment completion.
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
              name="submissionMode"
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
