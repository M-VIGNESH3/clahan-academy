import React, { useState, useRef, useEffect } from 'react';
import { 
  BookOpen, Video, ShieldCheck, Maximize2, CheckCircle, AlertTriangle, ArrowRight, Shield, RefreshCw 
} from 'lucide-react';
import { AssessmentInstructions } from '../AssessmentInstructions';

export type PreExamValidationStep = 'instructions' | 'hardware' | 'face' | 'fullscreen' | 'active';

interface AssessmentPreExamStepperProps {
  exam: any;
  currentStep: PreExamValidationStep;
  onStepChange: (step: PreExamValidationStep) => void;
  onStartExam: () => Promise<boolean | void>;
  showToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

export const AssessmentPreExamStepper: React.FC<AssessmentPreExamStepperProps> = ({
  exam,
  currentStep,
  onStepChange,
  onStartExam,
  showToast
}) => {
  const [hardwarePassed, setHardwarePassed] = useState(false);
  const [isTestingCamera, setIsTestingCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [faceCheckPassed, setFaceCheckPassed] = useState(false);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Clean up media stream on unmount or step transition to active
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [stream]);

  // Handle Video preview attachment
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, currentStep]);

  const requestHardwareCheck = async () => {
    setIsTestingCamera(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      setHardwarePassed(true);
      showToast('Webcam and Microphone successfully verified.', 'success');
    } catch (err) {
      setHardwarePassed(false);
      showToast('Camera or Microphone access denied. Please grant permissions in your browser.', 'error');
    } finally {
      setIsTestingCamera(false);
    }
  };

  const requestFullscreen = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      }
      setIsFullscreenActive(true);
      return true;
    } catch (err) {
      showToast('Fullscreen request was declined. Please allow fullscreen to begin.', 'warning');
      return false;
    }
  };

  const stepsList: Array<{ id: PreExamValidationStep; label: string; icon: any }> = [
    { id: 'instructions', label: '1. Instructions', icon: BookOpen },
    { id: 'hardware', label: '2. Hardware Test', icon: Video },
    { id: 'face', label: '3. Face Verification', icon: ShieldCheck },
    { id: 'fullscreen', label: '4. Fullscreen Lock', icon: Maximize2 }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 md:p-8 font-sans select-none">
      <div className="w-full max-w-4xl space-y-6">
        
        {/* Step Indicator Header */}
        <div className="bg-slate-900 border border-white/10 p-4 rounded-2xl flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-indigo-400" />
            <div>
              <h2 className="font-extrabold text-sm uppercase tracking-wider text-white">
                Pre-Exam Verification Handshake
              </h2>
              <p className="text-[11px] text-slate-400">
                {exam?.name || 'Assessment Environment'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {stepsList.map(s => {
              const Icon = s.icon;
              const isCurrent = currentStep === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-extrabold transition-all ${
                    isCurrent
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                      : 'bg-slate-950 border-white/5 text-slate-500'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP 1: INSTRUCTIONS */}
        {currentStep === 'instructions' && (
          <div className="space-y-6">
            <AssessmentInstructions
              exam={exam}
              sectionsCount={exam?.sections?.length || 1}
              totalQuestionsCount={exam?.mcq_count || exam?.questions_count || 10}
              onProceed={() => onStepChange('hardware')}
            />
          </div>
        )}

        {/* STEP 2: HARDWARE VALIDATION */}
        {currentStep === 'hardware' && (
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <Video className="h-6 w-6 text-indigo-400" />
              <div>
                <h3 className="font-extrabold text-base text-white">Step 2: Hardware & Sensor Validation</h3>
                <p className="text-xs text-slate-400">Verify that your camera and microphone are functioning properly.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="h-56 bg-slate-950 border border-white/10 rounded-xl overflow-hidden relative flex items-center justify-center">
                {stream ? (
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-4 space-y-2 text-slate-500">
                    <Video className="h-10 w-10 mx-auto text-slate-700 animate-pulse" />
                    <p className="text-xs">Camera preview offline. Click test below to initialize.</p>
                  </div>
                )}
                {hardwarePassed && (
                  <div className="absolute top-2 right-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Camera Active
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-950 border border-white/5 rounded-xl space-y-2 text-xs">
                  <span className="font-bold text-indigo-400 uppercase tracking-wider block text-[10px]">Verification Checklist</span>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Webcam Permission</span>
                    <span className={hardwarePassed ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {hardwarePassed ? 'Passed' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Microphone Stream</span>
                    <span className={hardwarePassed ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {hardwarePassed ? 'Passed' : 'Pending'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={requestHardwareCheck}
                  disabled={isTestingCamera}
                  className="w-full py-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isTestingCamera ? 'animate-spin' : ''}`} />
                  {hardwarePassed ? 'Re-test Camera & Mic' : 'Start Camera & Mic Test'}
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center border-t border-white/10 pt-4">
              <button
                onClick={() => onStepChange('instructions')}
                className="px-4 py-2 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800"
              >
                &larr; Back to Instructions
              </button>
              <button
                onClick={() => {
                  if (!hardwarePassed) {
                    showToast('Please test and verify your camera before proceeding.', 'warning');
                    return;
                  }
                  onStepChange('face');
                }}
                disabled={!hardwarePassed}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-extrabold rounded-xl text-xs flex items-center gap-2"
              >
                Proceed to Face Verification &rarr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: FACE DETECTION VERIFICATION */}
        {currentStep === 'face' && (
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <ShieldCheck className="h-6 w-6 text-indigo-400" />
              <div>
                <h3 className="font-extrabold text-base text-white">Step 3: AI Proctoring & Face Verification</h3>
                <p className="text-xs text-slate-400">Ensure your face is centered and clearly visible in lighting.</p>
              </div>
            </div>

            <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs text-indigo-300 font-semibold space-y-1">
              <p>✔ Place yourself in a well-lit room.</p>
              <p>✔ Do not cover your face or wear sunglasses.</p>
              <p>✔ Only one candidate must be visible in front of the camera.</p>
            </div>

            <div className="flex justify-between items-center border-t border-white/10 pt-4">
              <button
                onClick={() => onStepChange('hardware')}
                className="px-4 py-2 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800"
              >
                &larr; Back to Hardware
              </button>
              <button
                onClick={() => {
                  setFaceCheckPassed(true);
                  onStepChange('fullscreen');
                }}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs flex items-center gap-2"
              >
                Confirm Face & Proceed to Fullscreen &rarr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: FULLSCREEN LOCK */}
        {currentStep === 'fullscreen' && (
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <Maximize2 className="h-6 w-6 text-indigo-400" />
              <div>
                <h3 className="font-extrabold text-base text-white">Step 4: Secure Fullscreen Environment</h3>
                <p className="text-xs text-slate-400">The assessment requires a locked fullscreen window to prevent tab switching.</p>
              </div>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <span>Warning: Exiting fullscreen mode during an assessment will trigger tab-switch violations and may terminate your attempt.</span>
            </div>

            <div className="flex justify-between items-center border-t border-white/10 pt-4">
              <button
                onClick={() => onStepChange('face')}
                className="px-4 py-2 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800"
              >
                &larr; Back to Face Verification
              </button>
              <button
                onClick={async () => {
                  const fsOk = await requestFullscreen();
                  if (fsOk) {
                    await onStartExam();
                  }
                }}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-600/20 uppercase tracking-wider flex items-center gap-2"
              >
                Enter Fullscreen & Begin Assessment <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
