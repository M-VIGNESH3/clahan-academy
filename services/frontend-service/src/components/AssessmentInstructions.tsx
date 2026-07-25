import React, { useState } from 'react';
import { Shield, CheckSquare } from 'lucide-react';

interface AssessmentInstructionsProps {
  exam: {
    name: string;
    description?: string;
    instructions?: string;
    duration_minutes: number;
    allowed_attempts?: number;
    cutoff_percentage?: number;
    navigation_mode?: 'free' | 'locked' | 'sequential' | 'sequential_locked';
    navigationMode?: 'free' | 'locked' | 'sequential' | 'sequential_locked';
    submission_mode?: 'manual' | 'auto';
    submissionMode?: 'manual' | 'auto';
    enable_face_detection?: boolean;
    enableFaceDetection?: boolean;
  };
  sectionsCount: number;
  totalQuestionsCount: number;
  onProceed: () => void;
}

export const AssessmentInstructions: React.FC<AssessmentInstructionsProps> = ({
  exam,
  sectionsCount,
  totalQuestionsCount,
  onProceed
}) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const navMode = exam.navigation_mode || exam.navigationMode || 'free';
  const subMode = exam.submission_mode || exam.submissionMode || 'manual';
  const isFaceDetEnabled = exam.enable_face_detection !== false && exam.enableFaceDetection !== false;
  const customInstructions = exam.description || exam.instructions;

  return (
    <div className="max-w-3xl mx-auto my-auto p-8 rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl space-y-6">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <Shield className="h-8 w-8 text-indigo-400 animate-pulse" />
        <div>
          <h2 className="text-xl font-extrabold text-white">{exam.name}</h2>
          <p className="text-xs text-indigo-300 mt-0.5">Secure AI-Proctored Assessment Environment</p>
        </div>
      </div>

      <div className="text-xs text-slate-300 space-y-5 leading-relaxed max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        {/* Configured Exam Description / Instructions */}
        {customInstructions && String(customInstructions).trim().length > 0 && (
          <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 space-y-1.5">
            <h4 className="font-extrabold text-xs text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckSquare className="h-4 w-4" /> Specific Exam Instructions
            </h4>
            <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {String(customInstructions)}
            </p>
          </div>
        )}

        {/* 1. Assessment Overview & Summary */}
        <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-800/40 space-y-2">
          <h4 className="font-extrabold text-xs text-indigo-300 uppercase tracking-wider">Assessment Overview</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-mono">
            <div>
              <span className="text-slate-500 block">Duration:</span>
              <strong className="text-white">{exam.duration_minutes} Mins</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Sections:</span>
              <strong className="text-white">{sectionsCount || 1} Sections</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Questions:</span>
              <strong className="text-white">{totalQuestionsCount} Items</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Cutoff Score:</span>
              <strong className="text-white">{exam.cutoff_percentage || 50}%</strong>
            </div>
          </div>
        </div>

        {/* 2. Navigation Rules */}
        <div className="space-y-1.5">
          <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-indigo-400"></span> Section Navigation Rules
          </h4>
          <p className="text-xs text-slate-400 pl-3.5">
            {navMode === 'free'
              ? 'Free Navigation: You can freely switch between any section until overall time expires.'
              : navMode === 'locked'
                ? 'Locked Navigation: Once a section is submitted, you cannot return to modify its answers.'
                : navMode === 'sequential_locked'
                  ? 'Sequential Locked Navigation: Sections must be completed in order. Submitting a section locks it permanently.'
                  : 'Sequential Navigation: Sections must be completed in order.'}
          </p>
        </div>

        {/* 3. Submission Rules */}
        <div className="space-y-1.5">
          <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Submission Policy
          </h4>
          <p className="text-xs text-slate-400 pl-3.5">
            {subMode === 'auto'
              ? 'Automatic Submission: Early submission is disabled. Once all sections are completed, your answers become read-only and will submit automatically when the timer expires.'
              : 'Manual Submission: You may review and edit answers before submitting manually. If the timer expires, saved answers submit automatically.'}
          </p>
        </div>

        {/* 4. AI Proctoring Rules */}
        <div className="space-y-1.5">
          <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-amber-400"></span> AI Proctoring & Security Restrictions
          </h4>
          <ul className="space-y-1.5 list-disc list-inside text-xs text-slate-400 pl-3.5">
            <li>
              {isFaceDetEnabled
                ? 'AI Face Detection Active: Camera & Microphone must remain enabled. Face confidence is monitored continuously.'
                : 'Webcam & Microphone verification active throughout the attempt.'}
            </li>
            <li>Fullscreen Requirement: You must remain in browser Fullscreen mode throughout the test.</li>
            <li>Tab Switch Warning Policy: Maximum 2 tab switch warnings permitted before immediate security termination.</li>
          </ul>
        </div>
      </div>

      {/* Mandatory Acknowledgment Checkbox */}
      <div className="pt-2">
        <label className="flex items-start gap-3 p-3.5 bg-slate-900 border border-white/10 rounded-2xl cursor-pointer hover:border-indigo-500/50 transition-colors">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
          <span className="text-xs font-semibold text-slate-200 leading-relaxed select-none">
            I have read, understood, and agree to abide by all the assessment rules and exam instructions stated above.
          </span>
        </label>
      </div>

      <button
        onClick={onProceed}
        disabled={!acknowledged}
        className={`w-full py-4 font-bold rounded-2xl shadow-lg transition-all text-sm uppercase tracking-wide flex items-center justify-center gap-2 text-white ${
          acknowledged
            ? 'bg-indigo-600 hover:bg-indigo-500 cursor-pointer shadow-indigo-600/30'
            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5 opacity-50'
        }`}
      >
        I Understand - Proceed to Hardware Validation &rarr;
      </button>
    </div>
  );
};
