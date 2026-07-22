import React from 'react';
import { Clock, CheckCircle, HelpCircle, ArrowLeft, ArrowRight, Lock } from 'lucide-react';

interface QuestionFooterProps {
  currentSectionTimerStr?: string | null;
  overallTimerStr: string;
  activeQuestionIndex: number;
  totalSectionQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  isExamLocked: boolean;
  navigationMode: string;
  submissionMode?: 'manual' | 'auto';
  onPrevious: () => void;
  onNext: () => void;
  onSubmitSection: () => void;
}

export const QuestionFooter: React.FC<QuestionFooterProps> = ({
  currentSectionTimerStr,
  overallTimerStr,
  activeQuestionIndex,
  totalSectionQuestions,
  answeredCount,
  unansweredCount,
  isFirstQuestion,
  isLastQuestion,
  isExamLocked,
  navigationMode,
  submissionMode = 'manual',
  onPrevious,
  onNext,
  onSubmitSection
}) => {
  const isLockedMode = navigationMode === 'locked' || navigationMode === 'sequential_locked';
  const isAutoSubmission = submissionMode === 'auto';

  return (
    <footer className="flex-shrink-0 bg-slate-900 border-t border-white/10 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-4 z-30 relative select-none">
      {/* Timers & Counters Left Display */}
      <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
        {currentSectionTimerStr && (
          <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl text-indigo-300 font-bold">
            <Clock className="h-3.5 w-3.5 text-indigo-400" />
            <span>Section: <strong className="text-white">{currentSectionTimerStr}</strong></span>
          </div>
        )}

        <div className="flex items-center gap-1.5 bg-slate-950 border border-white/10 px-3 py-1.5 rounded-xl text-slate-300 font-bold">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          <span>Overall: <strong className="text-white">{overallTimerStr}</strong></span>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-white/5 text-[11px]">
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> {answeredCount} Answered
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-rose-400 font-bold flex items-center gap-1">
            <HelpCircle className="h-3 w-3" /> {unansweredCount} Unanswered
          </span>
        </div>

        {isAutoSubmission && (
          <span className="text-[10px] text-amber-400 font-sans font-extrabold bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg animate-pulse">
            Auto-Submit Active: Assessment submits automatically when timer expires.
          </span>
        )}
      </div>

      {/* Progress & Action Buttons Right Display */}
      <div className="flex items-center gap-2.5">
        <span className="hidden md:inline-block text-xs font-mono font-bold text-slate-400 mr-1">
          Q {totalSectionQuestions > 0 ? activeQuestionIndex + 1 : 0} of {totalSectionQuestions}
        </span>

        <button
          onClick={onPrevious}
          disabled={isExamLocked || isFirstQuestion}
          className="px-4 py-2 border border-white/10 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent flex items-center gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Previous Question
        </button>

        <button
          onClick={onNext}
          disabled={isExamLocked || isLastQuestion}
          className="px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 font-bold rounded-xl text-xs transition-colors disabled:opacity-30 flex items-center gap-1.5"
        >
          Next Question <ArrowRight className="h-3.5 w-3.5" />
        </button>

        {!isAutoSubmission && (
          <button
            onClick={onSubmitSection}
            disabled={isExamLocked}
            className={`px-5 py-2 font-extrabold rounded-xl text-xs transition-all shadow-md flex items-center gap-1.5 ml-1 ${
              isLockedMode
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
            } ${isExamLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Lock className="h-3.5 w-3.5" /> Submit Section
          </button>
        )}
      </div>
    </footer>
  );
};
