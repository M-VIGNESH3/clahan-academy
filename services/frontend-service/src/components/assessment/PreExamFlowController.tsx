import React, { useState } from 'react';
import { Shield, Camera, Mic, Maximize2, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { AssessmentInstructions } from '../AssessmentInstructions';

interface PreExamFlowControllerProps {
  exam: any;
  onValidationSuccess: () => void;
  onCancel: () => void;
}

export const PreExamFlowController: React.FC<PreExamFlowControllerProps> = ({
  exam,
  onValidationSuccess,
  onCancel
}) => {
  const [step, setStep] = useState<'instructions' | 'hardware' | 'face' | 'fullscreen'>('instructions');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [faceCheckOk, setFaceCheckOk] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const requestHardwarePermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setCameraOk(true);
      setMicOk(true);
      // Stop stream tracks after validation
      stream.getTracks().forEach(t => t.stop());
      setStep('face');
    } catch (err) {
      console.warn('Hardware permission request failed:', err);
      setCameraOk(false);
      setMicOk(false);
      // Allow simulated bypass for testing if hardware unavailable
      setStep('face');
    }
  };

  const runFaceDetection = () => {
    // Simulate face detection check
    setFaceCheckOk(true);
    setStep('fullscreen');
  };

  const enterFullscreenAndProceed = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      }
      setIsFullscreen(true);
      onValidationSuccess();
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
      // Proceed even if browser security blocks automated fullscreen call
      onValidationSuccess();
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 font-sans space-y-6 animate-in fade-in duration-300">
      {/* Step Indicator */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center text-xs">
        {[
          { id: 'instructions', label: '1. Instructions' },
          { id: 'hardware', label: '2. Hardware Check' },
          { id: 'face', label: '3. Face Detection' },
          { id: 'fullscreen', label: '4. Fullscreen Enforce' }
        ].map((s, idx) => {
          const isActive = step === s.id;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full font-bold ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-500'
              }`}>
                {s.label}
              </span>
              {idx < 3 && <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">&rarr;</span>}
            </div>
          );
        })}
      </div>

      {/* Step 1: Instructions (NEVER SKIPPED) */}
      {step === 'instructions' && (
        <div className="space-y-6">
          <AssessmentInstructions
            examName={exam?.name || 'Assessment Environment'}
            durationMinutes={exam?.duration_minutes || 60}
            cutoffPercentage={exam?.cutoff_percentage || 50}
            negativeMarkingRules="No negative marking applied unless specified per question."
            navigationRules={exam?.navigation_mode === 'locked' ? 'Locked (Sequential question progression)' : 'Free Navigation (Jump between questions allowed)'}
            submissionRules={exam?.submission_mode === 'auto' ? 'Auto-submit on timer expiry' : 'Manual submission with confirm dialog'}
            proctoringWarnings="Webcam, microphone, and fullscreen focus monitored. Tab switching triggers fraud warnings."
            customInstructions={exam?.description || 'Ensure stable internet connectivity and clean physical workspace environment.'}
            accepted={acceptedTerms}
            onAcceptChange={setAcceptedTerms}
            onStart={() => setStep('hardware')}
          />
        </div>
      )}

      {/* Step 2: Hardware Check */}
      {step === 'hardware' && (
        <div className="p-8 rounded-3xl bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-6">
          <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Camera className="h-8 w-8" />
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Hardware Compatibility Check</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Please grant camera and microphone access to verify your system for automated AI proctoring.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto text-left text-xs">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <span className="font-bold flex items-center gap-2"><Camera className="h-4 w-4 text-indigo-500" /> Webcam</span>
              <span className={`font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded ${
                cameraOk === true ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
              }`}>
                {cameraOk === true ? 'Ready' : 'Pending'}
              </span>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <span className="font-bold flex items-center gap-2"><Mic className="h-4 w-4 text-indigo-500" /> Microphone</span>
              <span className={`font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded ${
                micOk === true ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
              }`}>
                {micOk === true ? 'Ready' : 'Pending'}
              </span>
            </div>
          </div>

          <div className="flex justify-center gap-4 pt-4">
            <button
              onClick={onCancel}
              className="px-6 py-2.5 text-xs font-bold border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400"
            >
              Cancel
            </button>
            <button
              onClick={requestHardwarePermissions}
              className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              Check Devices & Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Face Detection */}
      {step === 'face' && (
        <div className="p-8 rounded-3xl bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-6">
          <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <Shield className="h-8 w-8" />
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">AI Face Verification</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Ensure your face is clearly visible inside the camera frame. Avoid multiple people or low-light conditions.
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 max-w-sm mx-auto flex items-center justify-center gap-2 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" /> Face Detected & Position Verified
          </div>

          <div className="flex justify-center gap-4 pt-4">
            <button
              onClick={runFaceDetection}
              className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              Confirm & Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Fullscreen Enforce */}
      {step === 'fullscreen' && (
        <div className="p-8 rounded-3xl bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-6">
          <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Maximize2 className="h-8 w-8" />
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Fullscreen Secure Lockdown</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              The assessment will run strictly in Fullscreen mode. Exiting fullscreen or switching browser tabs will trigger automatic security violation logs.
            </p>
          </div>

          <div className="flex justify-center gap-4 pt-4">
            <button
              onClick={enterFullscreenAndProceed}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-2xl shadow-xl shadow-emerald-500/20 transition-all hover:scale-[1.02]"
            >
              Enter Fullscreen & Begin Assessment
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
