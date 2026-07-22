import React from 'react';
import { AlertTriangle, Clock, CheckCircle, HelpCircle, Lock, ArrowRight, X } from 'lucide-react';

interface SectionConfirmationModalProps {
  isOpen: boolean;
  sectionName: string;
  timeRemainingStr: string; // "08:42" or "No time limit"
  answeredCount: number;
  unansweredCount: number;
  totalCount: number;
  navigationMode: 'free' | 'locked' | 'sequential' | 'sequential_locked' | string;
  isLastSection: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const SectionConfirmationModal: React.FC<SectionConfirmationModalProps> = ({
  isOpen,
  sectionName,
  timeRemainingStr,
  answeredCount,
  unansweredCount,
  totalCount,
  navigationMode,
  isLastSection,
  onCancel,
  onConfirm
}) => {
  if (!isOpen) return null;

  const isLockedMode = navigationMode === 'locked' || navigationMode === 'sequential_locked';

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn select-none">
      <div className="max-w-lg w-full bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        
        {/* Top Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Finish Current Section?</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                You are about to leave Section: <span className="text-indigo-400 font-bold">{sectionName}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onCancel}
            className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Section Metrics Grid */}
        <div className="grid grid-cols-3 gap-3 bg-slate-950/60 p-4 rounded-2xl border border-white/5 font-mono text-center">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-slate-400 flex items-center justify-center gap-1">
              <Clock className="h-3 w-3 text-indigo-400" /> Time Remaining
            </span>
            <span className="text-sm font-extrabold text-white block">
              {timeRemainingStr}
            </span>
          </div>

          <div className="space-y-1 border-x border-white/5">
            <span className="text-[9px] uppercase font-bold text-slate-400 flex items-center justify-center gap-1">
              <CheckCircle className="h-3 w-3 text-emerald-400" /> Answered
            </span>
            <span className="text-sm font-extrabold text-emerald-400 block">
              {answeredCount} / {totalCount}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-slate-400 flex items-center justify-center gap-1">
              <HelpCircle className="h-3 w-3 text-rose-400" /> Unanswered
            </span>
            <span className="text-sm font-extrabold text-rose-400 block">
              {unansweredCount}
            </span>
          </div>
        </div>

        {/* Warning / Rules Box */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-slate-300 space-y-2">
          <div className="font-bold text-amber-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            {isLockedMode ? 'Irreversible Action Notice' : 'Section Completion Review'}
          </div>
          {isLockedMode ? (
            <ul className="space-y-1.5 list-disc list-inside text-[11px] text-slate-300">
              <li>Once you leave this section you <strong className="text-rose-400">WILL NOT</strong> be able to return.</li>
              <li>Your answers for <strong className="text-white">{sectionName}</strong> will be permanently saved and locked.</li>
              <li>The section timer for this section will stop.</li>
              <li>{isLastSection ? 'Your final assessment will be ready for submission.' : 'Your next section will begin immediately.'}</li>
            </ul>
          ) : (
            <p className="text-[11px] leading-relaxed">
              You can revisit this section later before the overall exam timer ends. Please review your answers before continuing.
            </p>
          )}
        </div>

        <p className="text-xs font-semibold text-slate-400 text-center">
          Please review your answers before continuing.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            Submit Section & Continue <ArrowRight className="h-4 w-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
