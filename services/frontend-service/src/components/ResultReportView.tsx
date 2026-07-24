import React from 'react';
import { Award, CheckCircle, XCircle, Clock, AlertTriangle, ArrowRight, BarChart2, PieChart, Shield, User, FileText } from 'lucide-react';

export interface ResultReportProps {
  examName: string;
  candidateName: string;
  rollNumber: string;
  submissionTime: string;
  timeTakenSeconds: number;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  cutoffPercentage: number;
  mcqScore?: number;
  mcqMaxScore?: number;
  codingScore?: number;
  codingMaxScore?: number;
  answeredCount?: number;
  skippedCount?: number;
  correctCount?: number;
  wrongCount?: number;
  totalQuestions?: number;
  hiddenTestCasesPassed?: number;
  totalHiddenTestCases?: number;
  visibleTestCasesPassed?: number;
  totalVisibleTestCases?: number;
  sectionBreakdown?: Array<{
    name: string;
    obtainedMarks: number;
    maxMarks: number;
    percentage: number;
  }>;
  feedback?: string;
  onExit: () => void;
}

export const ResultReportView: React.FC<ResultReportProps> = ({
  examName,
  candidateName,
  rollNumber,
  submissionTime,
  timeTakenSeconds,
  score,
  maxScore,
  percentage,
  passed,
  cutoffPercentage,
  mcqScore = 0,
  mcqMaxScore = 0,
  codingScore = 0,
  codingMaxScore = 0,
  answeredCount = 0,
  skippedCount = 0,
  correctCount = 0,
  wrongCount = 0,
  totalQuestions = 0,
  hiddenTestCasesPassed = 0,
  totalHiddenTestCases = 0,
  visibleTestCasesPassed = 0,
  totalVisibleTestCases = 0,
  sectionBreakdown = [],
  feedback,
  onExit
}) => {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}m ${s}s`;
  };

  // Circular SVG progress math
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 font-sans space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-8 rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
              passed
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
            }`}>
              {passed ? 'PASSED ASSESSMENT' : 'FAILED ASSESSMENT'}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Cutoff: {cutoffPercentage}%
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {examName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
            <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> {candidateName} ({rollNumber})</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> Time Taken: {formatTime(timeTakenSeconds)}</span>
            <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> Submitted: {new Date(submissionTime).toLocaleString()}</span>
          </div>
        </div>

        <button
          onClick={onExit}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] shrink-0"
        >
          Return to Dashboard
        </button>
      </div>

      {/* Main Scorecard Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Animated Circular Score Widget */}
        <div className="lg:col-span-1 p-8 rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Overall Score Indicator</h3>
          
          <div className="relative flex items-center justify-center">
            <svg className="w-44 h-44 transform -rotate-90">
              <circle
                cx="88"
                cy="88"
                r={radius}
                className="stroke-slate-100 dark:stroke-slate-800"
                strokeWidth="12"
                fill="transparent"
              />
              <circle
                cx="88"
                cy="88"
                r={radius}
                className={`transition-all duration-1000 ease-out ${
                  passed ? 'stroke-emerald-500' : 'stroke-rose-500'
                }`}
                strokeWidth="12"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className={`text-4xl font-black tracking-tight ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {percentage}%
              </span>
              <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {score} / {maxScore} Pts
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {passed ? 'Congratulations! You met the passing cutoff requirements.' : 'Target cutoff not reached. Review weak areas below.'}
          </p>
        </div>

        {/* Question Breakdown Stats & Pie Bar */}
        <div className="lg:col-span-2 p-8 rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <PieChart className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Answer Response Accuracy
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20">
                <span className="text-[10px] uppercase font-extrabold text-indigo-600 dark:text-indigo-400">Attempted</span>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{answeredCount}</p>
                <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">Out of {totalQuestions || (answeredCount + skippedCount)}</span>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-[10px] uppercase font-extrabold text-emerald-600 dark:text-emerald-400">Correct</span>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{correctCount}</p>
                <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">Verified right</span>
              </div>
              <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20">
                <span className="text-[10px] uppercase font-extrabold text-rose-600 dark:text-rose-400">Incorrect</span>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{wrongCount}</p>
                <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">Wrong responses</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-500/5 border border-slate-500/20">
                <span className="text-[10px] uppercase font-extrabold text-slate-600 dark:text-slate-400">Skipped</span>
                <p className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-1">{skippedCount}</p>
                <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">Unattempted</span>
              </div>
            </div>
          </div>

          {/* Test Case Breakdown if Coding exists */}
          {(totalHiddenTestCases > 0 || totalVisibleTestCases > 0) && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Coding Execution Test Cases</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 font-semibold">Visible Test Cases:</span>
                  <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{visibleTestCasesPassed} / {totalVisibleTestCases}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 font-semibold">Hidden Test Cases:</span>
                  <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">{hiddenTestCasesPassed} / {totalHiddenTestCases}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section Wise Marks Bar Chart */}
      {sectionBreakdown.length > 0 && (
        <div className="p-8 rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Section-Wise Performance Breakdown
          </h3>

          <div className="space-y-4">
            {sectionBreakdown.map((sec, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{sec.name}</span>
                  <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                    {sec.obtainedMarks} / {sec.maxMarks} Marks ({sec.percentage}%)
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      sec.percentage >= cutoffPercentage ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, sec.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Insights & Recommendations */}
      <div className="p-8 rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Shield className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          Automated Candidate Performance Insights
        </h3>

        {feedback ? (
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed italic border-l-4 border-indigo-500 pl-4 py-1">
            "{feedback}"
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-1">
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 block uppercase text-[10px]">Strengths</span>
              <p className="text-slate-700 dark:text-slate-300">Strong speed and accuracy across standard MCQ conceptual questions.</p>
            </div>
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1">
              <span className="font-extrabold text-amber-600 dark:text-amber-400 block uppercase text-[10px]">Recommended Focus Areas</span>
              <p className="text-slate-700 dark:text-slate-300">Practice edge-case testing for memory limit and multi-line standard input parsing.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
