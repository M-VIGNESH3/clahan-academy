import React, { useState } from 'react';
import { CheckCircle, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';

interface ExamSubmissionControllerProps {
  onExecuteSubmission: () => Promise<{ success: boolean; score?: number; passed?: boolean; error?: string }>;
  onFinalizeAndNavigate: (mode: 'result' | 'exit') => void;
  onCancelConfirm: () => void;
}

export const ExamSubmissionController: React.FC<ExamSubmissionControllerProps> = ({
  onExecuteSubmission,
  onFinalizeAndNavigate,
  onCancelConfirm
}) => {
  const [phase, setPhase] = useState<'confirm' | 'submitting' | 'submitted_success' | 'error'>('confirm');
  const [resultSummary, setResultSummary] = useState<{ score?: number; passed?: boolean; error?: string } | null>(null);

  const startSubmit = async () => {
    setPhase('submitting');
    try {
      const res = await onExecuteSubmission();
      if (res.success) {
        setResultSummary({ score: res.score, passed: res.passed });
        setPhase('submitted_success');
      } else {
        setResultSummary({ error: res.error || 'Failed to submit responses.' });
        setPhase('error');
      }
    } catch (err: any) {
      setResultSummary({ error: err.message || 'Submission failed.' });
      setPhase('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
      {/* 1. Confirmation Modal (STILL FULLSCREEN) */}
      {phase === 'confirm' && (
        <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 text-center">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">Confirm Assessment Submission</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Are you sure you want to finalize and submit your assessment? Once submitted, you cannot change your answers.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancelConfirm}
              className="flex-1 py-3 text-xs font-extrabold border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              Continue Test
            </button>
            <button
              onClick={startSubmit}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-500/20"
            >
              Confirm & Submit
            </button>
          </div>
        </div>
      )}

      {/* 2. Submitting Overlay (STILL FULLSCREEN) */}
      {phase === 'submitting' && (
        <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>

          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">Submitting Assessment...</h3>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-2">
              Saving your answers... Please wait...
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Do not close your browser window or exit fullscreen mode.
            </p>
          </div>
        </div>
      )}

      {/* 3. Submitted Success Confirmation Modal (STILL FULLSCREEN) */}
      {phase === 'submitted_success' && (
        <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-slate-950 border border-emerald-500/30 shadow-2xl space-y-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8" />
          </div>

          <div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              SUBMITTED SUCCESSFULLY
            </span>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mt-3">Assessment Submitted</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Your responses have been securely recorded. Click below to view your performance report or exit.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => onFinalizeAndNavigate('result')}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              View Result Report <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onFinalizeAndNavigate('exit')}
              className="w-full py-3 text-xs font-bold border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              Exit Assessment
            </button>
          </div>
        </div>
      )}

      {/* 4. Error Phase */}
      {phase === 'error' && (
        <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-slate-950 border border-rose-500/30 shadow-2xl space-y-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <div>
            <h3 className="text-xl font-black text-rose-600 dark:text-rose-400">Submission Error</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {resultSummary?.error || 'Network interruption saving responses. Retry submission.'}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={startSubmit}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-500/20"
            >
              Retry Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
