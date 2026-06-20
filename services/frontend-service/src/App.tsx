import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  BookOpen, Code, Shield, Video, Bell, Settings, Award, Users, CheckCircle, AlertTriangle, 
  Trash2, Copy, Send, Download, Upload, Plus, Play, Check, Moon, Sun, ArrowRight, User, 
  LogOut, RefreshCw, Layers, Cpu, Laptop, Terminal, Mail, Phone, MapPin, Eye, EyeOff, Lock,
  Maximize2, ShieldAlert, X, Sparkles, ChevronLeft, ChevronRight, Star, Minimize2, Bookmark, Clock
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import * as XLSX from 'xlsx';
import Editor from '@monaco-editor/react';

// Core Types
interface College { id: string; name: string; }
interface Department { id: string; college_id: string; name: string; }
interface UserProfile {
  id: string; email: string; role?: 'admin' | 'student'; fullName: string; rollNumber?: string;
  full_name?: string; roll_number?: string;
  collegeId?: string; departmentId?: string; year?: string; phone?: string;
  githubProfile?: string; linkedinProfile?: string; profilePhotoUrl?: string;
  college_name?: string; department_name?: string; status?: string;
  email_verified?: boolean;
  batchId?: string | null; batch_id?: string | null; batchName?: string | null; batch_name?: string | null; college_id?: string | null;
  trainer_id?: string | null; trainerId?: string | null; trainer_name?: string | null; trainerName?: string | null;
  raw_password?: string; rawPassword?: string;
}
interface Exam {
  id: string; name: string; description: string; exam_type: 'mcq' | 'coding' | 'both';
  duration_minutes: number; cutoff_percentage: number; allowed_attempts: number;
  schedule_date: string; college_id: string; department_id: string; department_ids?: string[]; batch_id?: string; year: string;
  is_published: boolean; window_open_minutes?: number; mcq_count?: number; coding_count?: number;
  trainer_id?: string | null; trainerId?: string | null; trainer_name?: string | null; trainerName?: string | null;
  enable_face_detection?: boolean; enableFaceDetection?: boolean;
}
interface MCQQuestion {
  id: string; question: string; option_a: string; option_b: string; option_c: string; option_d: string;
  correct_answer?: string; marks: number; difficulty: string;
}
interface CodingQuestion {
  id: string; title: string; description: string; difficulty: string; marks: number;
  language: string; starter_code: string; time_limit: number; memory_limit: number;
  testCases?: Array<{ id: string; input: string; expected_output: string; is_hidden: boolean }>;
}
interface Attempt {
  id: string; exam_id: string; student_id: string; attempt_number: number; score: number;
  percentage: number; passed: boolean; mcq_score: number; coding_score: number;
  time_taken_seconds: number; feedback: string; status: 'ongoing' | 'completed' | 'terminated';
  created_at: string; exam_name?: string; exam_type?: string; cutoff_percentage?: number;
  results_released?: boolean;
}

const getLocalDatetimeString = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
};

const STARTER_TEMPLATES: Record<string, string> = {
  'Python': 'import sys\n\ndef solve():\n    # Read input from standard input (stdin)\n    input_data = sys.stdin.read().strip()\n    if not input_data:\n        return\n    \n    # Write your logic here and print result to standard output (stdout)\n    print(input_data)\n\nif __name__ == "__main__":\n    solve()',
  'Java': 'import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Read input from standard input (stdin)\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextLine()) {\n            String inputVal = sc.nextLine();\n            // Write your logic here and print to standard output (stdout)\n            System.out.println(inputVal);\n        }\n    }\n}',
  'C++': '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    // Read input from standard input (stdin)\n    string input_val;\n    if (getline(cin, input_val)) {\n        // Write your logic here and print to standard output (stdout)\n        cout << input_val << endl;\n    }\n    return 0;\n}',
  'JavaScript': 'const fs = require("fs");\n\nfunction solve() {\n    // Read input from standard input (stdin)\n    const inputVal = fs.readFileSync(0, "utf-8").trim();\n    // Write your logic here and print to standard output (stdout)\n    console.log(inputVal);\n}\n\nsolve();'
};

const getCustomTemplate = (question: any, newLang: string) => {
  if (!question) return '';
  const origLang = question.language || 'Python';
  const origCode = question.starter_code || '';
  
  if (newLang.toLowerCase() === origLang.toLowerCase() && origCode.trim()) {
    return origCode;
  }
  
  const title = question.title || 'solve';
  const words = title.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const fnName = words.length === 0 ? 'solve' : (words[0] + words.slice(1).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(''));
  
  if (newLang === 'Python') {
    return `import sys\n\ndef ${fnName}(input_data):\n    # Write your logic here\n    # Return the result or value\n    return input_data\n\nif __name__ == "__main__":\n    # Read input from standard input (stdin)\n    input_data = sys.stdin.read().strip()\n    if input_data:\n        result = ${fnName}(input_data)\n        if result is not None:\n            print(result)`;
  } else if (newLang === 'Java') {
    return `import java.util.*;\n\npublic class Solution {\n    public static String ${fnName}(String inputVal) {\n        // Write your logic here\n        return inputVal;\n    }\n\n    public static void main(String[] args) {\n        // Read input from standard input (stdin)\n        Scanner sc = new Scanner(System.in);\n        StringBuilder sb = new StringBuilder();\n        while (sc.hasNextLine()) {\n            sb.append(sc.nextLine()).append("\\n");\n        }\n        String inputVal = sb.toString().trim();\n        if (!inputVal.isEmpty()) {\n            System.out.println(${fnName}(inputVal));\n        }\n    }\n}`;
  } else if (newLang === 'C++') {
    return `#include <iostream>\n#include <string>\nusing namespace std;\n\nstring ${fnName}(string input_val) {\n    // Write your logic here\n    return input_val;\n}\n\nint main() {\n    // Read input from standard input (stdin)\n    string input_val;\n    string line;\n    while (getline(cin, line)) {\n        input_val += line + "\\n";\n    }\n    if (!input_val.empty()) {\n        cout << ${fnName}(input_val) << endl;\n    }\n    return 0;\n}`;
  } else if (newLang === 'JavaScript') {
    return `const fs = require("fs");\n\nfunction ${fnName}(inputVal) {\n    // Write your logic here\n    return inputVal;\n}\n\nfunction main() {\n    // Read input from standard input (stdin)\n    const inputVal = fs.readFileSync(0, "utf-8").trim();\n    if (inputVal) {\n        console.log(${fnName}(inputVal));\n    }\n}\n\nmain();`;
  }
  return STARTER_TEMPLATES[newLang] || '';
};

export default function App() {
  // Theme State
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });

  // App Routing
  const [currentPage, setCurrentPage] = useState<'landing' | 'login' | 'register' | 'forgot-pw' | 'reset-pw' | 'student-dash' | 'admin-dash' | 'exam-env' | 'result-view' | 'questions-editor' | 'admin-login'>(() => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/admin-login' || path === '/admin-login/') {
      return 'admin-login';
    }
    if (path === '/login' || path === '/login/') {
      return 'login';
    }
    if (path === '/register' || path === '/register/') {
      return 'register';
    }
    return 'landing';
  });
  const [isExamFullscreen, setIsExamFullscreen] = useState(true);
  
  // Auth state
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [showOtpVerification, setShowOtpVerification] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  
  // Forms state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState<'student' | 'admin'>('student');
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  // Student registration state
  const [regForm, setRegForm] = useState({
    email: '', password: '', confirmPassword: '', fullName: '', phone: '', rollNumber: '',
    collegeId: '', departmentId: '', batchId: '', trainerId: '', year: '1st Year', githubProfile: '', linkedinProfile: '', profilePhotoUrl: ''
  });

  // Data Cache Lists
  const [colleges, setColleges] = useState<College[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [registerTrainers, setRegisterTrainers] = useState<any[]>([]);
  const [upcomingExams, setUpcomingExams] = useState<Exam[]>([]);
  const [activeExams, setActiveExams] = useState<Exam[]>([]);
  const [completedAttempts, setCompletedAttempts] = useState<Attempt[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeAdminTab, setActiveAdminTab] = useState<'metrics' | 'colleges' | 'students' | 'trainers' | 'exams' | 'live' | 'settings'>('metrics');
  const [adminTrainers, setAdminTrainers] = useState<any[]>([]);
  const [studentTrainers, setStudentTrainers] = useState<any[]>([]);
  const [trainerForm, setTrainerForm] = useState({
    name: '',
    email: '',
    phone: '',
    specialization: '',
    collegeId: '',
    batchId: ''
  });
  const [editingTrainerId, setEditingTrainerId] = useState<string | null>(null);
  const [liveSessions, setLiveSessions] = useState<any[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
  const adminSocketRef = useRef<any>(null);
  const [activeStudentTab, setActiveStudentTab] = useState<'active-exams' | 'results' | 'profile' | 'trainers' | 'notifications'>('active-exams');

  // Admin College/Dept Creation state
  const [newCollegeName, setNewCollegeName] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCollegeId, setNewDeptCollegeId] = useState('');
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchCollegeId, setNewBatchCollegeId] = useState('');
  const [adminColleges, setAdminColleges] = useState<College[]>([]);
  const [adminDepts, setAdminDepts] = useState<any[]>([]);
  const [adminBatches, setAdminBatches] = useState<any[]>([]);
  const [adminStudents, setAdminStudents] = useState<UserProfile[]>([]);
  const [adminExams, setAdminExams] = useState<any[]>([]);
  const [adminMetrics, setAdminMetrics] = useState<any>({
    totalStudents: 0, totalExams: 0, liveExams: 0, completedExams: 0, averageScore: 0, passPercentage: 0, failPercentage: 0
  });

  // Settings State
  const [companySettings, setCompanySettings] = useState({
    companyName: 'Clahan Academy',
    contactPhone: '+91 83173 37694',
    contactEmail: 'info@clahantechnologies.com',
    companyAddress: 'Maruthi Nagar, BTM 1st Stage, Bangalore, Karnataka, India – 560068',
    footerText: 'Powered by Clahan Academy Enterprise Assessment Engine. All rights reserved.',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpUser: 'aiexamplatform123@gmail.com',
    smtpPassword: '••••••••••••'
  });

  // Student manual profile update
  const [phoneUpdate, setPhoneUpdate] = useState('');
  const [githubUpdate, setGithubUpdate] = useState('');
  const [linkedinUpdate, setLinkedinUpdate] = useState('');
  const [photoUpdate, setPhotoUpdate] = useState('');
  const [batchUpdate, setBatchUpdate] = useState('');
  const [trainerUpdate, setTrainerUpdate] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newProfilePassword, setNewProfilePassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewProfilePassword, setShowNewProfilePassword] = useState(false);

  // Administrative list and student filters
  const [selectedConfigCollegeId, setSelectedConfigCollegeId] = useState('');
  const [studentFilterCollegeId, setStudentFilterCollegeId] = useState('');
  const [studentFilterDeptId, setStudentFilterDeptId] = useState('');
  const [studentFilterBatchId, setStudentFilterBatchId] = useState('');
  const [studentFilterYear, setStudentFilterYear] = useState('');
  const [studentFilterTrainerId, setStudentFilterTrainerId] = useState('');

  // Bulk student import state
  const [studentCsvInput, setStudentCsvInput] = useState('');
  const [importSummary, setImportSummary] = useState<any>(null);

  // Manual Exam Creation state
  const [examForm, setExamForm] = useState<{
    name: string;
    description: string;
    examType: 'mcq' | 'coding' | 'both';
    durationMinutes: number;
    cutoffPercentage: number;
    allowedAttempts: number;
    scheduleDate: string;
    windowOpenMinutes: number;
    collegeId: string;
    departmentId: string;
    departmentIds: string[];
    batchId: string;
    trainerId: string;
    year: string;
    enableFaceDetection?: boolean;
  }>({
    name: '', description: '', examType: 'mcq',
    durationMinutes: 60, cutoffPercentage: 50, allowedAttempts: 1, scheduleDate: getLocalDatetimeString(),
    windowOpenMinutes: 10,
    collegeId: '', departmentId: '', departmentIds: [], batchId: '', trainerId: '', year: '1st Year',
    enableFaceDetection: true
  });
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [terminationModal, setTerminationModal] = useState<{ attemptId: string; studentName: string } | null>(null);
  const [terminationReason, setTerminationReason] = useState('');
  const [warningModal, setWarningModal] = useState<{ attemptId: string; studentName: string } | null>(null);
  const [warningReason, setWarningReason] = useState('');
  const [selectedExamIdForQuestions, setSelectedExamIdForQuestions] = useState<string | null>(null);
  const [questionEditorTab, setQuestionEditorTab] = useState<'mcq' | 'coding'>('mcq');
  const [adminSelectedExamMCQs, setAdminSelectedExamMCQs] = useState<MCQQuestion[]>([]);
  const [adminSelectedExamCodings, setAdminSelectedExamCodings] = useState<CodingQuestion[]>([]);
  const [adminSelectedExamResults, setAdminSelectedExamResults] = useState<any[]>([]);
  const [selectedExamIdForResults, setSelectedExamIdForResults] = useState<string | null>(null);
  const [selectedExamNameForResults, setSelectedExamNameForResults] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [mcqForm, setMcqForm] = useState({
    question: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A', marks: 1, difficulty: 'medium'
  });
  // MCQ bulk import
  const [mcqCsvInput, setMcqCsvInput] = useState('');
  const [selectedMcqFileName, setSelectedMcqFileName] = useState<string | null>(null);

  // Manual Coding Question Configuration
  const [isCodingModalOpen, setIsCodingModalOpen] = useState(false);
  const [codingForm, setCodingForm] = useState({
    title: '', description: '', difficulty: 'medium', marks: 10, language: 'Python',
    starterCode: 'def solve():\n    # Write your code here\n    pass', timeLimit: 2000, memoryLimit: 512000
  });
  const [codingTestCases, setCodingTestCases] = useState<Array<{ input: string; expected_output: string; isHidden: boolean }>>([
    { input: '5\n', expected_output: '10\n', isHidden: false }
  ]);

  // Exam Attempt state (Ongoing Exam Environment)
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [currentAttempt, setCurrentAttempt] = useState<Attempt | null>(null);
  const [validationStep, setValidationStep] = useState<'instructions' | 'validation' | 'active'>('instructions');
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [faceCheck, setFaceCheck] = useState<boolean | null>(null);
  const [fullscreenCheck, setFullscreenCheck] = useState<boolean>(false);
  const [studentWarningMessage, setStudentWarningMessage] = useState<string | null>(null);
  const [hardwareProgress, setHardwareProgress] = useState(0);

  // Ongoing Exam IDE State
  const [examMCQs, setExamMCQs] = useState<MCQQuestion[]>([]);
  const [examCodings, setExamCodings] = useState<CodingQuestion[]>([]);
  const [selectedSection, setSelectedSection] = useState<'mcq' | 'coding'>('mcq');
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, string>>({}); // { questionId: selectedOption }
  const [codingSolutions, setCodingSolutions] = useState<Record<string, { code: string; language: string }>>({}); // { questionId: { code, lang } }
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});

  // Dev Debug Panel States
  const [cameraConnected, setCameraConnected] = useState(false);
  const [cameraStreamActive, setCameraStreamActive] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceConfidence, setFaceConfidence] = useState(0);
  const [faceTrackingActive, setFaceTrackingActive] = useState(false);
  const [lastFaceSeen, setLastFaceSeen] = useState<string>('N/A');
  const [noFaceTimer, setNoFaceTimer] = useState(0);
  const [activeFraudState, setActiveFraudState] = useState('Normal');
  const [detectionFps, setDetectionFps] = useState(0);
  const [debugLogs, setDebugLogs] = useState<Array<{ time: string; event: string }>>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [faceCount, setFaceCount] = useState(0);
  const [detectionSource, setDetectionSource] = useState('None');
  const lastFrameTimeRef = useRef<number | null>(null);
  const prevFacePresentRef = useRef<boolean | null>(null);
  const prevElapsedLostRef = useRef<number>(0);
  const prevTrackingStatusRef = useRef<string>('Face Present');

  const logDebugEvent = useCallback((event: string) => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs(prev => {
      if (prev.length > 0 && prev[0].event === event) return prev;
      return [{ time, event }, ...prev].slice(0, 100);
    });
    console.log(`[DEV DEBUG] ${time} - ${event}`);
  }, []);

  // Update camera statuses based on stream state
  useEffect(() => {
    setCameraConnected(!!cameraStream);
    setCameraStreamActive(!!(cameraStream && cameraStream.active));
  }, [cameraStream]);

  // Enforce no blank exam screens
  useEffect(() => {
    if (currentPage === 'exam-env' && currentExam) {
      const examType = currentExam.exam_type;
      
      // Determine what section we should actually be in
      if (examType === 'coding' || (examMCQs.length === 0 && examCodings.length > 0)) {
        if (selectedSection !== 'coding') {
          setSelectedSection('coding');
          setActiveQuestionIndex(0);
        }
      } else if (examType === 'mcq' || (examCodings.length === 0 && examMCQs.length > 0)) {
        if (selectedSection !== 'mcq') {
          setSelectedSection('mcq');
          setActiveQuestionIndex(0);
        }
      } else if (examType === 'both') {
        // Mixed exam: load first available section
        if (examMCQs.length > 0) {
          if (selectedSection !== 'mcq' && selectedSection !== 'coding') {
            setSelectedSection('mcq');
            setActiveQuestionIndex(0);
          }
        } else if (examCodings.length > 0) {
          if (selectedSection !== 'coding') {
            setSelectedSection('coding');
            setActiveQuestionIndex(0);
          }
        }
      }

      // Ensure activeQuestionIndex is within bounds for the selected section
      const questionsLength = selectedSection === 'mcq' ? examMCQs.length : examCodings.length;
      if (questionsLength > 0 && (activeQuestionIndex < 0 || activeQuestionIndex >= questionsLength)) {
        setActiveQuestionIndex(0);
      }
    }
  }, [currentPage, currentExam, examMCQs.length, examCodings.length, selectedSection, activeQuestionIndex]);
  
  // Resizable Panel & Editor controls
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDescriptionCollapsed, setIsDescriptionCollapsed] = useState(false);
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [editorTheme, setEditorTheme] = useState('vs-dark');
  const [outputTab, setOutputTab] = useState<'output' | 'testcases' | 'errors' | 'details'>('output');

  // Fullscreen states
  const [isFullscreenQuestion, setIsFullscreenQuestion] = useState(false);
  const [isFullscreenEditor, setIsFullscreenEditor] = useState(false);
  const [isFullscreenOutput, setIsFullscreenOutput] = useState(false);

  // Width states for Resizable panels
  const [questionWidth, setQuestionWidth] = useState(() => 
    parseInt(localStorage.getItem('clahan_question_width') || '380')
  );
  const [editorWidth, setEditorWidth] = useState(() => 
    parseInt(localStorage.getItem('clahan_editor_width') || '480')
  );

  const dragQuestionRef = useRef(false);
  const dragEditorRef = useRef(false);
  const prevQuestionIndexRef = useRef<number | null>(null);
  const prevSectionRef = useRef<'mcq' | 'coding' | null>(null);

  const startDragQuestion = (e: React.MouseEvent) => {
    e.preventDefault();
    dragQuestionRef.current = true;
    document.body.style.cursor = 'col-resize';
  };

  const startDragEditor = (e: React.MouseEvent) => {
    e.preventDefault();
    dragEditorRef.current = true;
    document.body.style.cursor = 'col-resize';
  };

  const setWidthPercent = (pct: number) => {
    const newWidth = Math.max(250, Math.min(1000, Math.round(window.innerWidth * pct)));
    setQuestionWidth(newWidth);
    localStorage.setItem('clahan_question_width', String(newWidth));
  };

  const saveCurrentCodeImmediately = async (solutionsSnapshot = codingSolutions) => {
    if (!currentAttempt?.id || Object.keys(solutionsSnapshot).length === 0) return;
    try {
      localStorage.setItem(`clahan_coding_sol_${currentAttempt.id}`, JSON.stringify(solutionsSnapshot));
      for (const questionId of Object.keys(solutionsSnapshot)) {
        const sol = solutionsSnapshot[questionId];
        await fetch(`${API_EXAMS}/student/attempts/${currentAttempt.id}/save-code`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ code: sol.code, language: sol.language, questionId })
        });
      }
    } catch (err) {
      console.error('Failed to save code immediately:', err);
    }
  };

  useEffect(() => {
    // 1. Sync ongoing attempt state to localStorage
    if (currentAttempt?.id) {
      localStorage.setItem(`clahan_active_section_${currentAttempt.id}`, selectedSection);
      localStorage.setItem(`clahan_active_index_${currentAttempt.id}`, activeQuestionIndex.toString());
    }

    // 2. Isolated question state: clear code execution results on question/section change
    setCodeExecutionResults([]);
    setCodeSummary(null);
    setIsRunningCode(false);
    setOutputTab('output');

    // 3. Log question navigation events to backend
    const currentQId = selectedSection === 'mcq' 
      ? examMCQs[activeQuestionIndex]?.id 
      : examCodings[activeQuestionIndex]?.id;

    const prevQId = prevSectionRef.current === 'mcq'
      ? examMCQs[prevQuestionIndexRef.current || 0]?.id
      : examCodings[prevQuestionIndexRef.current || 0]?.id;

    if (currentAttempt?.id && currentQId && prevQId && (prevQuestionIndexRef.current !== activeQuestionIndex || prevSectionRef.current !== selectedSection)) {
      fetch(`${API_EXAMS}/student/attempts/${currentAttempt.id}/navigation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          fromQuestionId: prevQId, 
          toQuestionId: currentQId, 
          section: selectedSection 
        })
      }).catch(err => console.warn('Failed to log navigation event:', err));
    }

    // Update refs for next change
    prevQuestionIndexRef.current = activeQuestionIndex;
    prevSectionRef.current = selectedSection;

  }, [activeQuestionIndex, selectedSection, currentAttempt?.id, examMCQs, examCodings]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragQuestionRef.current) {
        const sidebarW = isSidebarCollapsed ? 60 : 240;
        const newWidth = Math.max(250, Math.min(800, e.clientX - sidebarW));
        setQuestionWidth(newWidth);
        localStorage.setItem('clahan_question_width', String(newWidth));
      } else if (dragEditorRef.current) {
        const sidebarW = isSidebarCollapsed ? 60 : 240;
        const qW = isDescriptionCollapsed ? 0 : questionWidth;
        const newWidth = Math.max(300, Math.min(1000, e.clientX - sidebarW - qW));
        setEditorWidth(newWidth);
        localStorage.setItem('clahan_editor_width', String(newWidth));
      }
    };

    const handleMouseUp = () => {
      if (dragQuestionRef.current || dragEditorRef.current) {
        dragQuestionRef.current = false;
        dragEditorRef.current = false;
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSidebarCollapsed, isDescriptionCollapsed, questionWidth]);

  // Auto-Save Status
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);

  // Internet & Fullscreen Status
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Persist current question selection & reviews to local storage for recovery
  useEffect(() => {
    if (currentPage === 'exam-env' && currentAttempt?.id && validationStep === 'active') {
      localStorage.setItem(`clahan_active_section_${currentAttempt.id}`, selectedSection);
      localStorage.setItem(`clahan_active_index_${currentAttempt.id}`, String(activeQuestionIndex));
      localStorage.setItem(`clahan_marked_for_review_${currentAttempt.id}`, JSON.stringify(markedForReview));
    }
  }, [currentPage, currentAttempt?.id, validationStep, selectedSection, activeQuestionIndex, markedForReview]);

  // Unsaved changes warning on page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentPage === 'exam-env' && currentAttempt?.id) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes in your exam. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentPage, currentAttempt?.id]);

  // Periodic Auto-Save for coding solutions (runs every 10 seconds during exam)
  useEffect(() => {
    if (currentPage !== 'exam-env' || !currentAttempt?.id) return;

    const interval = setInterval(async () => {
      if (Object.keys(codingSolutions).length === 0) return;
      setAutoSaveStatus('saving');
      try {
        let success = true;
        // Save backup to localStorage
        localStorage.setItem(`clahan_coding_sol_${currentAttempt.id}`, JSON.stringify(codingSolutions));

        for (const questionId of Object.keys(codingSolutions)) {
          const sol = codingSolutions[questionId];
          const response = await fetch(`${API_EXAMS}/student/attempts/${currentAttempt.id}/save-code`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ code: sol.code, language: sol.language, questionId })
          });
          if (!response.ok) {
            success = false;
          }
        }
        if (success) {
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus(null), 2000);
        } else {
          setAutoSaveStatus('error');
        }
      } catch (err) {
        console.error('Auto-save error:', err);
        setAutoSaveStatus('error');
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [currentPage, currentAttempt?.id, codingSolutions, token]);

  // Proctor warnings
  const [tabWarnings, setTabWarnings] = useState(0);
  const [proctorLogs, setProctorLogs] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const [isExamLocked, setIsExamLocked] = useState(false);
  const timerRef = useRef<any>(null);
  
  // Real-time proctor socket client
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const proctorIntervalRef = useRef<any>(null);
  const currentPageRef = useRef(currentPage);
  const isSubmittingRef = useRef(false);
  const currentAttemptRef = useRef(currentAttempt);
  const currentExamRef = useRef(currentExam);
  const timeLeftRef = useRef(timeLeft);

  const handleTabSwitchRef = useRef<any>(null);
  const handleVisibilityChangeRef = useRef<any>(null);

  useEffect(() => {
    handleTabSwitchRef.current = handleTabSwitch;
    handleVisibilityChangeRef.current = handleVisibilityChange;
  });

  const stableTabSwitch = useCallback(() => {
    if (handleTabSwitchRef.current) handleTabSwitchRef.current();
  }, []);

  const stableVisibilityChange = useCallback(() => {
    if (handleVisibilityChangeRef.current) handleVisibilityChangeRef.current();
  }, []);

  // Synchronize webcam stream to active video element on page/step transitions
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      if (videoRef.current.srcObject !== cameraStream) {
        videoRef.current.srcObject = cameraStream;
      }
    }
  }, [currentPage, validationStep, cameraStream]);

  // View Result Detail State
  const [selectedResultAttemptId, setSelectedResultAttemptId] = useState<string | null>(null);
  const [detailedResult, setDetailedResult] = useState<any>(null);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path === '/admin-login' || path === '/admin-login/') {
        setCurrentPage('admin-login');
      } else if (path === '/login' || path === '/login/') {
        setCurrentPage('login');
      } else if (path === '/register' || path === '/register/') {
        setCurrentPage('register');
      } else {
        setCurrentPage('landing');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (currentPage === 'admin-login') {
      if (window.location.pathname !== '/admin-login') {
        window.history.pushState(null, '', '/admin-login');
      }
    } else if (currentPage === 'landing') {
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
    } else if (currentPage === 'login') {
      if (window.location.pathname !== '/login') {
        window.history.pushState(null, '', '/login');
      }
    } else if (currentPage === 'register') {
      if (window.location.pathname !== '/register') {
        window.history.pushState(null, '', '/register');
      }
    }
  }, [currentPage]);

  useEffect(() => {
    if (activeAdminTab !== 'live' || currentUser?.role !== 'admin') {
      if (adminSocketRef.current) {
        adminSocketRef.current.disconnect();
        adminSocketRef.current = null;
      }
      return;
    }

    // Fetch initial list of ongoing attempts
    const fetchLiveAttempts = async () => {
      try {
        const res = await fetch('/api/proctor/live', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setLiveSessions(data.map((s: any) => ({
            attemptId: s.attempt_id,
            studentId: s.student_id,
            studentName: s.student_name,
            rollNumber: s.roll_number || 'N/A',
            examName: s.exam_name,
            violationCount: parseInt(s.violation_count) || 0,
            status: 'active',
            recentViolations: s.recent_violations || []
          })));
        }
      } catch (err) {
        console.error('Failed to fetch live attempts:', err);
      }
    };
    fetchLiveAttempts();

    // Connect admin socket
    try {
      const socket = io('/', { path: '/socket.io' });
      adminSocketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join-exam', { token, attemptId: 'admin', examId: 'admin' });
      });

      socket.on('student-joined', (data: any) => {
        setLiveSessions(prev => {
          if (prev.some(s => s.attemptId === data.attemptId)) {
            return prev.map(s => s.attemptId === data.attemptId ? { ...s, status: 'active' } : s);
          }
          return [...prev, {
            attemptId: data.attemptId,
            studentId: data.studentId,
            studentName: data.studentName,
            rollNumber: data.rollNumber || 'N/A',
            examName: data.examName || 'Live Exam',
            violationCount: 0,
            status: 'active',
            recentViolations: []
          }];
        });
      });

      socket.on('fraud-alert', (data: any) => {
        const timestamp = new Date().toLocaleTimeString();
        setLiveAlerts(prev => [{
          attemptId: data.attemptId,
          studentId: data.studentId,
          eventType: data.eventType,
          details: data.details,
          severity: data.severity,
          timestamp
        }, ...prev].slice(0, 50));

        setLiveSessions(prev => prev.map(s => {
          if (s.attemptId === data.attemptId) {
            return {
              ...s,
              violationCount: s.violationCount + 1,
              recentViolations: [{
                event_type: data.eventType,
                details: data.details,
                severity: data.severity,
                created_at: new Date().toISOString()
              }, ...s.recentViolations].slice(0, 5)
            };
          }
          return s;
        }));
      });

      socket.on('student-terminated', (data: any) => {
        setLiveSessions(prev => prev.map(s => {
          if (s.attemptId === data.attemptId) {
            return { ...s, status: 'terminated' };
          }
          return s;
        }));
        const timestamp = new Date().toLocaleTimeString();
        setLiveAlerts(prev => [{
          attemptId: data.attemptId,
          studentId: data.studentId,
          eventType: 'TERMINATED',
          details: `Exam terminated: ${data.reason}`,
          severity: 'critical',
          timestamp
        }, ...prev].slice(0, 50));
      });

      socket.on('student-disconnected', (data: any) => {
        setLiveSessions(prev => prev.map(s => {
          if (s.attemptId === data.attemptId) {
            return { ...s, status: 'offline' };
          }
          return s;
        }));
      });

      socket.on('student-frame', (data: any) => {
        setLiveSessions(prev => prev.map(s => {
          if (s.attemptId === data.attemptId) {
            return { ...s, liveImage: data.image };
          }
          return s;
        }));
      });

    } catch (err) {
      console.error('Failed to establish admin proctoring socket:', err);
    }

    return () => {
      if (adminSocketRef.current) {
        adminSocketRef.current.disconnect();
        adminSocketRef.current = null;
      }
    };
  }, [activeAdminTab, currentUser]);

  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, validationStep]);

  useEffect(() => {
    if (currentPage !== 'exam-env') {
      setIsExamFullscreen(true);
      return;
    }

    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsExamFullscreen(isCurrentlyFullscreen);

      if (!isCurrentlyFullscreen) {
        setProctorLogs(p => [`[Violation] Fullscreen mode exited! (${new Date().toLocaleTimeString()})`, ...p]);
        
        if (socketRef.current) {
          socketRef.current.emit('proctor-event', {
            eventType: 'FULLSCREEN_EXIT',
            details: 'Candidate exited fullscreen mode',
            severity: 'warning'
          });
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    setIsExamFullscreen(!!document.fullscreenElement);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [currentPage]);

  // Keep currentPageRef in sync (fixes stale closure in tab-switch handlers)
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    currentAttemptRef.current = currentAttempt;
  }, [currentAttempt]);

  useEffect(() => {
    currentExamRef.current = currentExam;
  }, [currentExam]);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);
  
  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }>>([]);
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // REST API URL helpers
  const API_AUTH = '/api/auth';
  const API_ADMIN = '/api/admin';
  const API_STUDENT = '/api/student';
  const API_EXAMS = '/api/exams';

  // Toggle Dark/Light Mode
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Load Colleges & Departments on Mount / Auth state changes
  useEffect(() => {
    fetchColleges();
    if (token) {
      fetchCurrentUser();
    }
  }, [token]);

  const fetchColleges = async () => {
    try {
      const res = await fetch(`${API_AUTH}/colleges`);
      if (res.ok) {
        const data = await res.json();
        setColleges(data);
        setAdminColleges(data);
      } else {
        throw new Error(`Colleges API returned status ${res.status}`);
      }
    } catch (err: any) {
      console.error("fetchColleges error:", err);
      showToast(`Error fetching colleges: ${err.message}`, 'error');
    }
  };

  const fetchDepartments = async (collegeId: string) => {
    if (!collegeId) return;
    try {
      const res = await fetch(`${API_AUTH}/colleges/${collegeId}/departments`);
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
      } else {
        throw new Error(`Departments API returned status ${res.status}`);
      }
    } catch (err: any) {
      console.error("fetchDepartments error:", err);
      showToast(`Error fetching departments: ${err.message}`, 'error');
    }
  };

  const fetchBatches = async (collegeId: string) => {
    if (!collegeId) return;
    try {
      const res = await fetch(`${API_AUTH}/colleges/${collegeId}/batches`);
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
      } else {
        throw new Error(`Batches API returned status ${res.status}`);
      }
    } catch (err: any) {
      console.error("fetchBatches error:", err);
      showToast(`Error fetching batches: ${err.message}`, 'error');
    }
  };

  const fetchRegisterTrainers = async (collegeId: string) => {
    if (!collegeId) return;
    try {
      const res = await fetch(`${API_AUTH}/colleges/${collegeId}/trainers`);
      if (res.ok) {
        const data = await res.json();
        setRegisterTrainers(data);
      } else {
        throw new Error(`Trainers API returned status ${res.status}`);
      }
    } catch (err: any) {
      console.error("fetchRegisterTrainers error:", err);
      showToast(`Error fetching trainers: ${err.message}`, 'error');
    }
  };

  const fetchCurrentUser = async () => {
    const tryLocalDecode = () => {
      if (token) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const decodedUser: UserProfile = {
              id: payload.id,
              email: payload.email,
              role: payload.role || 'student',
              fullName: payload.full_name || payload.fullName || 'Student',
              rollNumber: payload.roll_number || payload.rollNumber || 'N/A',
              collegeId: payload.college_id || payload.collegeId || '',
              departmentId: payload.department_id || payload.departmentId || '',
              batchId: payload.batch_id || payload.batchId || '',
              trainerId: payload.trainer_id || payload.trainerId || '',
              trainerName: payload.trainer_name || payload.trainerName || 'None',
              year: payload.year || 'N/A',
              status: 'active',
              college_name: payload.college_name || 'Loading College...',
              department_name: payload.department_name || 'Loading Department...',
              batch_name: payload.batch_name || 'Loading Batch...'
            };
            setCurrentUser(decodedUser);
            setBatchUpdate(decodedUser.batchId || decodedUser.batch_id || '');
            setTrainerUpdate(decodedUser.trainerId || decodedUser.trainer_id || '');
            if (decodedUser.role === 'admin') {
              setCurrentPage('admin-dash');
              loadAdminDashboard();
            } else {
              setCurrentPage('student-dash');
              loadStudentDashboard();
              if (decodedUser.collegeId) {
                fetchBatches(decodedUser.collegeId);
              }
            }
            showToast('Using local session cache due to network latency.', 'warning');
          }
        } catch (e) {
          handleLogout();
        }
      } else {
        handleLogout();
      }
    };

    try {
      const res = await fetch(`${API_AUTH}/me?t=${Date.now()}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const user = await res.json();
         const mappedUser = {
          ...user,
          fullName: user.full_name || user.fullName,
          rollNumber: user.roll_number || user.rollNumber,
          profilePhotoUrl: user.profile_photo_url || user.profilePhotoUrl,
          githubProfile: user.github_profile || user.githubProfile,
          linkedinProfile: user.linkedin_profile || user.linkedinProfile,
          collegeId: user.college_id || user.collegeId,
          departmentId: user.department_id || user.departmentId,
          batchId: user.batch_id || user.batchId,
          batchName: user.batch_name || user.batchName,
          trainerId: user.trainer_id || user.trainerId,
          trainerName: user.trainer_name || user.trainerName || 'None',
        };
        setCurrentUser(mappedUser);
        setBatchUpdate(mappedUser.batchId || mappedUser.batch_id || '');
        setTrainerUpdate(mappedUser.trainerId || mappedUser.trainer_id || '');
        if (mappedUser.role === 'admin') {
          setCurrentPage('admin-dash');
          loadAdminDashboard();
        } else {
          setCurrentPage('student-dash');
          loadStudentDashboard();
          if (mappedUser.collegeId) {
            fetchBatches(mappedUser.collegeId);
          }
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          handleLogout();
        } else {
          tryLocalDecode();
        }
      }
    } catch (err) {
      tryLocalDecode();
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    setCurrentPage('landing');
    showToast('Logged out successfully', 'info');
  };

  // --- STUDENT API CALLS ---
  const loadStudentDashboard = async () => {
    try {
      const res = await fetch(`${API_STUDENT}/dashboard/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUpcomingExams(data.upcomingExams);
        setActiveExams(data.activeExams);
        setCompletedAttempts(data.completedExams);
      } else {
        throw new Error(`Student summary API returned status ${res.status}`);
      }
      
      const notifRes = await fetch(`${API_STUDENT}/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData);
      }

      const trainerRes = await fetch(`${API_STUDENT}/trainers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (trainerRes.ok) {
        setStudentTrainers(await trainerRes.json());
      }
    } catch (err: any) {
      console.error("Student dashboard APIs error:", err);
      showToast(`Error loading dashboard: ${err.message}`, 'error');
    }
  };

  const updateStudentProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_STUDENT}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: phoneUpdate,
          githubProfile: githubUpdate,
          linkedinProfile: linkedinUpdate,
          profilePhotoUrl: photoUpdate,
          batchId: batchUpdate || '',
          trainerId: trainerUpdate || ''
        })
      });
      if (res.ok) {
        showToast('Profile updated successfully!');
        fetchCurrentUser();
      } else {
        const data = await res.json();
        showToast(data.error || 'Update failed', 'error');
      }
    } catch (err: any) {
      console.error("updateStudentProfile error:", err);
      showToast(`Error updating profile: ${err.message}`, 'error');
    }
  };

  const changeStudentPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newProfilePassword) {
      return showToast('Both password fields are required.', 'error');
    }
    try {
      const res = await fetch(`${API_AUTH}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword: newProfilePassword
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Password updated successfully!');
        setCurrentPassword('');
        setNewProfilePassword('');
      } else {
        showToast(data.error || 'Password update failed', 'error');
      }
    } catch (err) {
      showToast('Password updated successfully (Simulated)');
      setCurrentPassword('');
      setNewProfilePassword('');
    }
  };

  // --- ADMIN API CALLS ---
  const loadAdminDashboard = async () => {
    try {
      // Load metrics
      const metricsRes = await fetch(`${API_ADMIN}/dashboard/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (metricsRes.ok) {
        setAdminMetrics(await metricsRes.json());
      } else {
        throw new Error(`Metrics API returned status ${metricsRes.status}`);
      }
      
      // Load students
      const studRes = await fetch(`${API_ADMIN}/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (studRes.ok) {
        const rawStudents = await studRes.json();
        const mappedStudents = rawStudents.map((s: any) => ({
          ...s,
          fullName: s.full_name || s.fullName,
          rollNumber: s.roll_number || s.rollNumber,
          collegeId: s.college_id || s.collegeId,
          departmentId: s.department_id || s.departmentId,
          batchId: s.batch_id || s.batchId,
          batchName: s.batch_name || s.batchName,
          trainerId: s.trainer_id || s.trainerId,
          trainerName: s.trainer_name || s.trainerName,
        }));
        setAdminStudents(mappedStudents);
      }

      // Load exams
      const examRes = await fetch(`${API_EXAMS}/admin`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (examRes.ok) {
        setAdminExams(await examRes.json());
      }

      // Load departments for settings
      const deptRes = await fetch(`${API_ADMIN}/departments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (deptRes.ok) {
        setAdminDepts(await deptRes.json());
      }

      // Load batches for settings
      const batchRes = await fetch(`${API_ADMIN}/batches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (batchRes.ok) {
        setAdminBatches(await batchRes.json());
      }

      // Load trainers for settings
      const trainerRes = await fetch(`${API_ADMIN}/trainers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (trainerRes.ok) {
        setAdminTrainers(await trainerRes.json());
      }

    } catch (err: any) {
      console.error("Admin dashboard load error:", err);
      showToast(`Error loading admin dashboard: ${err.message}`, 'error');
    }
  };

  const loadAdminExamQuestions = async (examId: string) => {
    try {
      const res = await fetch(`${API_EXAMS}/${examId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminSelectedExamMCQs(data.mcqQuestions || []);
        setAdminSelectedExamCodings(data.codingQuestions || []);
      }
    } catch (err) {
      console.error("Error loading questions for admin", err);
    }
  };

  const createCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollegeName) return;
    try {
      const res = await fetch(`${API_ADMIN}/colleges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newCollegeName })
      });
      if (res.ok) {
        showToast('College added successfully!');
        setNewCollegeName('');
        fetchColleges();
        loadAdminDashboard();
      } else {
        throw new Error(`Colleges API returned status ${res.status}`);
      }
    } catch (err) {
      // Mock insert
      const newCol = { id: `col-${Date.now()}`, name: newCollegeName };
      setAdminColleges(prev => [...prev, newCol]);
      setColleges(prev => [...prev, newCol]);
      setNewCollegeName('');
      showToast('College added successfully (Simulated)');
    }
  };

  const createDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName || !newDeptCollegeId) return;
    try {
      const res = await fetch(`${API_ADMIN}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collegeId: newDeptCollegeId, name: newDeptName })
      });
      if (res.ok) {
        showToast('Department added successfully!');
        setNewDeptName('');
        // Reload departments
        fetchDepartments(newDeptCollegeId);
        loadAdminDashboard();
      } else {
        throw new Error(`Departments API returned status ${res.status}`);
      }
    } catch (err) {
      const mockD = { id: `dept-${Date.now()}`, college_id: newDeptCollegeId, name: newDeptName, college_name: adminColleges.find(c => c.id === newDeptCollegeId)?.name || 'Default' };
      setAdminDepts(prev => [...prev, mockD]);
      setNewDeptName('');
      showToast('Department added successfully (Simulated)');
    }
  };

  const createBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchName || !newBatchCollegeId) return;
    try {
      const res = await fetch(`${API_ADMIN}/colleges/${newBatchCollegeId}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newBatchName })
      });
      if (res.ok) {
        showToast('Batch added successfully!');
        setNewBatchName('');
        fetchBatches(newBatchCollegeId);
        loadAdminDashboard();
      } else {
        throw new Error(`Batches API returned status ${res.status}`);
      }
    } catch (err) {
      const mockB = { id: `batch-${Date.now()}`, college_id: newBatchCollegeId, name: newBatchName, college_name: adminColleges.find(c => c.id === newBatchCollegeId)?.name || 'Default' };
      setAdminBatches(prev => [...prev, mockB]);
      setNewBatchName('');
      showToast('Batch added successfully (Simulated)');
    }
  };

  const deleteCollege = async (id: string) => {
    if (!confirm('Are you sure you want to delete this college? This will delete all associated departments, batches, students, and exams.')) return;
    try {
      const res = await fetch(`${API_ADMIN}/colleges/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('College deleted successfully');
        fetchColleges();
        loadAdminDashboard();
      } else {
        throw new Error('Failed to delete college');
      }
    } catch (err) {
      setAdminColleges(prev => prev.filter(c => c.id !== id));
      setColleges(prev => prev.filter(c => c.id !== id));
      showToast('College deleted (Simulated)');
    }
  };

  const deleteDepartment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
      const res = await fetch(`${API_ADMIN}/departments/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Department deleted successfully');
        loadAdminDashboard();
      } else {
        throw new Error('Failed to delete department');
      }
    } catch (err) {
      setAdminDepts(prev => prev.filter(d => d.id !== id));
      showToast('Department deleted (Simulated)');
    }
  };

  const deleteBatch = async (id: string) => {
    if (!confirm('Are you sure you want to delete this batch?')) return;
    try {
      const res = await fetch(`${API_ADMIN}/batches/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Batch deleted successfully');
        loadAdminDashboard();
      } else {
        throw new Error('Failed to delete batch');
      }
    } catch (err) {
      setAdminBatches(prev => prev.filter(b => b.id !== id));
      showToast('Batch deleted (Simulated)');
    }
  };

  const createOrUpdateTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainerForm.name || !trainerForm.email) {
      showToast('Name and Email are required', 'error');
      return;
    }
    try {
      const url = editingTrainerId 
        ? `${API_ADMIN}/trainers/${editingTrainerId}`
        : `${API_ADMIN}/trainers`;
      const method = editingTrainerId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(trainerForm)
      });
      if (res.ok) {
        showToast(editingTrainerId ? 'Trainer updated successfully!' : 'Trainer added successfully!');
        setTrainerForm({ name: '', email: '', phone: '', specialization: '', collegeId: '', batchId: '' });
        setEditingTrainerId(null);
        loadAdminDashboard();
      } else {
        const errorData = await res.json();
        showToast(errorData.error || `Trainer API returned status ${res.status}`, 'error');
      }
    } catch (err: any) {
      console.error("Trainer error:", err);
      showToast(err.message || 'A network error occurred while saving the trainer', 'error');
    }
  };

  const deleteTrainer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trainer?')) return;
    try {
      const res = await fetch(`${API_ADMIN}/trainers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Trainer deleted successfully');
        loadAdminDashboard();
      } else {
        throw new Error('Failed to delete trainer');
      }
    } catch (err) {
      setAdminTrainers(prev => prev.filter(t => t.id !== id));
      showToast('Trainer deleted (Simulated)');
    }
  };

  const startEditTrainer = (trainer: any) => {
    setEditingTrainerId(trainer.id);
    setTrainerForm({
      name: trainer.name || '',
      email: trainer.email || '',
      phone: trainer.phone || '',
      specialization: trainer.specialization || '',
      collegeId: trainer.college_id || trainer.collegeId || '',
      batchId: trainer.batch_id || trainer.batchId || ''
    });
  };

  const cancelEditTrainer = () => {
    setEditingTrainerId(null);
    setTrainerForm({ name: '', email: '', phone: '', specialization: '', collegeId: '', batchId: '' });
  };

  const createStudentManual = async (studentData: any) => {
    try {
      const res = await fetch(`${API_ADMIN}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(studentData)
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Student created! Temporary password: ${data.generatedPassword}`);
        loadAdminDashboard();
      } else {
        showToast(data.error || 'Failed to add student', 'error');
      }
    } catch (err) {
      // Simulate
      const mockS: any = {
        id: `std-${Date.now()}`,
        email: studentData.email,
        role: 'student',
        fullName: studentData.fullName,
        rollNumber: studentData.rollNumber,
        status: 'active',
        college_name: colleges.find(c => c.id === studentData.collegeId)?.name || 'College',
        department_name: 'CSE',
        year: studentData.year,
        email_verified: true,
        trainer_id: studentData.trainerId || null,
        trainer_name: adminTrainers.find(t => t.id === studentData.trainerId)?.name || null
      };
      setAdminStudents(prev => [mockS, ...prev]);
      showToast(`Student created! Temporary password: Clahan@${Math.floor(1000 + Math.random() * 9000)} (Simulated)`);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      showToast('Please select a valid CSV or Excel (.xlsx, .xls) file.', 'error');
      return;
    }

    const reader = new FileReader();
    if (name.endsWith('.csv')) {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setStudentCsvInput(text);
          const rowsCount = text.split('\n').filter(line => line.trim()).length - 1;
          showToast(`Loaded ${rowsCount > 0 ? rowsCount : 0} student records. Click "Upload" to finalize.`, 'success');
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csv = XLSX.utils.sheet_to_csv(worksheet);
          if (csv) {
            setStudentCsvInput(csv);
            const rowsCount = csv.split('\n').filter(line => line.trim()).length - 1;
            showToast(`Loaded ${rowsCount > 0 ? rowsCount : 0} student records from Excel. Click "Upload" to finalize.`, 'success');
          } else {
            showToast('The Excel file is empty or could not be read.', 'error');
          }
        } catch (err: any) {
          showToast(`Error parsing Excel file: ${err.message}`, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const importStudentsCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentCsvInput.trim()) return;
    try {
      const res = await fetch(`${API_ADMIN}/students/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csvContent: studentCsvInput })
      });
      const data = await res.json();
      if (res.ok) {
        setImportSummary(data.summary);
        showToast('Bulk student import completed!');
        loadAdminDashboard();
      } else {
        showToast(data.error || 'Import failed', 'error');
      }
    } catch (err) {
      // Parse CSV clientside for simulation
      let sanitizedContent = studentCsvInput;
      if (sanitizedContent.startsWith('\ufeff')) {
        sanitizedContent = sanitizedContent.slice(1);
      }
      const lines = sanitizedContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      const rows = lines.slice(1);
      const parsed: UserProfile[] = [];
      let success = 0, failed = 0;
      let delimiter = ',';
      if (lines[0] && lines[0].includes(';')) {
        delimiter = ';';
      }
      rows.forEach((row, index) => {
        const parts = row.split(delimiter);
        if (parts.length >= 7) {
          success++;
          parsed.push({
            id: `std-csv-${index}-${Date.now()}`,
            email: parts[1],
            role: 'student',
            fullName: parts[0],
            rollNumber: parts[3],
            status: 'active',
            college_name: parts[4],
            department_name: parts[5],
            year: parts[6],
            email_verified: true
          });
        } else {
          failed++;
        }
      });
      setAdminStudents(prev => [...parsed, ...prev]);
      setImportSummary({ success, failed, errors: failed > 0 ? ['Some rows had missing fields'] : [] });
      showToast(`Import completed (Simulated): ${success} succeeded, ${failed} failed`);
    }
  };

  const deleteStudent = async (id: string) => {
    if (!confirm('Are you sure you want to remove this student?')) return;
    try {
      const res = await fetch(`${API_ADMIN}/students/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Student deleted');
        loadAdminDashboard();
      }
    } catch (err) {
      setAdminStudents(prev => prev.filter(s => s.id !== id));
      showToast('Student deleted (Simulated)');
    }
  };

  const resetStudentPassword = async (id: string) => {
    try {
      const res = await fetch(`${API_ADMIN}/students/${id}/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert(`New generated password: ${data.generatedPassword}`);
      }
    } catch (err) {
      alert(`New password generated (Simulated): Clahan@${Math.floor(1000 + Math.random() * 9000)}`);
    }
  };

  const updateStudentBatch = async (studentId: string, batchId: string) => {
    try {
      const res = await fetch(`${API_ADMIN}/students/${studentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          batchId: batchId || null
        })
      });
      if (res.ok) {
        showToast('Student batch updated successfully!');
        loadAdminDashboard();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to update student batch', 'error');
      }
    } catch (err: any) {
      setAdminStudents(prev => prev.map(s => {
        if (s.id === studentId) {
          const selectedBatchObj = adminBatches.find(b => b.id === batchId);
          return {
            ...s,
            batch_id: batchId || null,
            batch_name: selectedBatchObj ? selectedBatchObj.name : null
          };
        }
        return s;
      }));
      showToast('Student batch updated successfully (Simulated)');
    }
  };

  const updateStudentTrainer = async (studentId: string, trainerId: string) => {
    try {
      const res = await fetch(`${API_ADMIN}/students/${studentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          trainerId: trainerId || null
        })
      });
      if (res.ok) {
        showToast('Student trainer updated successfully!');
        loadAdminDashboard();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to update student trainer', 'error');
      }
    } catch (err: any) {
      setAdminStudents(prev => prev.map(s => {
        if (s.id === studentId) {
          const selectedTrainerObj = adminTrainers.find(t => t.id === trainerId);
          return {
            ...s,
            trainer_id: trainerId || null,
            trainer_name: selectedTrainerObj ? selectedTrainerObj.name : null
          };
        }
        return s;
      }));
      showToast('Student trainer updated successfully (Simulated)');
    }
  };

  const createExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...examForm,
        scheduleDate: examForm.scheduleDate ? new Date(examForm.scheduleDate).toISOString() : new Date().toISOString()
      };
      const res = await fetch(`${API_EXAMS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        showToast('Exam created successfully. Now customize questions.');
        setSelectedExamIdForQuestions(data.id);
        loadAdminExamQuestions(data.id);
        setCurrentPage('questions-editor');
        loadAdminDashboard();
      } else {
        throw new Error(`Exams API returned status ${res.status}`);
      }
    } catch (err) {
      const mockId = `exam-${Date.now()}`;
      const mockE = {
        id: mockId,
        name: examForm.name,
        exam_type: examForm.examType,
        duration_minutes: examForm.durationMinutes,
        cutoff_percentage: examForm.cutoffPercentage,
        allowed_attempts: examForm.allowedAttempts,
        schedule_date: examForm.scheduleDate ? new Date(examForm.scheduleDate).toISOString() : new Date().toISOString(),
        window_open_minutes: examForm.windowOpenMinutes || 10,
        is_published: false,
        mcq_count: 0,
        coding_count: 0,
        college_name: colleges.find(c => c.id === examForm.collegeId)?.name || 'College',
        department_name: 'CSE',
        year: examForm.year,
        enable_face_detection: examForm.enableFaceDetection !== false
      };
      setAdminExams(prev => [mockE, ...prev]);
      setSelectedExamIdForQuestions(mockId);
      setCurrentPage('questions-editor');
      showToast('Exam created successfully (Simulated). Add questions now.');
    }
  };

  const updateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExamId) return;
    try {
      const payload = {
        ...examForm,
        scheduleDate: examForm.scheduleDate ? new Date(examForm.scheduleDate).toISOString() : new Date().toISOString()
      };
      const res = await fetch(`${API_EXAMS}/${editingExamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Exam configuration updated successfully!');
        setEditingExamId(null);
        setExamForm({
          name: '', description: '', examType: 'mcq' as 'mcq' | 'coding' | 'both',
          durationMinutes: 60, cutoffPercentage: 50, allowedAttempts: 1, scheduleDate: getLocalDatetimeString(),
          windowOpenMinutes: 10,
          collegeId: '', departmentId: '', departmentIds: [], batchId: '', trainerId: '', year: '1st Year',
          enableFaceDetection: true
        });
        loadAdminDashboard();
      }
    } catch (err) {
      setAdminExams(prev => prev.map(e => e.id === editingExamId ? {
        ...e,
        name: examForm.name,
        exam_type: examForm.examType,
        duration_minutes: examForm.durationMinutes,
        cutoff_percentage: examForm.cutoffPercentage,
        allowed_attempts: examForm.allowedAttempts,
        schedule_date: examForm.scheduleDate ? new Date(examForm.scheduleDate).toISOString() : new Date().toISOString(),
        window_open_minutes: examForm.windowOpenMinutes,
        year: examForm.year,
        college_id: examForm.collegeId,
        department_id: examForm.departmentId,
        department_ids: examForm.departmentIds,
        batch_id: examForm.batchId,
        trainer_id: examForm.trainerId,
        enable_face_detection: examForm.enableFaceDetection !== false
      } : e));
      setEditingExamId(null);
      setExamForm({
        name: '', description: '', examType: 'mcq' as 'mcq' | 'coding' | 'both',
        durationMinutes: 60, cutoffPercentage: 50, allowedAttempts: 1, scheduleDate: getLocalDatetimeString(),
        windowOpenMinutes: 10,
        collegeId: '', departmentId: '', departmentIds: [], batchId: '', trainerId: '', year: '1st Year',
        enableFaceDetection: true
      });
      showToast('Exam configuration updated successfully (Simulated)');
    }
  };

  const startEditingExam = (ex: Exam) => {
    let localSched = '';
    if (ex.schedule_date) {
      try {
        const d = new Date(ex.schedule_date);
        const tzoffset = d.getTimezoneOffset() * 60000;
        localSched = new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
      } catch (err) {
        localSched = ex.schedule_date.slice(0, 16);
      }
    } else {
      localSched = getLocalDatetimeString();
    }
    setExamForm({
      name: ex.name,
      description: ex.description || '',
      examType: ex.exam_type,
      durationMinutes: ex.duration_minutes,
      cutoffPercentage: ex.cutoff_percentage,
      allowedAttempts: ex.allowed_attempts || 1,
      scheduleDate: localSched,
      windowOpenMinutes: ex.window_open_minutes !== undefined ? ex.window_open_minutes : 10,
      collegeId: ex.college_id || '',
      departmentId: ex.department_id || '',
      departmentIds: ex.department_ids || (ex.department_id ? [ex.department_id] : []),
      batchId: ex.batch_id || '',
      trainerId: ex.trainer_id || '',
      year: ex.year || '1st Year',
      enableFaceDetection: ex.enable_face_detection !== false
    });
    if (ex.college_id) {
      fetchDepartments(ex.college_id);
      fetchBatches(ex.college_id);
    }
    setEditingExamId(ex.id);
    
    const formElement = document.getElementById('exam-configuration-card');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const downloadMcqTemplate = () => {
    const headers = 'Question,Option A,Option B,Option C,Option D,Correct Answer,Marks,Difficulty\n';
    const sample = 'What is the correct way to write a Python comment?,# Comment,// Comment,/* Comment */,<! Comment >,A,1,easy\n';
    const blob = new Blob([headers + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'mcq_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMcqFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedMcqFileName(file.name);
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      showToast('Please select a valid CSV or Excel (.xlsx, .xls) file.', 'error');
      return;
    }

    const reader = new FileReader();
    if (name.endsWith('.csv')) {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setMcqCsvInput(text);
        showToast(`Loaded "${file.name}"! Click "Import MCQ CSV" to upload.`, 'success');
      };
      reader.readAsText(file);
    } else {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csv = XLSX.utils.sheet_to_csv(worksheet);
          if (csv) {
            setMcqCsvInput(csv);
            showToast(`Loaded "${file.name}" from Excel! Click "Import MCQ CSV" to upload.`, 'success');
          } else {
            showToast('The Excel file is empty or could not be read.', 'error');
          }
        } catch (err: any) {
          showToast(`Error parsing Excel file: ${err.message}`, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const loadAdminExamResults = async (examId: string, examName: string) => {
    try {
      const res = await fetch(`${API_EXAMS}/${examId}/results`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminSelectedExamResults(data);
        setSelectedExamIdForResults(examId);
        setSelectedExamNameForResults(examName);
        showToast(`Loaded results for "${examName}"`, 'success');
      } else {
        showToast('Failed to load exam results.', 'error');
      }
    } catch (err) {
      setAdminSelectedExamResults([
        { id: '1', full_name: 'John Doe', roll_number: 'CS202601', department_name: 'Computer Science', year: '3rd Year', score: 14, maxScore: 15, percentage: 93.33, passed: true, created_at: new Date().toISOString() },
        { id: '2', full_name: 'Jane Smith', roll_number: 'CS202602', department_name: 'Computer Science', year: '3rd Year', score: 11, maxScore: 15, percentage: 73.33, passed: true, created_at: new Date().toISOString() },
        { id: '3', full_name: 'Bob Johnson', roll_number: 'CS202603', department_name: 'Computer Science', year: '3rd Year', score: 7, maxScore: 15, percentage: 46.67, passed: false, created_at: new Date().toISOString() }
      ]);
      setSelectedExamIdForResults(examId);
      setSelectedExamNameForResults(examName);
      showToast('Loaded simulated exam results (Offline mode).', 'warning');
    }
  };

  const downloadExamResultsCsv = () => {
    if (adminSelectedExamResults.length === 0) {
      showToast('No results available to download.', 'error');
      return;
    }
    const headers = 'Student Name,Roll Number,Department,Year,Score,Percentage,Status,Reason,Submission Date\n';
    const rows = adminSelectedExamResults.map(r => {
      const status = r.status === 'terminated' ? 'TERMINATED' : r.passed ? 'PASSED' : 'FAILED';
      const reason = r.status === 'terminated' && r.feedback ? r.feedback.replace(/"/g, '""') : '';
      const date = new Date(r.created_at).toLocaleDateString();
      return `"${r.full_name || 'N/A'}","${r.roll_number || 'N/A'}","${r.department_name || 'N/A'}","${r.year || 'N/A'}",${r.score},${r.percentage}%,${status},"${reason}","${date}"`;
    }).join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `results_${selectedExamNameForResults.replace(/\s+/g, '_').toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloaded results CSV successfully!', 'success');
  };

  const downloadStudentsExcel = () => {
    const filtered = adminStudents.filter(student => {
      if (studentFilterCollegeId && student.collegeId !== studentFilterCollegeId) return false;
      if (studentFilterDeptId && student.departmentId !== studentFilterDeptId) return false;
      if (studentFilterBatchId && student.batchId !== studentFilterBatchId) return false;
      if (studentFilterTrainerId && (student.trainerId || student.trainer_id) !== studentFilterTrainerId) return false;
      if (studentFilterYear && student.year !== studentFilterYear) return false;
      return true;
    });

    if (filtered.length === 0) {
      showToast('No students matching the selected filters to download.', 'error');
      return;
    }
    const headers = 'Full Name,Email,Password,Phone,Roll Number,College,Department,Year,Status\n';
    const rows = filtered.map(s => {
      const fullName = s.fullName || s.full_name || 'N/A';
      const email = s.email || 'N/A';
      const password = s.raw_password || s.rawPassword || 'N/A';
      const phone = s.phone || 'N/A';
      const rollNumber = s.rollNumber || s.roll_number || 'N/A';
      const college = s.college_name || 'N/A';
      const dept = s.department_name || 'N/A';
      const year = s.year || 'N/A';
      const status = s.status || 'N/A';
      return `"${fullName.replace(/"/g, '""')}","${email.replace(/"/g, '""')}","${password.replace(/"/g, '""')}","${phone.replace(/"/g, '""')}","${rollNumber.replace(/"/g, '""')}","${college.replace(/"/g, '""')}","${dept.replace(/"/g, '""')}","${year.replace(/"/g, '""')}","${status.replace(/"/g, '""')}"`;
    }).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'registered_students.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloaded registered students CSV successfully!', 'success');
  };

  const publishExam = async (id: string) => {
    try {
      const res = await fetch(`${API_EXAMS}/${id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Exam published to students!');
        loadAdminDashboard();
      }
    } catch (err) {
      setAdminExams(prev => prev.map(e => e.id === id ? { ...e, is_published: true } : e));
      showToast('Exam published successfully (Simulated)');
    }
  };

  const duplicateExam = async (id: string) => {
    try {
      const res = await fetch(`${API_EXAMS}/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Exam duplicated successfully');
        loadAdminDashboard();
      }
    } catch (err) {
      const target = adminExams.find(e => e.id === id);
      if (target) {
        const copy = { ...target, id: `exam-${Date.now()}`, name: `Copy of ${target.name}`, is_published: false };
        setAdminExams(prev => [copy, ...prev]);
        showToast('Exam duplicated successfully (Simulated)');
      }
    }
  };

  const deleteExam = async (id: string) => {
    if (!confirm('Are you sure you want to delete this exam?')) return;
    try {
      await fetch(`${API_EXAMS}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Exam deleted');
      loadAdminDashboard();
    } catch (err) {
      setAdminExams(prev => prev.filter(e => e.id !== id));
      showToast('Exam deleted (Simulated)');
    }
  };

  const addMcqQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamIdForQuestions) return;
    try {
      const res = await fetch(`${API_EXAMS}/${selectedExamIdForQuestions}/mcq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(mcqForm)
      });
      if (res.ok) {
        showToast('MCQ Question added');
        setMcqForm({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A', marks: 1, difficulty: 'medium' });
        loadAdminExamQuestions(selectedExamIdForQuestions);
        loadAdminDashboard();
      }
    } catch (err) {
      setAdminExams(prev => prev.map(e => e.id === selectedExamIdForQuestions ? { ...e, mcq_count: (e.mcq_count || 0) + 1 } : e));
      const mockMcq: MCQQuestion = {
        id: `mock-q-${Date.now()}`,
        question: mcqForm.question,
        option_a: mcqForm.optionA,
        option_b: mcqForm.optionB,
        option_c: mcqForm.optionC,
        option_d: mcqForm.optionD,
        correct_answer: mcqForm.correctAnswer,
        marks: mcqForm.marks,
        difficulty: mcqForm.difficulty
      };
      setAdminSelectedExamMCQs(prev => [...prev, mockMcq]);
      setMcqForm({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A', marks: 1, difficulty: 'medium' });
      showToast('MCQ Question added (Simulated)');
    }
  };

  const importMcqCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamIdForQuestions || !mcqCsvInput.trim()) return;
    try {
      const res = await fetch(`${API_EXAMS}/${selectedExamIdForQuestions}/mcq/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csvContent: mcqCsvInput })
      });
      if (res.ok) {
        showToast('MCQ Questions imported successfully!');
        setMcqCsvInput('');
        setSelectedMcqFileName(null);
        loadAdminExamQuestions(selectedExamIdForQuestions);
        loadAdminDashboard();
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Failed to import MCQ questions.' }));
        showToast(`Import Error: ${errorData.error || 'Server error'}`, 'error');
      }
    } catch (err: any) {
      const lines = mcqCsvInput.split('\n').filter(l => l.trim().length > 0).slice(1);
      setAdminExams(prev => prev.map(e => e.id === selectedExamIdForQuestions ? { ...e, mcq_count: (e.mcq_count || 0) + lines.length } : e));
      const imported: MCQQuestion[] = lines.map((line, idx) => {
        const parts = line.split(',');
        return {
          id: `mock-imported-${Date.now()}-${idx}`,
          question: parts[0] || 'Imported MCQ',
          option_a: parts[1] || 'A',
          option_b: parts[2] || 'B',
          option_c: parts[3] || 'C',
          option_d: parts[4] || 'D',
          correct_answer: parts[5] || 'A',
          marks: parseInt(parts[6]) || 1,
          difficulty: parts[7] || 'medium'
        };
      });
      setAdminSelectedExamMCQs(prev => [...prev, ...imported]);
      setMcqCsvInput('');
      setSelectedMcqFileName(null);
      showToast(`MCQ Questions imported successfully (Simulated, count: ${lines.length})`);
    }
  };

  const addCodingQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamIdForQuestions) return;
    const data = { ...codingForm, testCases: codingTestCases };
    try {
      const res = await fetch(`${API_EXAMS}/${selectedExamIdForQuestions}/coding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        showToast('Coding question added successfully');
        setCodingForm({ title: '', description: '', difficulty: 'medium', marks: 10, language: 'Python', starterCode: '', timeLimit: 2000, memoryLimit: 512000 });
        setCodingTestCases([]);
        loadAdminExamQuestions(selectedExamIdForQuestions);
        loadAdminDashboard();
      }
    } catch (err) {
      setAdminExams(prev => prev.map(e => e.id === selectedExamIdForQuestions ? { ...e, coding_count: (e.coding_count || 0) + 1 } : e));
      const mockCoding: CodingQuestion = {
        id: `mock-c-${Date.now()}`,
        title: codingForm.title,
        description: codingForm.description,
        difficulty: codingForm.difficulty,
        marks: codingForm.marks,
        language: codingForm.language,
        starter_code: codingForm.starterCode,
        time_limit: codingForm.timeLimit,
        memory_limit: codingForm.memoryLimit
      };
      setAdminSelectedExamCodings(prev => [...prev, mockCoding]);
      showToast('Coding question added successfully (Simulated)');
      setCodingForm({ title: '', description: '', difficulty: 'medium', marks: 10, language: 'Python', starterCode: '', timeLimit: 2000, memoryLimit: 512000 });
      setCodingTestCases([]);
    }
  };

  const addTestCaseInput = () => {
    setCodingTestCases(prev => [...prev, { input: '', expected_output: '', isHidden: false }]);
  };

  // --- EXAM ENVIRONMENT HANDLERS ---
  const checkInstructions = async (examId: string) => {
    try {
      const res = await fetch(`${API_EXAMS}/student/${examId}/instructions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentExam(data.exam);
        setValidationStep('instructions');
        setCurrentPage('exam-env');
      } else {
        const data = await res.json();
        showToast(data.error || 'Access denied', 'error');
      }
    } catch (err: any) {
      showToast('Network error: Unable to verify exam authorization. Please check your connection.', 'error');
    }
  };

  const verifyFacePeriodically = async (retryCount: number = 0) => {
    if (currentExam && (currentExam.enable_face_detection === false || currentExam.enableFaceDetection === false)) {
      setFaceCheck(true);
      setHardwareProgress(100);
      return;
    }
    if (!videoRef.current) {
      setHardwareProgress(75);
      return;
    }
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setHardwareProgress(75);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.80);

      const verifyRes = await fetch('/api/proctor/verify-face', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ image: dataUrl })
      });

      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        
        // Update debug states during verification step as well!
        setFaceConfidence(verifyData.faceConfidence || 0);
        setFaceTrackingActive(verifyData.trackingStatus !== 'Face Lost');
        setNoFaceTimer(verifyData.elapsedLost || 0);
        
        // State Transition Logging for verification
        setFaceDetected(prev => {
          const present = verifyData.faceCount > 0;
          if (prev !== present) {
            logDebugEvent(present ? 'Face Detected' : 'Face Lost');
          }
          return present;
        });

        if (verifyData.faceCount > 0) {
          setLastFaceSeen(new Date().toLocaleTimeString());
        }
        
        let fraudState = 'Normal';
        if (verifyData.violations && verifyData.violations.length > 0) {
          fraudState = `Warning: ${verifyData.violations.join(', ')}`;
        }
        setActiveFraudState(fraudState);

        // FPS calculation
        const now = Date.now();
        if (lastFrameTimeRef.current) {
          const currentFps = 1000 / (now - lastFrameTimeRef.current);
          setDetectionFps(parseFloat(currentFps.toFixed(1)));
        }
        lastFrameTimeRef.current = now;

        if (verifyData.verified && verifyData.faceCount === 1) {
          setFaceCheck(true);
          setHardwareProgress(100);
          showToast('Face verification completed successfully!', 'success');
        } else {
          // If we failed but camera permission is active, retry up to 15 times (30 seconds)
          if (retryCount < 15) {
            showToast('Face not detected or multiple people present. Adjust your camera and look directly at it.', 'warning');
            setTimeout(() => verifyFacePeriodically(retryCount + 1), 2000);
          } else {
            showToast('Face verification timed out. Please look at the camera and click retry.', 'error');
            setHardwareProgress(75);
          }
        }
      } else {
        throw new Error("API call returned failure status");
      }
    } catch (err) {
      console.error("Face verification API call failed:", err);
      showToast('Face verification server error. Please ensure camera is well lit and click retry.', 'error');
      setHardwareProgress(75);
    }
  };

  const requestHardwarePermissions = async () => {
    setValidationStep('validation');
    setHardwareProgress(10);
    setCameraPermission(false);
    setMicPermission(false);
    setFaceCheck(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Security Block: Browsers restrict camera/microphone access on non-secure (HTTP) connections. Please host over HTTPS or test on localhost.");
      setHardwareProgress(0);
      return;
    }

    try {
      setHardwareProgress(25);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraPermission(true);
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHardwareProgress(50);

      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getTracks().forEach(track => track.stop());
      setMicPermission(true);
      setHardwareProgress(75);

      setTimeout(() => {
        verifyFacePeriodically(0);
      }, 1500);

    } catch (err: any) {
      console.error("Hardware permission denied:", err);
      alert(`Hardware Access Denied: Please allow access to your camera and microphone in your browser settings to proceed with the proctored exam.\nDetails: ${err.message || err}`);
      setHardwareProgress(0);
    }
  };

  const requestFullscreenHelper = async () => {
    const el = document.documentElement as any;
    const requestMethod = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (requestMethod) {
      try {
        await requestMethod.call(el);
        setIsExamFullscreen(true);
        return true;
      } catch (err) {
        console.warn("Fullscreen request rejected:", err);
        return false;
      }
    } else {
      setIsExamFullscreen(true);
      return true;
    }
  };

  const enterFullscreen = () => {
    requestFullscreenHelper().then(() => setFullscreenCheck(true));
  };

  const startExamAttempt = async () => {
    if (!currentExam) return;
    try {
      const res = await fetch(`${API_EXAMS}/student/${currentExam.id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const attempt = await res.json();
        setCurrentAttempt(attempt);
        loadAttemptQuestions(attempt.id);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to start exam attempt', 'error');
      }
    } catch (err) {
      showToast('Network error: Failed to connect to exam server. Please retry.', 'error');
    }
  };

  const loadAttemptQuestions = async (attemptId: string) => {
    try {
      const res = await fetch(`${API_EXAMS}/student/attempts/${attemptId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExamMCQs(data.mcqQuestions);
        setExamCodings(data.codingQuestions);
        if (data.exam) {
          setCurrentExam(data.exam);
        }
        
        // Initialize default answers
        const mcqAns: Record<string, string> = {};
        data.responses.mcqs.forEach((r: any) => {
          mcqAns[r.question_id] = r.selected_option;
        });
        setMcqAnswers(mcqAns);

        const codSol: Record<string, { code: string; language: string }> = {};
        data.codingQuestions.forEach((q: any) => {
          codSol[q.id] = { code: q.starter_code || '', language: q.language || 'Python' };
        });
        data.responses.codings.forEach((r: any) => {
          codSol[r.question_id] = { code: r.code, language: r.language };
        });

        // Restore code from local storage if available (local backup)
        try {
          const cached = localStorage.getItem(`clahan_coding_sol_${attemptId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            Object.keys(parsed).forEach(qId => {
              if (parsed[qId]?.code) {
                codSol[qId] = parsed[qId];
              }
            });
          }
        } catch (e) {
          console.warn('Failed to restore code from localStorage:', e);
        }

        setCodingSolutions(codSol);

        const examObj = data.exam || currentExam;
        let defaultSection: 'mcq' | 'coding' = 'mcq';
        if (data.mcqQuestions && data.mcqQuestions.length > 0) {
          defaultSection = 'mcq';
        } else if (data.codingQuestions && data.codingQuestions.length > 0) {
          defaultSection = 'coding';
        } else if (examObj?.exam_type === 'coding') {
          defaultSection = 'coding';
        }
        setSelectedSection(defaultSection);

        // Restore active section, active index, and marked questions if available
        try {
          const cachedSection = localStorage.getItem(`clahan_active_section_${attemptId}`);
          if (cachedSection === 'mcq' || cachedSection === 'coding') {
            setSelectedSection(cachedSection);
          }
          const cachedIndex = localStorage.getItem(`clahan_active_index_${attemptId}`);
          if (cachedIndex) {
            setActiveQuestionIndex(parseInt(cachedIndex));
          }
          const cachedMarked = localStorage.getItem(`clahan_marked_for_review_${attemptId}`);
          if (cachedMarked) {
            setMarkedForReview(JSON.parse(cachedMarked));
          }
        } catch (e) {
          console.warn('Failed to restore workspace settings:', e);
        }

        setValidationStep('active');
        setTimeLeft((examObj?.duration_minutes || 60) * 60);
        setTabWarnings(0);
        setProctorLogs([]);

        // Start timers and socket connection
        startExamTimer();
        initProctoringSocket(attemptId);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to load exam questions', 'error');
      }
    } catch (err) {
      showToast('Connection error: Failed to fetch exam questions. Please check your connection.', 'error');
    }
  };

  const startExamTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setIsExamLocked(true);
          // Auto-save coding questions and submit the exam
          (async () => {
            await saveCurrentCodeImmediately();
            await submitEntireExam(true);
          })();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const initProctoringSocket = (attemptId: string) => {
    // Connect socket to proctoring service
    try {
      const socket = io('/', { path: '/socket.io' });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join-exam', { token, attemptId, examId: currentExamRef.current?.id });
        logDebugEvent('Exam Connected');
      });
      socket.on('proctor-status', (status: any) => {
        // Calculate FPS
        const now = Date.now();
        if (lastFrameTimeRef.current) {
          const diff = now - lastFrameTimeRef.current;
          const currentFps = diff > 0 ? (1000 / diff) : 0;
          setDetectionFps(parseFloat(currentFps.toFixed(1)));
        }
        lastFrameTimeRef.current = now;

        const conf = status.faceConfidence || 0;
        const facePresent = !!status.facePresent;
        const elapsedLost = status.elapsedLost || 0.0;
        const trackingStatus = status.trackingStatus || 'Face Present';

        setFaceConfidence(conf);
        setFaceTrackingActive(trackingStatus !== 'Face Lost');
        setFaceCount(status.faceCount || 0);
        setDetectionSource(status.detectionSource || 'None');
        setNoFaceTimer(elapsedLost);
        setFaceDetected(facePresent);

        if (facePresent) {
          setLastFaceSeen(new Date().toLocaleTimeString());
        }

        // --- Log State Changes in exact format requested ---
        // 1. Face Detected / Lost changes
        if (prevFacePresentRef.current !== facePresent) {
          if (prevFacePresentRef.current !== null) {
            if (facePresent) {
              logDebugEvent('Face Detected');
              logDebugEvent(`Confidence ${conf.toFixed(2)}`);
            } else {
              logDebugEvent('Face Lost');
            }
          }
          prevFacePresentRef.current = facePresent;
        }

        // 2. No Face Timer changes
        const currentSecInt = Math.round(elapsedLost);
        const prevSecInt = Math.round(prevElapsedLostRef.current);
        if (prevElapsedLostRef.current === 0 && elapsedLost > 0) {
          logDebugEvent(`No Face Timer = ${currentSecInt}`);
        } else if (prevElapsedLostRef.current > 0 && elapsedLost === 0) {
          logDebugEvent(`Timer Reset To 0`);
        } else if (elapsedLost > 0 && currentSecInt !== prevSecInt) {
          logDebugEvent(`No Face Timer = ${currentSecInt}`);
        }
        prevElapsedLostRef.current = elapsedLost;

        // 3. Face Recovered tracking status changes
        if (status.faceRecovered && prevTrackingStatusRef.current !== 'Face Recovered') {
          logDebugEvent('Face Recovered');
        }
        prevTrackingStatusRef.current = trackingStatus;

        // Determine active fraud state
        let fraudState = 'Normal';
        if (status.violations && status.violations.length > 0) {
          fraudState = `Warning: ${status.violations.join(', ')}`;
          logDebugEvent(`Fraud Triggered: ${status.violations.join(', ')}`);
        } else if (status.trackingStatus === 'Temporary Detection Loss') {
          fraudState = 'Warning: Temporary Face Loss';
        } else if (status.trackingStatus === 'Face Lost') {
          fraudState = 'Critical: Face Lost';
        }
        setActiveFraudState(fraudState);
      });
      socket.on('proctor-warning', (alert: any) => {
        showToast(alert.message, 'warning');
        setProctorLogs(prev => [`[Warning] ${alert.message} (${new Date().toLocaleTimeString()})`, ...prev]);
        logDebugEvent(`Warning: ${alert.message}`);
      });

      socket.on('exam-terminated', (data: any) => {
        logDebugEvent(`Exam Terminated: ${data.reason}`);
        clearInterval(timerRef.current);
        alert(`Exam terminated automatically: ${data.reason}`);
        handleExamTermination(data.reason, data.autoSubmitted);
      });

      socket.on('admin-warning', (data: any) => {
        logDebugEvent(`Admin Warning Received: ${data.reason}`);
        setStudentWarningMessage(data.reason);
      });

    } catch (err) {
      console.warn("Socket.IO proctoring offline, running local proctor rules.");
    }

    // Periodically capture and stream webcam frame to the socket
    proctorIntervalRef.current = setInterval(() => {
      if (currentPageRef.current === 'exam-env' && videoRef.current && socketRef.current) {
        try {
          const video = videoRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          // Set willReadFrequently: true to optimize CPU-based readback of base64 image data
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.70);
            
            // Check if the captured frame is black
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            let sum = 0;
            const step = 40; // Sample pixels to save CPU
            let count = 0;
            for (let i = 0; i < data.length; i += step) {
              const r = data[i];
              const g = data[i+1];
              const b = data[i+2];
              sum += (0.299 * r + 0.587 * g + 0.114 * b);
              count++;
            }
            const avgBrightness = sum / count;
            const isBlackFrame = avgBrightness < 5.0;

            if (isBlackFrame) {
              console.log("[BLACK FRAME DETECTED]", {
                readyState: video.readyState,
                currentTime: video.currentTime,
                paused: video.paused,
                ended: video.ended,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                avgBrightness: avgBrightness.toFixed(2),
                frameSizeInBytes: dataUrl.length
              });
            } else {
              console.log("[PROCTOR FRAME METRICS]", {
                readyState: video.readyState,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                paused: video.paused,
                ended: video.ended,
                frameSizeInBytes: dataUrl.length
              });
            }

            socketRef.current.emit('proctor-frame', { image: dataUrl });
          }
        } catch (err) {
          console.warn('Failed to capture proctor frame:', err);
        }
      }
    }, 1000);

    // Track tab switching browser events
    window.addEventListener('blur', stableTabSwitch);
    document.addEventListener('visibilitychange', stableVisibilityChange);
  };

  const handleVisibilityChange = () => {
    if (currentPageRef.current !== 'exam-env' || isSubmittingRef.current) {
      cleanupProctoring();
      return;
    }
    if (document.visibilityState === 'hidden') {
      handleTabSwitch();
    }
  };

  const handleTabSwitch = () => {
    if (currentPageRef.current !== 'exam-env' || isSubmittingRef.current) {
      cleanupProctoring();
      return;
    }
    setTabWarnings(prev => {
      const updated = prev + 1;
      const logMsg = `Tab Switch Violation #${updated} detected.`;
      setProctorLogs(p => [`[Violation] ${logMsg} (${new Date().toLocaleTimeString()})`, ...p]);
      
      // Emit to server if socket is active
      if (socketRef.current) {
        socketRef.current.emit('proctor-event', {
          eventType: 'TAB_SWITCH',
          details: 'Browser focus lost or tab switched',
          severity: updated >= 2 ? 'critical' : 'warning'
        });
      }

      // Local warning & enforcement (always active)
      if (updated >= 2) {
        if (timerRef.current) clearInterval(timerRef.current);
        alert('Exam terminated: 2 Tab switches detected.');
        handleExamTermination('Multiple tab switches detected (limit 2).');
      } else {
        showToast(`Warning: Tab switch detected! (Limit: 2). Exam will terminate on next tab switch.`, 'error');
      }

      return updated;
    });
  };

  const handleExamTermination = async (reason?: string, isAutoSubmitted?: boolean) => {
    cleanupProctoring();
    if (currentAttemptRef.current?.id && !isAutoSubmitted) {
      try {
        await fetch(`${API_EXAMS}/student/attempts/${currentAttemptRef.current.id}/terminate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ reason: reason || 'Multiple violations detected.' })
        });
      } catch (err) {
        console.error('Failed to notify backend of termination:', err);
      }
    }
    setCurrentPage('student-dash');
    loadStudentDashboard();
  };

  const cleanupProctoring = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (proctorIntervalRef.current) clearInterval(proctorIntervalRef.current);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    window.removeEventListener('blur', stableTabSwitch);
    document.removeEventListener('visibilitychange', stableVisibilityChange);
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    // Reset Debug panel states
    setCameraConnected(false);
    setCameraStreamActive(false);
    setFaceDetected(false);
    setFaceConfidence(0);
    setFaceTrackingActive(false);
    setNoFaceTimer(0);
    setActiveFraudState('Normal');
    setDetectionFps(0);
    setDebugLogs([]);
    setShowDebugPanel(false);
    lastFrameTimeRef.current = null;
  };

  const saveMcqChoice = async (questionId: string, option: string) => {
    setMcqAnswers(prev => ({ ...prev, [questionId]: option }));
    try {
      await fetch(`${API_EXAMS}/student/attempts/${currentAttemptRef.current?.id}/mcq-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ questionId, selectedOption: option })
      });
    } catch (err) {
      // Mock local saving
    }
  };

  const clearMcqChoice = async (questionId: string) => {
    setMcqAnswers(prev => {
      const updated = { ...prev };
      delete updated[questionId];
      return updated;
    });
    try {
      await fetch(`${API_EXAMS}/student/attempts/${currentAttemptRef.current?.id}/mcq-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ questionId, selectedOption: '' })
      });
    } catch (err) {
      // Mock local saving
    }
  };

  const [isRunningCode, setIsRunningCode] = useState(false);
  const [codeExecutionResults, setCodeExecutionResults] = useState<any[]>([]);
  const [codeSummary, setCodeSummary] = useState<{
    passedCount: number;
    totalCount: number;
    totalMarks: number;
    scoreObtained: number;
  } | null>(null);

  const runCodeSample = async (questionId: string) => {
    const sol = codingSolutions[questionId];
    if (!sol) return;
    setIsRunningCode(true);
    setCodeExecutionResults([]);
    setCodeSummary(null);
    try {
      const res = await fetch(`${API_EXAMS}/student/attempts/${currentAttemptRef.current?.id}/run-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: sol.code, language: sol.language, questionId })
      });
      const data = await res.json();
      if (res.ok && data.results) {
        setCodeExecutionResults(data.results);
        setCodeSummary(data.summary || null);
        setIsOutputCollapsed(false);
        setOutputTab('testcases');
      } else {
        showToast(data.error || 'Failed to run code sample', 'error');
        setCodeExecutionResults([]);
        setCodeSummary(null);
      }
    } catch (err) {
      // Simulation fallback if runner is offline
      setTimeout(() => {
        const mockResults = [
          { input: '[2,7,11,15]\n9', expectedOutput: '[0,1]', stdout: '[0,1]', stderr: '', passed: true, status: 'Accepted (Simulated)', timeMs: 14, memoryKb: 140, is_hidden: false },
          { input: undefined, expectedOutput: undefined, stdout: undefined, stderr: '', passed: true, status: 'Accepted (Simulated)', timeMs: 10, memoryKb: 120, is_hidden: true }
        ];
        setCodeExecutionResults(mockResults);
        setCodeSummary({
          passedCount: 2,
          totalCount: 2,
          totalMarks: 20,
          scoreObtained: 20
        });
        setIsOutputCollapsed(false);
        setOutputTab('testcases');
        setIsRunningCode(false);
      }, 1000);
      return;
    }
    setIsRunningCode(false);
  };

  const submitCodingSolution = async (questionId: string) => {
    const sol = codingSolutions[questionId];
    if (!sol) return;
    showToast('Submitting solution against all test cases...');
    try {
      const res = await fetch(`${API_EXAMS}/student/attempts/${currentAttemptRef.current?.id}/submit-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: sol.code, language: sol.language, questionId })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Coding submission saved. Passed: ${data.passedCount}/${data.totalCount}`, 'success');
        if (data.results) {
          setCodeExecutionResults(data.results);
          setCodeSummary({
            passedCount: data.passedCount,
            totalCount: data.totalCount,
            totalMarks: examCodings[activeQuestionIndex]?.marks || 100,
            scoreObtained: data.marksObtained
          });
          setIsOutputCollapsed(false);
          setOutputTab('testcases');
        }
      } else {
        showToast(data.error || 'Failed to submit code solution', 'error');
      }
    } catch (err) {
      showToast('Coding submission saved (Simulated).', 'success');
    }
  };

  const submitEntireExam = async (isAuto = false) => {
    isSubmittingRef.current = true;
    if (!isAuto) {
      window.removeEventListener('blur', stableTabSwitch);
      document.removeEventListener('visibilitychange', stableVisibilityChange);
    }
    if (!isAuto && !confirm('Are you sure you want to finish and submit your exam?')) {
      isSubmittingRef.current = false;
      if (currentPage === 'exam-env') {
        window.addEventListener('blur', stableTabSwitch);
        document.addEventListener('visibilitychange', stableVisibilityChange);
      }
      return;
    }
    cleanupProctoring();
    const timeTaken = ((currentExamRef.current?.duration_minutes || 60) * 60) - timeLeftRef.current;

    try {
      const res = await fetch(`${API_EXAMS}/student/attempts/${currentAttemptRef.current?.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ timeTakenSeconds: timeTaken })
      });
      if (res.ok) {
        const result = await res.json();
        if (isAuto) {
          showToast("Time is up. Your exam has been automatically submitted successfully. Redirecting to dashboard...", "success");
          setTimeout(() => {
            setCurrentPage('student-dash');
            loadStudentDashboard();
            setIsExamLocked(false);
          }, 5000);
        } else {
          if (currentAttemptRef.current) {
            setSelectedResultAttemptId(currentAttemptRef.current.id);
            fetchResultDetails(currentAttemptRef.current.id);
          }
        }
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to submit exam', 'error');
        if (isAuto) {
          setTimeout(() => {
            setCurrentPage('student-dash');
            loadStudentDashboard();
            setIsExamLocked(false);
          }, 5000);
        }
      }
    } catch (err) {
      // Mock result evaluation
      const mockResult = {
        attempt: {
          exam_name: currentExamRef.current?.name || 'Technical Aptitude Exam',
          exam_type: currentExamRef.current?.exam_type || 'both',
          cutoff_percentage: currentExamRef.current?.cutoff_percentage || 50,
          score: 12,
          maxScore: 15,
          percentage: 80.00,
          passed: true,
          mcq_score: 2,
          coding_score: 10,
          time_taken_seconds: timeTaken,
          feedback: 'Excellent work! You scored 80%. Strong coding performance. Focus more on aptitude accuracy.'
        },
        mcqResponses: [
          { question: 'Which data structure follows LIFO?', selected_option: 'B', correct_answer: 'B', is_correct: true, marks_obtained: 2, marks: 2 }
        ],
        codingResponses: [
          { title: 'Two Sum Algorithm', code: 'def solve(): pass', status: 'Accepted', test_cases_passed: 1, total_test_cases: 1, marks_obtained: 10, marks: 10 }
        ]
      };
      if (isAuto) {
        showToast("Time is up. Your exam has been automatically submitted successfully. Redirecting to dashboard...", "success");
        setTimeout(() => {
          setCurrentPage('student-dash');
          loadStudentDashboard();
          setIsExamLocked(false);
        }, 5000);
      } else {
        setDetailedResult(mockResult);
        setCurrentPage('result-view');
      }
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const fetchResultDetails = async (attemptId: string) => {
    try {
      const res = await fetch(`${API_EXAMS}/student/attempts/${attemptId}/result`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDetailedResult(data);
        setCurrentPage('result-view');
      } else {
        const data = await res.json();
        showToast(data.error || 'Results are not available yet.', 'info');
        setCurrentPage('student-dash');
        loadStudentDashboard();
      }
    } catch (err) {
      const mockResult = {
        attempt: {
          exam_name: 'Technical Aptitude Exam',
          exam_type: 'both',
          cutoff_percentage: 50,
          score: 12,
          maxScore: 15,
          percentage: 80.00,
          passed: true,
          mcq_score: 2,
          coding_score: 10,
          created_at: new Date().toISOString(),
          feedback: 'Excellent work! You scored 80%. Strong coding performance. Focus more on aptitude accuracy.'
        },
        mcqResponses: [
          { question: 'Which data structure follows LIFO?', selected_option: 'B', correct_answer: 'B', is_correct: true, marks_obtained: 2, marks: 2, option_a: 'Queue', option_b: 'Stack', option_c: 'Linked List', option_d: 'Tree' }
        ],
        codingResponses: [
          { title: 'Two Sum Algorithm', code: 'def solve(nums, target):\n    lookup = {}\n    for i, num in enumerate(nums):\n        if target - num in lookup:\n            return [lookup[target - num], i]\n        lookup[num] = i', status: 'Accepted', test_cases_passed: 5, total_test_cases: 5, marks_obtained: 10, marks: 10 }
        ]
      };
      setDetailedResult(mockResult);
      setCurrentPage('result-view');
      showToast('Error loading server results. Showing simulated result data.', 'warning');
    }
  };

  // --- AUTH FORM SUBMITS ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) return;
    try {
      const res = await fetch(`${API_AUTH}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem('token', data.accessToken);
        setToken(data.accessToken);
        showToast('Login successful!');
      } else {
        if (data.unverified) {
          setUnverifiedEmail(loginEmail);
          setShowOtpVerification(true);
        }
        showToast(data.error || 'Invalid credentials', 'error');
      }
    } catch (err) {
      // Fallback simulated login
      let role = loginRole;
      let email = loginEmail;
      if (email.includes('admin')) {
        role = 'admin';
      }
      
      const mockPayload = {
        id: role === 'admin' ? 'usr-admin' : 'usr-student',
        email: email,
        role: role,
        fullName: role === 'admin' ? 'Default Admin' : 'John Student',
        college_id: 'col-1',
        department_id: 'dept-1',
        year: '3rd Year'
      };
      
      // Create mock JWT
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify(mockPayload));
      const mockJwt = `${header}.${payload}.signature`;
      
      sessionStorage.setItem('token', mockJwt);
      setToken(mockJwt);
      showToast('Logged in successfully (Simulated)');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regForm.password !== regForm.confirmPassword) {
      return showToast('Passwords do not match', 'error');
    }
    try {
      const res = await fetch(`${API_AUTH}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm)
      });
      if (res.ok) {
        const data = await res.json();
        setUnverifiedEmail(regForm.email);
        setShowOtpVerification(true);
        showToast('Registration successful! OTP sent to email.');
      } else {
        const data = await res.json();
        showToast(data.error || 'Registration failed', 'error');
      }
    } catch (err) {
      setUnverifiedEmail(regForm.email);
      setShowOtpVerification(true);
      setOtpInput('');
      showToast('Registration simulated. Please enter any 6-digit OTP code to verify.', 'info');
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_AUTH}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unverifiedEmail, otp: otpInput })
      });
      if (res.ok) {
        showToast('Account activated! You can now log in.');
        setShowOtpVerification(false);
        setOtpInput('');
        setCurrentPage('login');
      } else {
        const data = await res.json();
        showToast(data.error || 'Invalid OTP', 'error');
      }
    } catch (err) {
      showToast('OTP verified successfully (Simulated)');
      setShowOtpVerification(false);
      setOtpInput('');
      setCurrentPage('login');
    }
  };

  const handleResendOtp = async () => {
    if (!unverifiedEmail) {
      showToast('No email found to resend OTP', 'error');
      return;
    }
    showToast('Sending a new OTP...');
    try {
      const res = await fetch(`${API_AUTH}/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unverifiedEmail })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'A new OTP has been sent to your email.', 'success');
      } else {
        showToast(data.error || 'Failed to resend OTP', 'error');
      }
    } catch (err) {
      showToast('A new OTP has been sent to your email. (Simulated)', 'success');
    }
  };

  useEffect(() => {
    setShowOtpVerification(false);
  }, [currentPage]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_AUTH}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      });
      if (res.ok) {
        showToast('Password reset OTP has been sent to your email.');
        setResetOtp('');
        setCurrentPage('reset-pw');
      }
    } catch (err) {
      setResetOtp('');
      showToast('Password reset simulated. Please enter any 6-digit OTP code to reset.', 'info');
      setCurrentPage('reset-pw');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_AUTH}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, otp: resetOtp, newPassword })
      });
      if (res.ok) {
        showToast('Password reset successful. Log in with new password.');
        setCurrentPage('login');
      }
    } catch (err) {
      showToast('Password reset successful (Simulated)');
      setCurrentPage('login');
    }
  };

  return (
    <div className="min-h-screen transition-colors duration-200">
      
      {/* Fullscreen Proctoring Enforcer Overlay */}
      {!isExamFullscreen && currentPage === 'exam-env' && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-rose-500/30 rounded-3xl p-8 space-y-6 shadow-2xl">
            <div className="h-16 w-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 mx-auto">
              <Maximize2 className="h-8 w-8 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">Fullscreen Enforced</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                For security and integrity reasons, this exam must be taken in fullscreen mode. Any attempt to exit fullscreen is logged as a violation.
              </p>
            </div>
            <button
              onClick={async () => {
                const success = await requestFullscreenHelper();
                if (!success) {
                  showToast('Failed to enter fullscreen. Please make sure you allow fullscreen permissions in your browser.', 'error');
                }
              }}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-2xl shadow-lg transition-all text-xs uppercase tracking-wider"
            >
              Re-enter Fullscreen Mode
            </button>
          </div>
        </div>
      )}
      
      {/* Toast Alert Engine */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2.5 w-full max-w-md px-4 pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`pointer-events-auto flex items-center justify-between gap-3.5 pl-4 pr-3 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] border backdrop-blur-xl transition-all duration-300 animate-toast w-full max-w-sm ${
              t.type === 'success' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20' :
              t.type === 'error' ? 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/20' :
              t.type === 'warning' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20' :
              'bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border-indigo-500/20'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {t.type === 'success' && <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />}
              {t.type === 'error' && <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />}
              {t.type === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />}
              {t.type === 'info' && <Bell className="h-5 w-5 text-indigo-500 shrink-0" />}
              <span className="text-[13px] font-semibold tracking-wide leading-tight">{t.message}</span>
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              className="p-1 rounded-lg hover:bg-slate-200/30 dark:hover:bg-slate-800/30 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* HEADER NAVBAR */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/40 dark:border-slate-800/40 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setCurrentPage('landing')}>
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANIAAACMCAYAAAAJHffFAAAQAElEQVR4Aex9a5RUVZbmuTciMiMyQYKHKD5T8V3d1dBrzVrzo1iT9a/WzB+zVUhAFBTLriqrTLq7arSmqqXaVqkHDWUrPmuQp1I+oNesWb36F43Wj5k/gl01WlpIAioPQSCBfMXrzvfte86Nc29EZEQ+gIS8d5199t7fftwb+56dJ+JGiK6Kj3FZgduXbVhw2/2b3rnt/s1/un3Z5pOkP3voDY/058vf8L72wNb8Hcu2nCTdtmTjzjuWbHz69u+9ff24fDET4KLiRhpHN/mWJa89jeb50x0PbS25qeY3Es2pjkRz8iY3mcwmQOZSPUcpx3WTiUQiS0o1N7UnmpseTw3k9//Zsi19t9276Z24qdR5Pdzzerb4ZBUVuP3Bt6+/GTvK7ctfzydbMo+76dRNynUdz/ZE47B5bEgRCwFK0cd1E5kmNCCb6o6lmw/d8cDWb0TcYvUcVCBupHNQ1EZT3nr/hlc8N7c32drcrhJu0o9Dh1AACzUTMDYKWHnU8UkmkrOSjvve7Xh7eMu344YqF27spbiRxr6mdTPegs8/ty7f0udk0ssd00C6KfzmgcIsYL5OxafhNhOjUsnkTZmC+95tSzfvpD5B6Ly+zLiRzmO5+TbulmWb3nfT6TecVDJT8fYMjcPL8ZuHCgjD12nxic0Uwmr4+N7+zJhmN9nOz1C3PrC5y0fjeawqEDfSWFWyTp6blm7sKiZze51009whmwBNEW4wABihGJ4rikV1+LB5wIJBPeEkMmmVXHMbGjp+IBGUZtRC3EijLuHQCbgL3YxFm2hpXiNv47DgGRFqDGDUSbQJaUxkdlZI91HCtWN8HzaPL+kZeSg1O6m5qf5c9y0PbH6Gekyjq0DcSKOr35DRN9238ZliU67byTTJLhQser2YA51ZamBlHzhglHUGgYBhLo+oXraIJPHax1GOk1HJx+5YuuVQ/DBCyjPiKW6kEZeudiB3odkPbj7kTG5+TOFRtnLKvrKQqRIDUScRMn6BTlD7UFR0COlKjuiuU1eXqPKUchOzMnnn3duWb36njJ4L6dLNGTfSGN/bm/BIu9Cc68b3QbOYOmgKNAD7IIRRIQ4e8rN1yIwL7FQQU9bp4H+H5Ev+XLeZkMP31LPjOOlisgPfO5285eHXF2g0Zg1WIG6kBgtVz+2WJVu/MfuhLSfV5PRyz+xCerFy0ZMkh4WJzimKUQcFMdqnrMOIUdbpMBbNpFST52Zbcs4bNy/bunPu38Y/OfIrW3+OG6l+jep6zF624Z3SZc67TjqZNc7BIseCr4XRhyR27RfoBIHV1mHECNkRM/ydCEF6SC7kpNqq3PbCidzeW5fHj8pZj3oUN1K9Cg1hRwMtmP1t7EKT0h3cheyFyDDqJL4bo04SnYJesBSjWKDTCL/aOowYITtiKnT4AA6G3WwVvoGXUgnlJFuKyTW3L3v9T3PjH8RalakU40aqrElDyA3LNu70JmfeUOlUsAsxUBamA4kExhHFRKeBPiTIIczWIbMRA3uFjgQYte0MwNs+n1XOQOzGgqp4PqUP5k0r5yavL9d96/Itr2g4ZpEKxI0UKUg99Zb7NiyY/fDWPmdyup2+XGjKwUrGoE4SjMIQGH1IdFPar6ZOJ/gE9hHqDDMUbR5bl/PgfIEvBMdznJZCYvnXHthy8o7vxr/bQ0lCI26kUDlqK3MffPv6G5ZvfD8/NfNGKe3/vMd4c+F57IbI4vPoEMEI0VU4JvEBN1hNXfsE9pCuTwIWtdPNkAe7kcmjurkGsXGyScc2lRLZpn71btxMKnTEjRQqR3XlxiUbu0415/aq1vRc4yELVi+uMgaAu5MBwKN+ogOvumgRTlPUJ9BpBIV0xPg6BNiY19ep4C2dhn2tUjc4uR0nuhUrNuh5xxsYbEou/HDdot/RJya/AnEj+XWoOvOL1Rse3Ph+aXp6jdeUSHKR2o5cXPJXHQvM4MQUm6kCg4fG6ENSWodFiU5BYw3rjAH5/joYuj18Wxmxdbn+sklFdXONJeWps8nSv/1h/cLMRy/N32aFxCIqEDcSilBttC3d+Ex/S77bmxzehSoWGoJlYVprmLrHFRjB4KoIK3145FV8jI/YLZ96Ol0Vg5Ez8FU4quhAg1HxmuBvjMyTc4o9A5MT8/70yqJvGTzm4QrEjRSuh7r9e1uuv+HhLYe8qenHvKSLz9gRB6iy8KzFBgh/rzFXYAC4O8HEwUVJzrUuHJNgcIMoQ3RKGqun01UI/oEvTxDS4QEdczDkNQRa+C2fyePhVfUmSjs+/J+Ls588Oz9+K2fVKyrGjWRVZPb9G17pTya6Sy0p+XmPMXHRkYxOzsXWKKbGuJl4fiE0B69DZE519GrXy7BqNJAsHSlNTv3F3lcWdVSzx1i4AnEjoR63LNnwjbaHN5/MT88sLyX8XSi66OCmamJYwLQbEj8Lk8UeaSYfMxHYEShGYyxM/LUeyEPqVjL6aYrGalgYr5u70ECqtOrjlxfN+sOv7/4PMcRT3QpM+EZqW7bhncHpze8WJzWFvlhl5biwVGQ9EiPRbkgWZ9SPRgvzfSwAdh+DoEdVXduiTHwtMKr7JpwPI2SL6PZrGXRLRwrZy9o+eXHR4358PDdagQnbSNyFrvvO5pPFaZkO7kIsGBcVibIhLkLPUUYNeCN+jLUb0dexkoMsNXaisIsyOSRe4dD2ofTABnfGR3XChgpOqdifKq34BLvQR6v/2wGDx7zxCkzIRrp22cadfVdk3iu1NmWlIfTCNGUjRjI6OXUSZUNRnXgUkwVs5fd1C2AQKQppXfwtez2drkKI930hENCMIsm3KTXglvaoy6bM3vvCorXEYxpZBSZUI82+b8OCax/Z2ufNyMjPe0zJuKikAaKLLaLTX/woaKJO0qqwCp2olYvnU5HPTHRR2kfsBBrU6SoE/yBWAL3j6cS2reiWin1NpRV7X1o0N96FdLFGwSZEI93+4Jbrr12+cefAFS1vlDKpDBeUx4VMsorn4xYA0ePiBEEMBrFA0UIUE92KY269niXC18sOotOioeHogS/jQYGucwHyB3TasAvt+uNLi5L7no93Ib8wo58v+UZqW7q+6/Qkdy8+C7XbC5ml46Ly2EwkApo8LLgKX2LaTkYfEmVDFToNVhzPZ+f19bKD6IzRVE/XbsIC33I6wXk+3+aoouLPe9zOT19c1O4b43msKnARN9LQJeAudM23N72fmzlpjdecTNKbC0oWe2Sx+ThAq6F8jFFlqhqLsLKHqnhEzjxczManul5OUt1uojXX7uJLqIoe2GDnI+1Bp7Tr45cWZj59Lv55D0oy5uOSbKTrHtjwTM9k7EJT03OrLn6UsTauVyV8OKJ+XKCC0aiprk4/Ky1z1G8uBlmk4yWWcA2dJkP0LahiT6m5ad6nLy6MdyFTmHPAL6lGkl3okc2H8jNbHvP0LsSacUHJYteLjxipJs6diUQnUOAH2QzJZxTwujp8hm4eXBwG3Ug8p/EXmaC2R3WaDBmb53gq5xZ3/OnFRdlPnv2r+Oc9pkDniF8yjSS70LRkd2FS8ywuJlnYeuGZ2g0H933DCSSnSQY+bB0x9uA5TLMQ96iET6kIKRweqNYIbDq2oIpH8i3uvH3r4p/31KrZWOMXfSPd+MCGb1z1/S0nc1e0PFZKunop+WXiApPFTpTkwyqEa4yMuFm41EmetTP5OmY7lyXDorzh6gwKUTmBXI9lE12bRabN0uWzUKK4Ct8Jzdq3Ov6RKctzvmhsG+l8XbU+z1UPbXqnf3paft7DhSXEhWVI+wlOuRreCMZmIjEHiPnshpPmYR7YOESnoGk4up+7nMzXdSLDtFlsGiuWikcSmVTb/ufin/fokpxXdlE2kuxCP9hysnh5uqOUwi6kF5apHBcYSRa7ZSNGqopbfswT+FEB+XrZyddh0KNCL7uKR71mkmsSTzz5I4/EG7uch3ZNnlcs5pziCjzSnvXR6rvin/foupxvdtE10qyHNu48e2XLe4VJTVkuKkOy0Lj4SLqKFbZquMbIZLFH4iUvjSDJF9mZJAY2DtpD/lYusUf0kC8dLLtHo9Y92iwSHba88vYkM82z98dfrFrVuTDiRdNI1y7fsODKv9naV5yZaecaE7JqxsVlSGxYaMY8JE4/knamr8Rbut0shD2rmXyds08S74sye1ZuASxdfKO6OJmpbLR9uQvlveKK/c93zo13IVOrC8vHfSPxkfasv/Z/3lM0P+9BzYKFxbVmCDgHbSRpCNoIgoiRquGCwYeDPtIAdixlEh1A3lDNZPnBNfQAgrmJGYrq0euwdcbkS8Vdnz6/KBnvQkpd8eO3Hr3y8d92X/X4W3eyNueU6iQf14103QPru05MS+wtzGjBLoTVGV28eHFciIZk0cENsIyGcPH0P5d4jCVZmOSspUeuJ+Rr5ZFwS5fzCOhPts5rDuWhglivVBooeKXOA+vin/dcuXJ72+WP/3an8ry1nnLaSp63fdZjv93Z9tj2Nr+i538el40ku9B3N73fd9XkNUV8seqhLoYUF69NsJlR9gGCxYdZxlC4oh9JPP2GEqxRnddSyzeaV/uR2c1DveKcAnLyVKFQ3LXv+YWZ/c8tnPD/es/Mn7z9RDGX3+04Dv64sj4gh/fNaR/08rtn/fe3HgVy3se4a6Rrlm945ivsQvnpmbmyuFAkuyqmKQxXDhwMaceyDQDMmGVUw0OYePGmQIjEqaF0nh8hHMwX8rXjLJm+IT8BrAm+xWKxRylnXrwLKXX5yu1zZvzkrd2e8lYqx8kqp3yfPKUP4spbe/WP3tx99Y+3z9HoeWHjppG4C13xgy2H+me1PlZMJ5MsDkmqgKKxcCESg19M+pEUF7Qh2ImRlIkHxkGMJDgB0Kh1nhd5OCQXBUM8v5btnSjqV7Z5qpgv7Djw/MLsvvhf71Ez/v7tJ0rF4m7crzlSM9RauK6pMNTYYKjjHK9Q2H3tj95c07Zye1bs53gaF410FXah4zNT3YUpzaF/vYevncWJEnEUVQWk/MP4iYZiKxKUAEexFQkYB/GquvapaWcwSOzgwdDno46bSSZU6SewTLYfgWKxcMTJyy404f/1nhkr32yf9vdvdZdkF/L/aPJ+mXracjWspFRX/kx+9zV/92Y7a3su6YI2Er9YveJvtp4cvKr1seCLVS7iWqQrwaLZxIIGBJ+wDcn0Aje4+MKPg5jocDN6gAGwZaiqQtdxZVsZsJskJNPZJoZ4nirkCqsOPrdo1r51E/vnPdk127PZlW+uKSpnJ+rWxvsjdQ/VzPHvBTHWjxxk+4nsOozfee0Pf7v9XO5OF6yRrvjrTe+cvjLzbj7yxSpffDVCjRQLGiLlH8ZfNAczCYyDNnKlm4myYPQhAaBOUloH5N8krQ9lE1/tJzInm2xbDRlv4444hWTb5+vin/dkn8TucZpv45yuaN15fwSL1DfArPrS17jRjr9TdxbP5Lqv+9vfnpOHEee9kbgLzcQuNLz5ugAAEABJREFUlJ+ZKf+8hwWoRqYS4FIMi0NUUiwTp/yt3/gFNgtXbCZSCIOiB2MV81XRh7KJux2nz0Fc4ihUo2Kx6OUKKz7DLtT9/MT+eQ93oSlPvr295OldyKqX1BD1FU7clqlrqmqHrzYrhYcR8Fl77Yrfjvmj8vPaSFd+Z+POU9e2vleY3JRV9gtUNQ76VCO4oyCya5BDVZKPvso/quFlrOwoWFmVnJLLTxPSq/pW8RPIbiY7v5Fz+T1uqmn2wfjnPWry09vvLPYW8VlI3al03UythSvrMPUjBN/AbuO0aQrs0I2MsPZSLt/d9jdvPgF4TMZ5aST+vOfyH77eNzizpZ0vZqQUvGIWzRBAO5+qgsNFCa6UNAb9FaoJVYaviyjTUHqFjeeTKD+3FuU89jmU8cMupAYLKw4+t3hu96X3I1Pz8hvi2We2t0166u3tnlfarpSTVfqI1pi1E8y2a7kas32r2Q3med7KthXbdrd14e2kAUfIz2kj8ZE2d6GzV7e+UWhJZeQaHcwjIYSxQDYBUiyykPIPYxeM5wFcC1NsJpL2Udofqm4ESj4xhy/phrF8Q3EWXhHTP7grkU3PiHchpVpXbX807xV342HCnayr1MqqXVXMtkOWGDpGZEJCwIVz0veZIs5JJuQpB983eTtv7Nq2RoARTueska5evr7ryxmJvdyFZKE5uEISmBkehHoEF38w1iagdmxwDuActJHbeAiDsawzcWWDiN03wRvDkm2bLcNLyTmVPnADvXxxINmX6/xs3ZL2/Ss7TqkJfHAXyqx6Z6fnlfjzHtmF7Pr5slXoSK3EHsEaUevFlZTTdcMPtu2e07VdrqmRnLbPmDeS7EL8ec81k9eUMsmkWVR8IVEKLoR1i5I2NhQDX+Mn52MuG4MsODj9wFSl7geJ3RcVD1u35cBGASQ2cI6Q3D+w64tfL8zsX3fvNtomMqV//vYT/Q6eyClP3uKbe1CtJqEaVnOogY00TtI5zpzTpfyImmlMG4lfrH55OXehzFxeGF+UIepSOC7SKIkxMkV9tG7ykQcR2kY9wGthcKIPSa5H62BKYfdQOGwb1NDbvKhN8Tx0IlmyN1joae7Nz/viuSXn/MtAnno8U+ua7XOaf/4W3sY5Kx3H8f/iO/4V2/W0ZbFqn6Flx78/dLL9qY+EHNV2uphfP9zQMWmk2x/ccv3MFVsO9V+DL1aH+nmPvjoWbDikw3zGYmmyc4gxggcYBONrL3xiRhcZfsphksq3eTQZEl/fzb+JluzgCwv3bG7HoWcXZvetGw//n1Vz1ReGN63e/kS+4O1WjovPIv41SP18ccRz3Rz6nozoBI6686bvv9E1nFh3OM7VfGUXmpXqzk/R/3oPnfgiDEHni7YJkFLG3gC3Yykrc5hY6MRJEJXkVroZwEWnL2TxoUyydSODK8c3Br7AbBlqaIiNSK7wVXNvYd7n6xZ3UJ3IlFyzvT31q7e7Pc9byTp4nC4U+bdzWGf3PPXEcAJG3EiyCz26+Rh3oWLSdYJCWRdNjCQXRNwmARuc7DjIzGlIMgBTJCjEwZTowKiTFA/oZFX1qI2OIPG1bVVkp+SpxJnBVYfXLJwx0XchfrGaWr19jVP0dirltCl9OJpfECY3cZhnxlvQ2V3b5IliI5EjaiR5IsddaGp6RnCNrBQJZyVGMotZOHAO4iMhxgbE85AAmFwQlZwHeAWmlCIGpsRHWTrkYCCWsvjqXYl6LaKf25c/ku5NtH2+7t7Ha/lNJPzUio5TbknxH2Hp4esu/4Wl5pMus6+McK6bgzdnhLlNmFN0lhq5Hh92I1310Guv9uGJXLALOTgFCYzXTlLUScA4iBlSXKAjIBNPzpxCPAcJSgVuY1EfW7dlxChb53UCk9whXCk3Xyg2nc799NCzi2ZN9J/3oEShMfjDjrWtCafN9Ur/onCYZuLnR6j+kKIqv9xVZMVD4xTLfwmhhXDPzwE45EN9lFTyStc3mmJYjcSdqP/qSQ96JrtjBP0XnjpJw/QjKS5IQ9pGRttQRJ+ATDy4HSN2nhNk8ACDQAxMKdgVjqp61Aa/YOB8lCVO+7mnc3vS/U2zP3t+8T/SNmyaAAHcmQZ/ePedScfpwAI/YJooaCrWQIpKoZJ0qcVgywIMMdm+tjxESE2Tg8fhNY0RQ8ONxB+bDlzZ+k/Ba9dXSZ1kFirzUycpB04kgiBiNimYhyIP9pA/cshgThIUY4eoJJfSTQ0uus5BVXQIjAFTIR1+CofYbBmYGW6uUEydHFxxmD/veX5i/8jU1KQe7/u7jh2ZJmeO4zi/Nk2ExpIwR2bl3wYpvJG1oioPE1NpGRqpFxfYrVMH2NCpxdpwI52ZmvpffDsnUfoMwTktXTAHAEmc/YXt4wBgksqRQ6076KeJOQxJHM9BgkIcTJncga5wID7QIQMx91KJv9KHbQvJjkr2DOxKt6ZnfPHCvWu1d8warAB3p/4f/VWX67pzVcn7QEprbojmIUznrcC0r5ghi51KRCYkBFw4J6+sBA1N3FDZbJBh8YYaiW/p8vzFNlPrqw/OW6FrAL70IcliLcOwlJuL9qFInM3EHJpMjJjYTCBionOCH3USVV6DLRMLdCi2DDUY7kBhIHVioPMwvlid6D/vCYoyQqH3Rx17+n989xxVUj/DYu7hXzPcJn8xWDkrMNwcwbSPLWsoxOrZbWdch61GZI8PTSJYdbWhRhqc0vyEhOsrxOtSijJJKdZDKSxkIeXrUR/A4kfcY1yDRF+JQQJyMH/o+DDmf8sdYPSBt63bMkz+sP0sOXGqf9eXv+rMHIp/3uPXaYzmvv9x18qU67KhdnFRSMlxY3wOAefxZaWEK/8Q2Tf7AHYZwajZOHVNgR26LUOtOcp+7p6aThGDG9ErVP4nEAXuRjq7XK+W6ezrZcDXYSlDrJWQVMXC4dXYYIwm5icFgcCpkwRjQ0Mo61Aiw7YZWa5N+yX6cj2tR3PzjmIX0lDMxrgCpx7v2N/707vak67LhxE9uI34C+z5t8ELn8y3WRjsglkQxQCz7ZBpE7LkajtREO+vVl7LDolrYKrbSLmE28mMzGVdB1X/dHrhEhB7+WrE7lE3RCcQ/QKCjT4VZPlBLA/483pMvBgszNcJ4L6Iggkq/SEpxiocgW7J+BJRJY/37/hy9aLswZfjn/egNOd8nPpxx47EJBdf3DobcJvkpkV5cBG4aWILAAg2BhmIPyy5Isb3qD1LrNfTmkiNXSMVW91v8oySm4K+KtEdX6FMsheprTOMRIwNI34MJdFQjWjTxBiJtf2MLYLRTyDr2nxd7pGIcn5fUkZOns31TDmWn3d03ZIOFR/ntQJ8GHH6p3+11HG8byrPk88lvL38Sxzi9lXVeFsn/tovkOGrIVV1JzKLxnA4O46zds/ajob/kxcXMUOOUmvqssBBX5mcz/EVkengq3zt1JRZoAoHfTzaSdDtITYAUQ4oPBgLMn6BUWNVdX2NgQ0C48FkUHYKJZU52reKu9C+eBeSulyo6dRP7/n3npX3tKGZfmZfA26x/BUMcTrgBgoG2XAuQFuGSUaAieZPVZsKJvh+sPfZBfIbQagNjfqNlNS/o0N2ZsS1KxVdoCGbUsrSfX8VOogJ0a8GsfGEEElfMH9o/yhWU8e1BjbG+lkUrzF5cuDIFScTbYdevC/+eY8aP8eplfesTKrEXKw8eRgRXBlupNxC7DDCaQBGVreBjB+cazUQTBilnmSi6U4Iwxp1G8k6f0ViselXZMt0DHRtNxibg4tYiGBt8i2MBzEfyQcxawySP6I60MA/0kx4pF3MHO1ddfzX9876KP5iFZUaf+PYyo49X628p911nRVoEv9hhH2ZuLm45YIYDj/ROZUxOBIADdlAvtsHKbd5zh/XduyH+7BG3UaSbPqq5FyOr/iyWP3r92EBbBsB6kEDEdAkOGThiKePkMbAygN2Nh99AxBYTR22wM8Smo/375lyujj78Lr7413Iqst4FY+vvGttKpHgf8v0L3JL6+xGQbNYCyPArBcZYNoPuXdd5qba/ziCJmLaxhoJnvp8kOTtqvBqk/jhqowtqhMnxoZhYwREgyHGg+gjZHByg1MmUSc3ZOuWnCooNemLM//05bNL5nY/v1g+0JqQmI/vChxZ2bH/+JN334nb2eHwYQQWEGS5aMP9v+YCyZKiBF8yIeMXNJCgWMue6nEcZ8Wnz85vH87DBR0esLqNlBgsFANvx1wOEC3iNSlVRVY4bBtUea1sDONPrCFCfsZJPhNArJpsMIu39pXU1YcKasZgc9efLdr0umWKxYuoAl/+4907WppScxzl/JqLyeG1Y1EIhxw0CTCoMqpiYlFchv+SdVNt+9beM+qffdVtJHyeOGZdF69frkDhENy8Cui8MjJS1MZGsO3Gh3hNopNNOJfkNZitV5ETJaWuOFZUVxwpKpd/DlzXTaRTnX9+/+ZTf7n09XkmTcwvngrwZ1pHn767y0mob2LH+UCuHIsCt19E0ziwic4pavOKqkcpt6N77fw7R7MLMbehuo2UGPD+jzg7jlJKpKoTXkuAi2y5s1ECIwTqJGX5AK4csNNP8hkrMSOTQycTgmx8ExCu/qKgJp9BN9EIGxnJSSanFBLOu19bvPFfR/rPLzFPTBeuAkf+8Z5/P7xq/hws4J/h1srv9szVQBfRNJX/118giM4GB7vQ/rV37/CRsZlxHUMnai6UVlfzwDpVphFqyQoHGwFMBv1sXUBMgkc41PJAZegTABE9ZIMTd6JrPi+opkEPhQOA4YFkIFY4JjfT9K3i6f7DX7t3w3Kol9y4suv1tkvuRUVe0KFV96xscpJ4u6d2lRsnuNvBF7BOqXTASTjfPLjmnqX713aciqQZtVq3kQ6+fP/vmk4MfsozyeVZC5HYUCT+2kFkK5a65ziKpMCjRJw+OlwpxHogZY6IHPgCv+pwQZqIMcbdcE8LQS7XTTuZ5le+du+mEf17ZjrduGPTvrvhicF8rnvqIxt3Xt61hU+9xt01jtUF7V/Vsf+LX9zT7ip3mVPy8LZNBQ2keDilXzvZ5jn7f3XPv1M9F+Q2kjTVV3yulp8sTCxe2mvJtNmL2vfTQWKsMaHBPJBtlVgN2LKG1Ex8Jkrj4QL1wD7EqTxjy6Tm5M/2f/W1RRt/wtiLlWb89fr2ad95rRvPo1YqD6/C89oLhcLuaT/Y8ES2a2T/iiiyXBTjs1/e9VpycqrN9ZwNcsGe+gDfQ33z4OrOrv0rO8Z8F5Jz6KmhRjr88n1rm44NBD8p5/2xG0PnCjOzQIEGi5UySDllI3PRHiL6WORZ/gqhjBFzRJ7cW1JTT/KpAqywYZZh/D2NGS5GM9Hmuq43qenJ25ZuPvCXy9/6ujFdDLyta312xsPr15SUsxMN1AZCqfQrB/NKaqWTP70727Xpkv4HK9kwB1ffszThqrmf/dP8YexCalRHQ43EM0wuqjuTffkByjWJixFG3DfM/qiQrUZQQC4AABAASURBVKaQBa1jfG89A6MtFGvFYYVoxzLj56KZR4tcPwCRALMMSxTdmngOqvZ5mNttTl3Xn8jvuXXppldpH+/EXehMr7cb31V22U+rWIxA54t0VJtTLO3Mfv+19Zf67rT/l/ODP/zqPBxuo+fgl5iZE4NL3UIpHKIXKu9T2KA1bRfNagaziAWvNSHWzltVhg/DuRMlC2UPIwVc+9G3grQt8KWD4zpuuunBWx7ccvL2pVv+K6HxRtyFpj+0fr0qeOF/Q87DK8GQ6wUPNRN0pdylqnCmO/uDzfeLTzyNugLucDIceun+ba2H+zpNM8k9qZbAqQRtX1umJ5sqSsSF7FxWI4pNTy56e9oJ/ZaOmB1D3SKeh2r0GohxN1L+pHjQx21KZkuZ5P++ZenGfyU2Xmjmg+vv7D1d7HZKnvzba3hsg49FuDoPhCHNo2Wovk0EhQ/iMDgqq7zSa9nvb9yZnQBP99Q5PobVSLwWNlP2UN+8RG+dt3lwxu3CrIfdBNZCNwtbewXMjrXlwMHKke0pyReunhgtgyWKyZ60zY8przPRtc3qKeW0NH/r5oe29N2ybNMFfVTethSfhZb+ZrtXKm1X5n/OxYsGVTQT39sBJwvZgLHRBFOqXRXzu7M/2PSEio8RV2DYjcQz8ZF4z9OdmfTRvl3UR0q4n0EoG4oUAGYxE7Bl6hEK7UawmbwBHyre2ITLhAyKa6/MNeykkhnV0vTK7GWb3r/9wbcb/scDJdEYTFfc9+qjfaVCt6s8/2f+nvJ3F4UDMi9aN4f/AojBRJwktmqYUlkErMw+sgEPI8bRo3J18RwjaiTz8r56dkn7lM/PdjadHpRn9wZvmOsFavuHmsk2aNmsA62qprxSyTxQk8tw42BxkxveghouiplqxIsvbORuS9PcQlNu783Lzs+j8iuXrm+7csnLO3HutcpxsmwKIV4zQO4uFIVsPSIzhs0U+MMumPlMxX8QsVTcnX1045pL/WGE1GoMJ3e0uQ6tu3/byVWLsi2H+3aYz06jyenw5g4jweSz+IAU+DuBpCyxDGrJ2DQ3pzRcvLRN5OgEm5dwk15r85M3PrT50Lncna6499VHvXx+t6ecdmkAz78YWyYS0ulDogFcbFpm45BCGGzU2WS0gbpU8cxuPCr3dz7Y4zF0BUbdSCb98X9e0nH5kVxb6mT/EYPV4w5usvGhTDJ6iNt+IYNS6QG/kYxLlA/ZUCaXQ0EmClhHwnwO2OT0UWuGzUmnZuUyue4bH9j0jmUZtXj1opfnXLHwpd2O561V/CzkKf8gJ0GzFj40DOIkiIjDuzUIHMCoB/4WJi8SdsPpJ7JSbarkbcej8u3x7qTqHmPWSDwTH5H3/OLeWZM+712VGCgUsc4I+8S3D75UvsHQazWPjYfyIEYGbz6EVA5TVQfgGNpNRd/WwVQ5hsjDhpRc8BGOaMOVm3DUpOaOGx/ecvKWB7Z+A6ZRjas6X3mi6KndDt9qReomzcDsPDlIdHAFEtnYwK2m8GtOH+YDh1kwxogfAY1TJzGnUu6d2J268TDiUbrEVL0CbnV4dOix5+57/PJjhdkZ69cQjpXSlgmzaUi8ceQk4kL65vqyrQiiMvrnQKJFEwsYmbSPyVSVa59IZFi1fIIc6VQ2Pzn53g0PbcT3OmH3RrRrOl9pn7XgRbyNK60Uf524vKiBAhMdogzowjlBDmyQCVEnUWZ9yUWn3aIKDI7EhJSXVdgZ+ag8e4n/bg8ve0TjnDQSr4S704nVi+dO+mLwoabe/CAx3AxhnELNQgBkrU1oGJ7iRqDMYdtt2bdbiCX6tiqz8REuU8gJp1Y8ueGq1lEZqrzWdPv1j7wx2LZ8c1etMBtvwyPtqxe8uKZYKqEBnTm0cQGTB4ufglyMoP7TOq2Lr5bpJjrdhsCq+iBYcMYZ0nmIY/fCo3I8jIgflbMqITpnjWTOcvzZRa+e/ofO9PTDuQMp6ztT2qWZeMOoRIg2x8J4IwM1EmPUCm4nCIJrCHV8JTd8hCOF4YrdpnDAhjkYTtJt8iY3rWl7eNP7N3yv9qPya+5+oT13ZnC3V1JdkoKJSUqhWVT5ABa1K2BC8JL6UIdMLNBrYcDpQ6K/TWgYnBsOGDZOmf5OqbRy6vc2dM+4xH+3x1I2Sue8kcyFfLF2YdvV+wfmT+rJh9qJi0OaBjfN5iaOnDePXIh+IuiJCbRYi0U/HyFFLVdl+kINdVjnNLkCbmyaey3Nc0upfDd2p2fslLIL3fXCes9zduKcbWLzPIgiyecXTo4HnQQW7OjUQVzwXNxCsEudgENkKHJ55YYg6CnBjL/hjAvlgh9txGijrHhoXHRHtRULpZ3Tvv/a+rau7VmaJzKdt0ZikT9+efGbXz21IHnFwYF3k/g0TWxI4sIC2T56ffoQb6wvKawQVfcIBctakxCTJsQjvuIYnYbwCXLBx3Ndpzil6bFrv7/12I3f3vqNa+966c786f5uLMilvAq4kOnsHhZ/IELwQBiaycKGKgOYgyQcQgDFDhxikDPAiIOokyQGuuHEQvm0TXDcB3Lja7hXcpb25E53T39k04R+VH5eG0luLqaDzy36Lzd+Ufz61OP5M/7N4R2DgQM3jH95icsCI6ZJ/jprmTeybC9LxjwkD7mHlFCYXBXMwmExHKIeMFLSjOKQ1JSckZ+UeM+bmt7uum75rzgSSwpwvi7JQZkCOGtB0dhEB64x/A2BgmHbAx/icBQd3PiQB01jcPqC6BvYoNNMf5KxCce9Ioc9WyqVtk/9zsadE+G/ysXrrRhuBXKegN8/N//3R36x4LJZ+weeb855+CusCeeXRQUeDE/BrsoHda0NpiMvoSJYO1Zjxtfwaj4Gs3xwekEruPExXLwwaZ1vMT0XS3Rqi/Lapik1rUU50GXrMMngLn9IhHPySS9YcSUiuokBR1bfBpl2WfScqGtiDImwIeok0RmofakTJ1Eeiugj5JTac4ODu6d9d8OjTDWRKLIKz/9L735h8SPXHy19fdqR3IGKs+OmchfS69A3E/MlmfNJ3wpY9ID7sGANT43ENOATvQaj29fhOVj6aKSgoRLK/2NhnPnXXuGgToLIWoD5DQOBi1cWOGRyZEQOOGNQJxEjp4vhEkeAfpoTIxkf4dpOPCAaiEdJ5wHL4g/B2mkPv7b78u+ulyeQagIcF7yRWGPuTofWLGy7at/AY5NOF4pcMEI02oSbF1rH0AebbYdK2dMBcBVjlAsYnXRMFA7pjfiEArSCBhJJx3OHKqGhijdOV96Vk5TTkgoaBQsSb9vEW2MeGsXWFXTPt4FxjSscXPRgAU6dJHbtR50UYAyAjZihwAbclo094DRGfHDhc4olZ/eM77y2pq1rffltLM9zCdK4aCRT130vLf75cTyMmHYo//tkyaDguEkVjUUMpsG0XpGQhxw13JBGwupxcQpNOqFmIVM1RfsNdZ7S5GZVuPoy5d2YVd7lrcpJJ9EMHppFJ/TIvYiuoHtKDjJNXOQBRgF4xe5EjDsfiL0QJeYgBbjOE+iINzL9KijlKi+dWNzrpP+coZcyjatGMoX+4tnOr1+FR+WTewqD1RqIN0+vS9WfGeZLMIFyspAiSGiyzFwztNXi+AtMs/K5Co7ojhgYbMGcR/NSMqGK2bTKXzdFFdFUpZmtSmWwUzFGLsBD81ABeSAMWcTgrA0ZOTFym4iRBKOjHc+GMpjG6Ud/m4gFZPunEsqb1KyK01tU6apJqnRZ056m6S3/6diahe/R7VKmYa7C81cKPir/8pkF6Zlf5N7hv8cgZ8bN5VojGb0AJdforiRBekKcluqzBnxxaZIn4A3ERJtOEmAKckBmUxXYVNdepnK3TFdFNtf0FuW1JJWDhoMLdi2ZwT2k9MCNrkRnEygeMJGxCQSjHiHiJPqEiIHal3avGU0zOaWK09Iqf2WrGrwO1weezzYrL+kMOAP5FSef6px7+Cd3VX72Za5LjMZtI5k6739u4V1th4tfz36VPxZam7ip1EmnL9Mvg4oJPBd8rPJH8uClyNUaLorxMZ+pBFSqmEmqwvSMyqGxBm6conI3T1U5LOICdi3ipUlNymtNKuU6fkMxKYiLP9oYxEgBznPAl7qHp6FeJqFKyJWf1qzyMzJqALvMwPWTVd/sKZDRPMDylzWpEpoKHcto5fbmdvX8w/zMiWcWrRVggkx6BY7vVysPI37VOXPGZ3hU3l/yeKOxTIKL7m2xtQBuTBhJ6EhieDW6KbhWqRpOOaBGcsNHYsFLaJgSdqf8VCz2y7HYr56kBtBkfWiwvtunqd7bpqn+W6eqATTbIJpg8LrJagB8ALyfJPIk1XvzFHXmtmxAvcB7r52k+q5uVYPT0yqXbVLFFrzlxOceuVacW64BCrmbLw6kzxY7e1YtvKT/uS+83Krjomgkc+UH8Kj8xJP3uNlj1qNy3MV80lG5ZtxZ42iJBqrLz2WMzo1LrX0Z2ifqYGKEw0d41GkoHTFstgJ2lgIbznDINlZCDU0ansOQYMjBz3rEqFMm5y7kljyV6s3vOL1yfubYqvnbBJ+A00XVSOb+yO/2DgzMz5zFo3IN9kzBFzFarsrGFMTKaiSfdjMLsGqI9onaQjE1fEIxxge7nsRCFw6nKAek2AQKh2kK+niMBSmLBIOfjEhOd6DYk+4vzTv1dGeH2CfwdFE2Eu8XH0Yce2ZBcuqRwXcTRaV6Wx1VHItewmJh/mFRjRguzpp5Gonhgq6ZQBuQx5zHcG2pZPAl6EU5QX0u5qBdiDgJNg9EUSGWu1DTmfyOsz+bnz321PzfCT7Bp4u2kcx94+/2rjxV/Hpzb2Hw9GV+J3Ex0O7hpgvnBDI4xHE3hn1teG11Y+AjL9RwUapMukmkXrYvZMF0CM+X7M8fuazXaeuJdyFdFZ9d9I3El/HHNfN/f/TnC9LJ0wO/8goF7E9EaxMXBK21OG0jIiw8xtmLj/qwSeepFWeuu5adu0bUZmICrs/h2U2kgzzYDBGizF0ofTq/6uzKzlmHn5oYj7T52hulS6KRzIv99JUlP0wUnNmF3v4x+ff2gkWnT2B0rY4JG3ZOLPLhnLgif514No2dn/Gps/nPsmdUW89TnY/btlguV+CCNlL5MsZO2r118YEP31jWXjrd1+nlCgNjl7mciYurrA1TqrOQh8o2qvMOlVjbTBORkxK5UrH1RG5F788WXBfvQrpINdgl10jmdf7hzQe2/WHjvZnimYEdqmT/cM94XCA+im4YRQ829mL1tfFnWeme3J6pvc7sU890TqgvVhsrVKXXJdtI5qV+uG1pR+JM/zyvP3fEYMPlZgFH+XDzVPM3OavZqmJ6sVe1NQIOEc9rwS6Ub/0qt+LsP3TOjXehRgrq+1zyjcSX+cGbD/7u/22+b5Z3un/VULsTFxL9o5xYQ6QXqYlvKOZcOOnrYGpzLYYTEzI+nhbAmk8O7hr48d1N8S4kFRrWNCEayVTkw23LHm/q89q83kH5n1AnLvqwAAAFIUlEQVSZxWW48Rs1x6Icbo7QNdSJF986PnL+Kj4SC6PNE4OFgSnHBjvPPD0xf96Dcox6RBtp1AnHewI+jPhoy/1zvVO9K1S1hxFVFl/d11QjxizWqvE1Yqr61gAlP/IIr+EjMHyqcbfgqeSp/L/1/XR+5tgvF07Yn/dIbUY5TbhGMvX6aNuDaz9cvziDp3sjeFRuVqbJVoM36GZHh5rCvO2yHWrJOJeJbYQnevM92RO5eWef6fxWrZQx3ngFJmwjmRJ9vHVZe9NXA/O8vtzw/9c0WLwmz1DcLOyqPjVymBjhxsfwqok0aJrP+EY4dyF8Ftpx9snO7KHVi+Kf9+iyjZZN+EZiAT948/7ffbxhSdY72f+boR5G0FfILE5RGpi0vzQF3A2HWB7apwyEJRMjHL4hHnYNaeIHhDzZmzvSUlR/cfIXiyb8j0xRkjEdcSNZ5fz4jaXLW86U2rA7jfhRuZWuUjS7hbZwcWuxzNAkohguSp0JvpIr4J7/KyHPj+MulDk+uKrnqYWzvlx593/46ISbz+kLjhspUl4+jPjktSWznJN9K1Q+8rs9vTAjIcNXI3mkCZAlygEp/ktCPpd5WBPzJc7mP2s97bQdW7Po8WEFx87DqkDcSDXK9fHry9a2nlWzvVN9/5f/RW7UjYuUWAXXTcJfB9h2yhWkfavlp29FboKIEbwOTwzmi5kvB1ecWtV53eHV8Y9MWbpzSXEjDVFd7k57tyz7z86p3k53sDBAV1nEFKKEhR2FRNf4iBpLx0qeBideX6pncE+6PzX76D9PrH83ocESnRO3uJEaKOsnWx7Y9skrizOqp9/63Z5e5Zo1kMZ30Z+TuOAJNMQRI34411AczV5sPj6w4vjqxXPjXYjVPX8UN9Iwar1309KOJnz34vBRORb1MEIrXU18LV4ZMSTSdKJ/14mnO5NH//nei+hHpkO+pIvKGDfSMG/Xh6/f/7u9v1mSdU71rTKPymWXQJ6A6+YI3s4ZHT4cgR+VWoQY8Qu4FzyJs3G3vzCQOTbQefTZJRPyX++pVb7zjceNNMKK79207PEpJ4pt6rT/uz1J48lcezJ2vFUTJ60HDSeg8htGDXEgzil6Kold6PgvOjOH1t0b/7xniHKdD1PcSKOoMh9G7Httydz0l/3znLODn44ilR+KBhHB4vbuw0fhLhoocXrgo5bj+XlHn4t3IanXOJjiRhqDm8C3e/t+s+SmxPHeFe4ZNFSxFPzb3MFuo5ujrPuANAquoRaHSYZT8FTTyYFd00+7bUefvfeOgy/HP++RwoyTKW6kMbwReFS+lg2V+arY5n7V9xu3L/9V3fR+P+GLV+1p6S4aMnFy4NP0if5VR38+3/li3ZL2j54/x98J6cuI2fAqEDfS8OrVkPdHWxcf2Ldp6fLulxbPOLBmvpM81rsieaJvR6Jn8FM+8XN7/R/Iml2IDUMsATx1amAPHmH/Jn18sPPwLxY4h15YctPBF+97vKETx04XrAJxI52H0u/btGztvteWdux/FU3xwr3Zg6DPfzXf+fyX9zhfgD5fvcD5/PnF2c+fW5w9+NKSuQdeXbJ8/6vxA4TzcGvG7BRxI41ZKeNEE7kCcSNN5Lsfv/Yxq0DcSGNWynOXKM48/isQN9L4v0fxFV4EFYgb6SK4SfEljv8KxI00/u9RfIUXQQXiRroIblJ8ieO/AnEjjewexVFxBUIViBspVI5YiSswsgrEjTSyusVRcQVCFYgbKVSOWIkrMLIK/H8AAAD//8F9q8kAAAAGSURBVAMAH0x3NmhcIqsAAAAASUVORK5CYII=" alt="Clahan Academy Logo" className="h-9 w-auto object-contain" onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = document.getElementById('logo-fallback-nav');
              if (fallback) fallback.style.display = 'flex';
            }} />
            <div id="logo-fallback-nav" style={{ display: 'none' }} className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 items-center justify-center text-white font-black text-lg shadow-md shadow-indigo-500/20">
              C
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
              CLAHAN ACADEMY
            </span>
          </div>


          <div className="flex items-center gap-4">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-800/50 bg-slate-100/50 dark:bg-slate-900/50 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 transition-colors"
            >
              {darkMode ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            {currentUser ? (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    if (currentUser.role === 'admin') {
                      setCurrentPage('admin-dash');
                      setActiveAdminTab('metrics');
                    } else {
                      setCurrentPage('student-dash');
                      setActiveStudentTab('active-exams');
                    }
                  }}
                  className="hidden sm:inline-flex text-sm font-semibold px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                  Dashboard
                </button>
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage('login')}
                  className="text-sm font-bold px-4 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 transition-colors"
                >
                  Login
                </button>
                <button 
                  onClick={() => setCurrentPage('register')}
                  className="text-sm font-bold px-4 py-2.5 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-500 transition-all hover:scale-102"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* LANDING PAGE ROUTE */}
      {currentPage === 'landing' && (
        <main className="w-full">
          {/* HERO SECTION */}
          <section className="relative overflow-hidden pt-24 pb-20 px-4">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.18),rgba(255,255,255,0))]" />
            <div className="max-w-5xl mx-auto text-center relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold text-xs tracking-wider uppercase mb-6">
                <Cpu className="h-4.5 w-4.5 animate-spin" /> Next-Generation Assessment Engine
              </div>
              <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.1] mb-6">
                Master Cloud, DevOps, MLOps <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-500 dark:from-indigo-400 dark:to-violet-400">
                  & Agentic AI Engineering
                </span>
              </h1>
              <p className="max-w-2xl mx-auto text-lg text-muted-foreground mb-8">
                Attend secure AI-proctored technical evaluations, practice production-grade software engineering challenges, and benchmark your programming skills for enterprise roles.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button 
                  onClick={() => setCurrentPage('register')}
                  className="inline-flex items-center gap-2 text-base font-bold px-6 py-3.5 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all hover:translate-y-[-2px]"
                >
                  Get Started Free <ArrowRight className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setCurrentPage('login')}
                  className="text-base font-bold px-6 py-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                >
                  Attend Assessment
                </button>
              </div>
            </div>
          </section>

          {/* TECHNOLOGY SECTION */}
          <section id="tech" className="py-20 bg-slate-50/50 dark:bg-slate-950/20 border-y border-slate-100 dark:border-slate-900 px-4">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-3xl font-extrabold text-center mb-4 tracking-tight">Enterprise Assessment Domains</h2>
              <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-12">
                Clahan Academy supports deep-dive assessments mapped exactly to modern technology stacks and systems engineering roles.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { title: 'Cloud Computing', desc: 'AWS, Azure, Terraform infrastructure scripting, networking architectures, and IAM governance.', icon: Laptop },
                  { title: 'DevOps & GitOps', desc: 'Docker virtualization, Kubernetes configuration, GitHub Actions, CI/CD orchestration pipelines.', icon: RefreshCw },
                  { title: 'MLOps & Pipelines', desc: 'Model registry, FastAPI packaging, data flow orchestration, and automated model testing frameworks.', icon: Cpu },
                  { title: 'Agentic AI Systems', desc: 'LangChain architectures, agent systems validation, token budget throttling, and multi-agent coordination.', icon: Terminal },
                  { title: 'Artificial Intelligence', desc: 'Convolutional neural networks, classification math, vector database tuning, and hyperparameter search.', icon: Shield },
                  { title: 'Platform Engineering', desc: 'Developer self-service portals, telemetry stacks, Prometheus monitoring, and container logging.', icon: Layers },
                ].map((t, idx) => (
                  <div key={idx} className="p-8 rounded-2xl glass-card transition-all duration-300 hover:scale-102 hover:border-indigo-500/20 hover:shadow-indigo-500/5">
                    <div className="h-12 w-12 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-6">
                      <t.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">{t.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ABOUT SECTION */}
          <section id="about" className="py-24 px-4 max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Secure Examination Portal</span>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 mb-6">Why Clahan Academy?</h2>
                <div className="space-y-6">
                  {[
                    { title: 'Robust Coding Engine', desc: 'Local Judge0 compiler integration supporting Java, Python, C++, and JavaScript with execution timeouts and safety sandboxes.' },
                    { title: 'AI-Powered Proctoring', desc: 'Real-time client-side and server-side visual detection models verifying candidate faces and flagging mobile phone or study materials.' },
                    { title: 'Actionable Grading & Feedback', desc: 'Instant calculation of result metrics paired with descriptive AI-generated motivational feedback using locally run LLM services.' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="h-6 w-6 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 mt-1">
                        <Check className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-base mb-1">{item.title}</h4>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-video bg-gradient-to-tr from-indigo-950 to-indigo-900 border border-slate-200/10 dark:border-slate-800/10 p-8 flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full bg-rose-500" />
                    <span className="h-3.5 w-3.5 rounded-full bg-amber-500" />
                    <span className="h-3.5 w-3.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-xs text-white/50 font-mono">Live Proctor Monitor</span>
                </div>
                <div className="my-6 flex items-center justify-center">
                  <div className="text-center">
                    <Video className="h-12 w-12 text-indigo-400 mx-auto mb-3 animate-pulse-slow" />
                    <span className="text-sm font-semibold text-white/80">AI Face Recognition & Object Detection active</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-indigo-300 font-mono bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20">
                  <span>Candidate: Verified</span>
                  <span>Warnings: 0</span>
                </div>
              </div>
            </div>
          </section>

          {/* CONTACT SECTION */}
          <section id="contact" className="py-20 bg-slate-50/50 dark:bg-slate-950/20 border-t border-slate-100 dark:border-slate-900 px-4">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight mb-4">Contact Support</h2>
                  <p className="text-muted-foreground mb-8">
                    Have questions about college licensing, testing schedules, or need help configuring Proctor parameters? Get in touch.
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="h-5 w-5 text-indigo-500" />
                      <span>{companySettings.contactEmail}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-5 w-5 text-indigo-500" />
                      <span>{companySettings.contactPhone}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <MapPin className="h-5 w-5 text-indigo-500 shrink-0" />
                      <a 
                        href="https://maps.app.goo.gl/pHDHZ4r2LRdm3Yst7?g_st=ac" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="hover:underline text-left"
                      >
                        {companySettings.companyAddress}
                      </a>
                    </div>
                  </div>
                </div>
                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); showToast('Message sent! Support will reach out soon.'); }}>
                  <div className="grid grid-cols-2 gap-4">
                    <input type="text" placeholder="Name" className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-indigo-500" required />
                    <input type="email" placeholder="Email" className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-indigo-500" required />
                  </div>
                  <input type="text" placeholder="Subject" className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-indigo-500" required />
                  <textarea placeholder="Write message..." rows={4} className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-indigo-500" required />
                  <button type="submit" className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors">Send Message</button>
                </form>
              </div>
            </div>
          </section>

          {/* FOOTER */}
          <footer className="py-12 border-t border-slate-200 dark:border-slate-800 text-center px-4 bg-white dark:bg-slate-950">
            <span className="font-extrabold tracking-wide text-indigo-600 dark:text-indigo-400">{companySettings.companyName}</span>
            <p className="text-xs text-muted-foreground max-w-xl mx-auto mt-4 leading-relaxed">
              {companySettings.footerText}
            </p>
          </footer>
        </main>
      )}

      {/* LOGIN ROUTE */}
      {currentPage === 'login' && (
        <main className="max-w-md mx-auto py-24 px-4">
          <div className="p-8 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-xl relative overflow-hidden">
            <h2 className="text-2xl font-extrabold text-center mb-6">Student Login</h2>
            
            {showOtpVerification ? (
              <form onSubmit={verifyOtp} className="space-y-4">
                <div className="bg-indigo-50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/20 text-xs text-indigo-600 dark:text-indigo-400 mb-2">
                  Enter the verification code sent to {unverifiedEmail} to activate your account.
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">OTP Code</label>
                  <input 
                    type="text" 
                    value={otpInput} 
                    onChange={e => setOtpInput(e.target.value)} 
                    placeholder="Enter 6-digit OTP" 
                    className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-center font-bold tracking-widest text-lg"
                    required
                  />
                </div>
                <button type="submit" className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors">
                  Verify & Activate
                </button>
                <div className="flex justify-between items-center text-xs mt-4">
                  <button 
                    type="button" 
                    onClick={handleResendOtp}
                    className="text-indigo-600 font-bold hover:underline"
                  >
                    Resend OTP
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setShowOtpVerification(false); setCurrentPage('login'); }}
                    className="text-slate-500 font-semibold hover:underline"
                  >
                    Back to Login
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => { setLoginRole('student'); handleLogin(e); }} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
                  <input 
                    type="email" 
                    value={loginEmail} 
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="student@clahan.com" 
                    className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-sm"
                    required 
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-muted-foreground">Password</label>
                    <span onClick={() => setCurrentPage('forgot-pw')} className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer">Forgot?</span>
                  </div>
                  <div className="relative">
                    <input 
                      type={showLoginPassword ? "text" : "password"} 
                      value={loginPassword} 
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="w-full p-3.5 pr-10 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-sm"
                      required 
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors">
                  Log In
                </button>
              </form>
            )}
            
            <p className="text-xs text-center text-muted-foreground mt-6">
              New to Clahan Academy?{' '}
              <span onClick={() => setCurrentPage('register')} className="text-indigo-600 font-bold hover:underline cursor-pointer">Register</span>
            </p>
          </div>
        </main>
      )}

      {/* ADMIN LOGIN ROUTE */}
      {currentPage === 'admin-login' && (
        <main className="max-w-md mx-auto py-24 px-4">
          <div className="p-8 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 to-violet-600" />
            <h2 className="text-2xl font-extrabold text-center mb-6">Management Portal</h2>
            
            {showOtpVerification ? (
              <form onSubmit={verifyOtp} className="space-y-4">
                <div className="bg-indigo-50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/20 text-xs text-indigo-600 dark:text-indigo-400 mb-2">
                  Enter the verification code sent to {unverifiedEmail} to activate your account.
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">OTP Code</label>
                  <input 
                    type="text" 
                    value={otpInput} 
                    onChange={e => setOtpInput(e.target.value)} 
                    placeholder="Enter 6-digit OTP" 
                    className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-center font-bold tracking-widest text-lg"
                    required
                  />
                </div>
                <button type="submit" className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors">
                  Verify & Activate
                </button>
                <div className="flex justify-between items-center text-xs mt-4">
                  <button 
                    type="button" 
                    onClick={handleResendOtp}
                    className="text-indigo-600 font-bold hover:underline"
                  >
                    Resend OTP
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setShowOtpVerification(false); setCurrentPage('admin-login'); }}
                    className="text-slate-500 font-semibold hover:underline"
                  >
                    Back to Admin Login
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => { setLoginRole('admin'); handleLogin(e); }} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Management Email Address</label>
                  <input 
                    type="email" 
                    value={loginEmail} 
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="admin@clahan.com" 
                    className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-sm"
                    required 
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-muted-foreground">Password</label>
                    <span onClick={() => setCurrentPage('forgot-pw')} className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer">Forgot?</span>
                  </div>
                  <div className="relative">
                    <input 
                      type={showLoginPassword ? "text" : "password"} 
                      value={loginPassword} 
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="w-full p-3.5 pr-10 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-sm"
                      required 
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors">
                  Log In as Admin
                </button>
              </form>
            )}
          </div>
        </main>
      )}

      {/* REGISTER ROUTE */}
      {currentPage === 'register' && (
        <main className="max-w-lg mx-auto py-16 px-4">
          <div className="p-8 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-xl">
            <h2 className="text-2xl font-extrabold text-center mb-6">Create Student Account</h2>
            
            {showOtpVerification ? (
              <form onSubmit={verifyOtp} className="space-y-4">
                <div className="bg-indigo-50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/20 text-xs text-indigo-600 dark:text-indigo-400 mb-2">
                  We've sent an OTP code to {unverifiedEmail}. Please verify it below to activate your account.
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Verification OTP</label>
                  <input 
                    type="text" 
                    value={otpInput} 
                    onChange={e => setOtpInput(e.target.value)} 
                    placeholder="Enter 6-digit OTP" 
                    className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-center font-bold tracking-widest text-lg"
                    required
                  />
                </div>
                <button type="submit" className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors">
                  Verify & Register
                </button>
                <div className="flex justify-between items-center text-xs mt-4">
                  <button 
                    type="button" 
                    onClick={handleResendOtp}
                    className="text-indigo-600 font-bold hover:underline"
                  >
                    Resend OTP
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setShowOtpVerification(false); setCurrentPage('login'); }}
                    className="text-slate-500 font-semibold hover:underline"
                  >
                    Go to Login
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Full Name *</label>
                    <input type="text" placeholder="John Doe" value={regForm.fullName} onChange={e => setRegForm({...regForm, fullName: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Email Address *</label>
                    <input type="email" placeholder="john@example.com" value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Phone Number *</label>
                    <input type="text" placeholder="9876543210" value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Roll Number *</label>
                    <input type="text" placeholder="CSE2026-08" value={regForm.rollNumber} onChange={e => setRegForm({...regForm, rollNumber: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">College *</label>
                    <select 
                      value={regForm.collegeId} 
                      onChange={e => {
                        setRegForm({...regForm, collegeId: e.target.value, departmentId: '', batchId: '', trainerId: ''});
                        fetchDepartments(e.target.value);
                        fetchBatches(e.target.value);
                        fetchRegisterTrainers(e.target.value);
                      }} 
                      className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      required
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select College</option>
                      {colleges.map(c => <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Department *</label>
                    <select 
                      value={regForm.departmentId} 
                      onChange={e => setRegForm({...regForm, departmentId: e.target.value})} 
                      className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      required
                      disabled={!regForm.collegeId}
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select Dept</option>
                      {departments.map(d => <option key={d.id} value={d.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{d.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Batch {batches.length > 0 ? '*' : '(Optional)'}</label>
                    <select 
                      value={regForm.batchId} 
                      onChange={e => setRegForm({...regForm, batchId: e.target.value, trainerId: ''})} 
                      className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      required={batches.length > 0}
                      disabled={!regForm.collegeId}
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select Batch</option>
                      {batches.map(b => <option key={b.id} value={b.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Trainer (Optional)</label>
                    <select 
                      value={regForm.trainerId} 
                      onChange={e => setRegForm({...regForm, trainerId: e.target.value})} 
                      className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      disabled={!regForm.collegeId}
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select Trainer</option>
                      {registerTrainers
                        .filter(t => {
                          if (regForm.batchId) {
                            return (t.batch_id === regForm.batchId || t.batchId === regForm.batchId);
                          }
                          return true;
                        })
                        .map(t => <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Year *</label>
                    <select value={regForm.year} onChange={e => setRegForm({...regForm, year: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-850 rounded-xl text-sm focus:outline-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" required>
                      <option value="1st Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">1st Year</option>
                      <option value="2nd Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">2nd Year</option>
                      <option value="3rd Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">3rd Year</option>
                      <option value="4th Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">4th Year</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Password *</label>
                    <div className="relative">
                      <input 
                        type={showRegPassword ? "text" : "password"} 
                        placeholder="••••••••" 
                        value={regForm.password} 
                        onChange={e => setRegForm({...regForm, password: e.target.value})} 
                        className="w-full p-3 pr-10 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" 
                        required 
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Confirm Password *</label>
                    <div className="relative">
                      <input 
                        type={showRegConfirmPassword ? "text" : "password"} 
                        placeholder="••••••••" 
                        value={regForm.confirmPassword} 
                        onChange={e => setRegForm({...regForm, confirmPassword: e.target.value})} 
                        className="w-full p-3 pr-10 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" 
                        required 
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showRegConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">GitHub (Opt)</label>
                    <input type="text" placeholder="https://github.com/..." value={regForm.githubProfile} onChange={e => setRegForm({...regForm, githubProfile: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">LinkedIn (Opt)</label>
                    <input type="text" placeholder="https://linkedin.com/..." value={regForm.linkedinProfile} onChange={e => setRegForm({...regForm, linkedinProfile: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Profile Photo Link (Opt)</label>
                    <input type="text" placeholder="Photo URL" value={regForm.profilePhotoUrl} onChange={e => setRegForm({...regForm, profilePhotoUrl: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" />
                  </div>
                </div>

                <button type="submit" className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors mt-4">
                  Sign Up
                </button>
              </form>
            )}
            
            <p className="text-xs text-center text-muted-foreground mt-6">
              Already have an account?{' '}
              <span onClick={() => setCurrentPage('login')} className="text-indigo-600 font-bold hover:underline cursor-pointer">Login</span>
            </p>
          </div>
        </main>
      )}

      {/* FORGOT PASSWORD ROUTE */}
      {currentPage === 'forgot-pw' && (
        <main className="max-w-md mx-auto py-24 px-4">
          <div className="p-8 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-xl">
            <h2 className="text-2xl font-extrabold text-center mb-6">Forgot Password</h2>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
                <input 
                  type="email" 
                  value={resetEmail} 
                  onChange={e => setResetEmail(e.target.value)} 
                  placeholder="student@clahan.com" 
                  className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-sm"
                  required 
                />
              </div>
              <button type="submit" className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors">
                Send OTP Link
              </button>
            </form>
          </div>
        </main>
      )}

      {/* RESET PASSWORD ROUTE */}
      {currentPage === 'reset-pw' && (
        <main className="max-w-md mx-auto py-24 px-4">
          <div className="p-8 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-xl">
            <h2 className="text-2xl font-extrabold text-center mb-6">Reset Password</h2>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
                <input type="email" value={resetEmail} disabled className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-100 dark:bg-slate-900 text-sm text-muted-foreground" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">OTP Code</label>
                <input type="text" value={resetOtp} onChange={e => setResetOtp(e.target.value)} placeholder="6-digit OTP" className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-sm" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">New Password</label>
                <div className="relative">
                  <input 
                    type={showNewPassword ? "text" : "password"} 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                    placeholder="••••••••" 
                    className="w-full p-3.5 pr-10 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-transparent focus:outline-indigo-500 text-sm" 
                    required 
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors">
                Save New Password
              </button>
            </form>
          </div>
        </main>
      )}

      {/* STUDENT DASHBOARD ROUTE */}
      {currentPage === 'student-dash' && currentUser && (
        <main className="max-w-7xl mx-auto py-10 px-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar Card */}
            <div className="lg:col-span-1 space-y-6">
              <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 text-center shadow-sm">
                <div className="relative h-20 w-20 rounded-2xl mx-auto overflow-hidden bg-gradient-to-tr from-indigo-500 to-violet-500 mb-4 flex items-center justify-center text-white text-3xl font-bold shadow-md">
                  {currentUser.profilePhotoUrl ? (
                    <img src={currentUser.profilePhotoUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    (currentUser.fullName || currentUser.full_name || 'Student').charAt(0)
                  )}
                </div>
                 <h3 className="font-extrabold text-lg text-slate-800 dark:text-slate-100">{currentUser.fullName || currentUser.full_name || 'Student'}</h3>
                <p className="text-xs font-mono text-indigo-650 dark:text-indigo-400 mt-1 font-bold">
                  Roll No: {currentUser.rollNumber || currentUser.roll_number || 'N/A'}
                </p>
                <div className="border-t border-slate-200/40 dark:border-slate-800/40 pt-4 mt-4 space-y-2 text-left text-sm text-slate-700 dark:text-slate-355">
                  <div className="flex justify-between"><span className="font-semibold text-slate-500">College:</span><span className="truncate max-w-[130px] text-xs font-bold" title={currentUser.college_name}>{currentUser.college_name || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-500">Dept:</span><span className="font-bold">{currentUser.department_name || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-500">Year:</span><span className="font-bold">{currentUser.year || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-500">Batch:</span><span className="font-bold text-indigo-600 dark:text-indigo-400">{currentUser.batchName || currentUser.batch_name || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-500">Trainer:</span><span className="font-bold text-violet-600 dark:text-violet-400">{currentUser.trainerName || currentUser.trainer_name || 'None'}</span></div>
                </div>
              </div>

              {/* Navigation Menu */}
              <div className="p-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm flex flex-col gap-1">
                {[
                  { id: 'active-exams', label: 'Assessments', icon: BookOpen },
                  { id: 'results', label: 'Results & Performance', icon: Award },
                  { id: 'trainers', label: 'My Trainers', icon: User },
                  { id: 'notifications', label: 'Notifications', icon: Bell },
                  { id: 'profile', label: 'Edit Profile', icon: User }
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveStudentTab(item.id as any)}
                      className={`flex items-center gap-3 w-full p-3 rounded-xl text-sm font-bold transition-all ${activeStudentTab === item.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-muted-foreground hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-foreground'}`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content Area */}
            <div className="lg:col-span-3">
              {activeStudentTab === 'active-exams' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">Active Assessments</h2>
                    <p className="text-sm text-muted-foreground">Exams published by your administrator for your batch.</p>
                  </div>
                  {activeExams.length === 0 ? (
                    <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/40">
                      <BookOpen className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
                      <p className="font-bold text-slate-800 dark:text-slate-200">No active assessments found</p>
                      <p className="text-xs text-muted-foreground mt-1">Check back later or contact your college administrator.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {activeExams.map(ex => (
                        <div key={ex.id} className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start gap-2 mb-3">
                              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase">{ex.exam_type}</span>
                              <div className="text-right">
                                <span className="text-xs text-muted-foreground font-mono block">{ex.duration_minutes} Mins</span>
                                <span className="text-[10px] text-rose-500 dark:text-rose-400 font-semibold block mt-0.5">
                                  Entry Window: {ex.window_open_minutes || 10} Mins
                                </span>
                              </div>
                            </div>
                            <h3 className="font-extrabold text-base mb-1 text-slate-900 dark:text-white">{ex.name}</h3>
                            <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mb-3">
                              Scheduled at: {new Date(ex.schedule_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-6">{ex.description}</p>
                          </div>
                          <button
                            onClick={() => checkInstructions(ex.id)}
                            className="w-full py-3 text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md transition-colors"
                          >
                            Attend Assessment
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upcoming Schedule */}
                  <div>
                    <h3 className="font-extrabold text-lg tracking-tight mt-10 mb-4">Upcoming Schedule</h3>
                    {upcomingExams.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No upcoming exams scheduled.</p>
                    ) : (
                      <div className="space-y-3">
                        {upcomingExams.map(ex => (
                          <div key={ex.id} className="p-4 rounded-xl border border-slate-200/40 dark:border-slate-800/40 bg-white dark:bg-slate-950 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-sm">{ex.name}</p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                <p className="text-xs text-muted-foreground">Scheduled for: {new Date(ex.schedule_date).toLocaleString()}</p>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold font-mono">
                                  Entry Window: {ex.window_open_minutes || 10} Mins
                                </span>
                              </div>
                            </div>
                            <span className="text-xs font-mono text-indigo-500 dark:text-indigo-400 font-semibold">{ex.duration_minutes} Mins</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeStudentTab === 'results' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">Attempt Performance</h2>
                    <p className="text-sm text-muted-foreground">Verify scorecards and review feedback reports.</p>
                  </div>
                  {completedAttempts.length === 0 ? (
                    <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/40">
                      <Award className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
                      <p className="font-bold">No results available yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Results will appear here immediately after exam submission.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {completedAttempts.map(att => (
                        <div key={att.id} className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                                att.status === 'terminated' 
                                  ? 'bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30' 
                                  : att.results_released === false
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : att.passed 
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              }`}>
                                {att.status === 'terminated' ? 'TERMINATED' : att.results_released === false ? 'AWAITING COMPLETION' : att.passed ? 'PASSED' : 'FAILED'}
                              </span>
                              <span className="text-xs text-muted-foreground">Cutoff: {att.cutoff_percentage || 50}%</span>
                            </div>
                            <h3 className="font-extrabold text-base">{att.exam_name || 'Technical Assessment'}</h3>
                            <p className="text-xs text-muted-foreground mt-1">Submitted on: {new Date(att.created_at).toLocaleString()}</p>
                            
                            {att.feedback && (
                              <div className={`mt-3 border-l-2 p-2.5 rounded-r-lg max-w-xl text-xs font-semibold ${
                                att.status === 'terminated'
                                  ? 'bg-rose-500/5 border-rose-500 text-rose-705 dark:text-rose-350'
                                  : att.results_released === false
                                    ? 'bg-amber-500/5 border-amber-500 text-amber-700 dark:text-amber-300 italic'
                                    : 'bg-indigo-500/5 border-indigo-500 text-indigo-700 dark:text-indigo-300 italic'
                              }`}>
                                {att.status === 'terminated' ? att.feedback : `"${att.feedback}"`}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            {att.results_released !== false ? (
                              <div className="text-right">
                                <p className="font-black text-2xl tracking-tight text-indigo-600 dark:text-indigo-400">{att.percentage}%</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Score: {att.score} pts</p>
                              </div>
                            ) : (
                              <div className="text-right">
                                <p className="font-bold text-sm text-amber-500">Awaiting Results</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Pending all completion</p>
                              </div>
                            )}
                            <button
                              onClick={() => fetchResultDetails(att.id)}
                              disabled={att.results_released === false}
                              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-colors ${
                                att.results_released === false
                                  ? 'bg-slate-100 dark:bg-slate-900 border border-slate-200/20 dark:border-slate-800/20 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                                  : 'bg-slate-100 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800'
                              }`}
                            >
                              {att.results_released === false ? 'Locked' : 'View Report'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeStudentTab === 'notifications' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">Recent Notifications</h2>
                    <p className="text-sm text-muted-foreground">In-app notifications and scheduled announcements.</p>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No recent notifications.</p>
                  ) : (
                    <div className="space-y-3">
                      {notifications.map((n, i) => (
                        <div key={n.id || i} className="p-4 rounded-xl border border-slate-200/40 dark:border-slate-800/40 bg-white dark:bg-slate-950 flex gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            n.type === 'result_published' 
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                              : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                          }`}>
                            {n.type === 'result_published' ? <Award className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-2">{new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeStudentTab === 'profile' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">Customize Profile</h2>
                    <p className="text-sm text-muted-foreground">Keep your portfolios and roll details up to date.</p>
                  </div>
                  <form onSubmit={updateStudentProfile} className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                        <input type="text" value={phoneUpdate} onChange={e => setPhoneUpdate(e.target.value)} placeholder={currentUser.phone || "9876543210"} className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">Profile Photo Link</label>
                        <input type="text" value={photoUpdate} onChange={e => setPhotoUpdate(e.target.value)} placeholder={currentUser.profilePhotoUrl || "URL string"} className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">GitHub Profile URL</label>
                        <input type="text" value={githubUpdate} onChange={e => setGithubUpdate(e.target.value)} placeholder={currentUser.githubProfile || "https://github.com/..."} className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">LinkedIn Profile URL</label>
                        <input type="text" value={linkedinUpdate} onChange={e => setLinkedinUpdate(e.target.value)} placeholder={currentUser.linkedinProfile || "https://linkedin.com/..."} className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">Academic Batch (Change Batch)</label>
                        <select
                          value={batchUpdate}
                          onChange={e => { setBatchUpdate(e.target.value); setTrainerUpdate(''); }}
                          className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-indigo-500"
                        >
                          <option value="">No Batch Assigned</option>
                          {batches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          Currently enrolled in: <span className="font-bold text-indigo-600 dark:text-indigo-400">{currentUser.batch_name || currentUser.batchName || 'None'}</span>
                        </p>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">Academic Trainer (Change Trainer)</label>
                        <select
                          value={trainerUpdate}
                          onChange={e => setTrainerUpdate(e.target.value)}
                          className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-indigo-500"
                        >
                          <option value="">No Trainer Assigned</option>
                          {studentTrainers
                            .filter(t => {
                              if (batchUpdate) {
                                return (t.batch_id === batchUpdate || t.batchId === batchUpdate);
                              }
                              return true;
                            })
                            .map(t => (
                              <option key={t.id} value={t.id}>{t.name} {t.specialization ? `(${t.specialization})` : ''}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          Currently assigned: <span className="font-bold text-indigo-600 dark:text-indigo-400">{currentUser.trainer_name || currentUser.trainerName || 'None'}</span>
                        </p>
                      </div>
                    </div>
                    <button type="submit" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors text-sm">
                      Update Profile
                    </button>
                  </form>

                  {/* Change Password Panel */}
                  <div>
                    <h2 className="text-xl font-extrabold tracking-tight mt-8">Change Password</h2>
                    <p className="text-sm text-muted-foreground">Modify your account security credentials.</p>
                  </div>
                  <form onSubmit={changeStudentPassword} className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">Current Password</label>
                        <div className="relative">
                          <input 
                            type={showCurrentPassword ? "text" : "password"} 
                            value={currentPassword} 
                            onChange={e => setCurrentPassword(e.target.value)} 
                            placeholder="••••••••" 
                            className="w-full p-3.5 pr-10 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" 
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">New Password</label>
                        <div className="relative">
                          <input 
                            type={showNewProfilePassword ? "text" : "password"} 
                            value={newProfilePassword} 
                            onChange={e => setNewProfilePassword(e.target.value)} 
                            placeholder="••••••••" 
                            className="w-full p-3.5 pr-10 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" 
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewProfilePassword(!showNewProfilePassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {showNewProfilePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <button type="submit" className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl shadow-md transition-colors text-sm">
                      Update Password
                    </button>
                  </form>
                </div>
              )}

              {activeStudentTab === 'trainers' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">My Trainers</h2>
                    <p className="text-sm text-muted-foreground">Trainers assigned to your batch for academic and lab sessions.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {studentTrainers.length === 0 ? (
                      <div className="col-span-full p-12 text-center border border-dashed rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                        <p className="text-sm text-muted-foreground">No trainers have been assigned to your batch yet.</p>
                      </div>
                    ) : (
                      studentTrainers.map((trainer) => (
                        <div
                          key={trainer.id}
                          className="p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">
                                {trainer.name}
                              </h3>
                              <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                                {trainer.specialization || 'General Specialization'}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 uppercase">
                              Batch: {trainer.batch_name || 'Your Batch'}
                            </span>
                          </div>

                          <div className="border-t border-slate-100 dark:border-slate-900/60 pt-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5" />
                              <span>{trainer.email}</span>
                            </div>
                            {trainer.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-3.5 w-3.5" />
                                <span>{trainer.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* ADMIN DASHBOARD ROUTE */}
      {currentPage === 'admin-dash' && currentUser && (
        <main className="max-w-7xl mx-auto py-10 px-4">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Admin Sidebar Navigation */}
            <div className="lg:w-64 shrink-0 flex flex-col gap-1.5 p-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm h-fit">
              <div className="px-4 py-3 border-b border-slate-200/40 dark:border-slate-800/40 mb-2">
                <span className="text-xs text-muted-foreground uppercase font-black tracking-widest">Admin Control Center</span>
              </div>
              {[
                { id: 'metrics', label: 'Metrics & Analytics', icon: Award },
                { id: 'colleges', label: 'Colleges & Departments', icon: Layers },
                { id: 'students', label: 'Student Management', icon: Users },
                { id: 'trainers', label: 'Trainer Management', icon: User },
                { id: 'exams', label: 'Exam Configuration', icon: BookOpen },
                { id: 'live', label: 'Live Exam Proctor', icon: Video },
                { id: 'settings', label: 'System Settings', icon: Settings }
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveAdminTab(item.id as any)}
                    className={`flex items-center gap-3 w-full p-3 rounded-xl text-sm font-bold transition-all ${activeAdminTab === item.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-muted-foreground hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-foreground'}`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Admin Content Area */}
            <div className="flex-1 space-y-6">
              
              {activeAdminTab === 'metrics' && (
                <div className="space-y-8">
                  {/* Dashboard Metrics grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                      { label: 'Total Students', value: adminMetrics.totalStudents, icon: Users, color: 'text-indigo-600 bg-indigo-500/10 border-indigo-500/20' },
                      { label: 'Total Exams', value: adminMetrics.totalExams, icon: BookOpen, color: 'text-violet-600 bg-violet-500/10 border-violet-500/20' },
                      { label: 'Live Assessment Sessions', value: adminMetrics.liveExams, icon: Video, color: 'text-rose-600 bg-rose-500/10 border-rose-500/20' },
                      { label: 'Pass Rate average', value: `${adminMetrics.passPercentage}%`, icon: Award, color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' }
                    ].map((card, idx) => (
                      <div key={idx} className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">{card.label}</p>
                          <p className="text-3xl font-black tracking-tight mt-2">{card.value}</p>
                        </div>
                        <div className={`h-12 w-12 rounded-xl border flex items-center justify-center ${card.color}`}>
                          <card.icon className="h-6 w-6" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Analytics Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm">
                      <h3 className="font-extrabold text-base mb-4">Assessment Performance</h3>
                      <div className="h-44 flex items-end justify-between px-4 pb-4 gap-2">
                        {[
                          { name: 'Pass Percentage', pct: adminMetrics.passPercentage, color: 'bg-emerald-500' },
                          { name: 'Fail Percentage', pct: adminMetrics.failPercentage, color: 'bg-rose-500' },
                          { name: 'Avg Attempt Score', pct: adminMetrics.averageScore, color: 'bg-indigo-500' }
                        ].map((bar, idx) => (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                            <span className="text-xs font-bold">{bar.pct}%</span>
                            <div className={`w-12 rounded-t-lg transition-all ${bar.color}`} style={{ height: `${bar.pct * 1.2}px` }} />
                            <span className="text-[10px] font-semibold text-muted-foreground text-center">{bar.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm flex flex-col justify-between">
                      <div>
                        <h3 className="font-extrabold text-base mb-2">Clahan AI Proctor System</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Visual proctoring models check image coordinates and analyze webcam frames continuously to flag fraud violations.
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">YOLOv8</p>
                          <p className="text-sm font-extrabold mt-1 text-indigo-500">Active</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">InsightFace</p>
                          <p className="text-sm font-extrabold mt-1 text-indigo-500">Active</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">Tesseract</p>
                          <p className="text-sm font-extrabold mt-1 text-indigo-500">Active</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeAdminTab === 'colleges' && (
                <div className="space-y-8">
                  {/* Create College */}
                  <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm">
                    <h3 className="font-extrabold text-base mb-4">Onboard College</h3>
                    <form onSubmit={createCollege} className="flex gap-4">
                      <input 
                        type="text" 
                        value={newCollegeName}
                        onChange={e => setNewCollegeName(e.target.value)}
                        placeholder="e.g. ABC Engineering College" 
                        className="flex-1 p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" 
                        required
                      />
                      <button type="submit" className="px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors text-sm">
                        Create College
                      </button>
                    </form>
                  </div>

                  {/* Create Department */}
                  <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm">
                    <h3 className="font-extrabold text-base mb-4">Configure Department</h3>
                    <form onSubmit={createDepartment} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <select 
                        value={newDeptCollegeId} 
                        onChange={e => setNewDeptCollegeId(e.target.value)} 
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent text-slate-900 dark:text-white focus:outline-indigo-500" 
                        required
                      >
                        <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select Target College</option>
                        {adminColleges.map(c => <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c.name}</option>)}
                      </select>
                      <input 
                        type="text" 
                        value={newDeptName}
                        onChange={e => setNewDeptName(e.target.value)}
                        placeholder="e.g. CSE, ECE, AIDS" 
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" 
                        required
                      />
                      <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors text-sm">
                        Add Department
                      </button>
                    </form>
                  </div>

                  {/* Configure Batch */}
                  <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm">
                    <h3 className="font-extrabold text-base mb-4">Configure Batch</h3>
                    <form onSubmit={createBatch} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <select 
                        value={newBatchCollegeId} 
                        onChange={e => setNewBatchCollegeId(e.target.value)} 
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent text-slate-900 dark:text-white focus:outline-indigo-500" 
                        required
                      >
                        <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select Target College</option>
                        {adminColleges.map(c => <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c.name}</option>)}
                      </select>
                      <input 
                        type="text" 
                        value={newBatchName}
                        onChange={e => setNewBatchName(e.target.value)}
                        placeholder="e.g. Batch 2022-26, Batch 2023-27" 
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" 
                        required
                      />
                      <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors text-sm">
                        Add Batch
                      </button>
                    </form>
                  </div>

                  {/* Configure Trainer */}
                  <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm">
                    <h3 className="font-extrabold text-base mb-4">Configure Trainer</h3>
                    <form onSubmit={createOrUpdateTrainer} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <select 
                        value={trainerForm.collegeId} 
                        onChange={e => setTrainerForm({ ...trainerForm, collegeId: e.target.value, batchId: '' })} 
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-transparent text-slate-900 dark:text-white focus:outline-indigo-500" 
                        required
                      >
                        <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select College</option>
                        {adminColleges.map(c => <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c.name}</option>)}
                      </select>
                      <select 
                        value={trainerForm.batchId} 
                        onChange={e => setTrainerForm({ ...trainerForm, batchId: e.target.value })} 
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-transparent text-slate-900 dark:text-white focus:outline-indigo-500"
                        disabled={!trainerForm.collegeId}
                        required
                      >
                        <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select Batch</option>
                        {adminBatches
                          .filter(b => b.college_id === trainerForm.collegeId || b.collegeId === trainerForm.collegeId)
                          .map(b => <option key={b.id} value={b.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{b.name}</option>)}
                      </select>
                      <input 
                        type="text" 
                        value={trainerForm.name}
                        onChange={e => setTrainerForm({ ...trainerForm, name: e.target.value })}
                        placeholder="Trainer Name" 
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-transparent focus:outline-indigo-500" 
                        required
                      />
                      <input 
                        type="email" 
                        value={trainerForm.email}
                        onChange={e => setTrainerForm({ ...trainerForm, email: e.target.value })}
                        placeholder="Email Address" 
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-transparent focus:outline-indigo-500" 
                        required
                      />
                      <input 
                        type="text" 
                        value={trainerForm.specialization}
                        onChange={e => setTrainerForm({ ...trainerForm, specialization: e.target.value })}
                        placeholder="Specialization" 
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-transparent focus:outline-indigo-500" 
                      />
                      <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors text-xs py-3.5">
                        Add Trainer
                      </button>
                    </form>
                  </div>

                  {/* Lists of Colleges, Departments, and Batches */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-250/50 dark:border-slate-800/50 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Filter Departments & Batches by College:</span>
                      <p className="text-[10px] text-muted-foreground">Select a college below to only display its associated depts and batches.</p>
                    </div>
                    <select
                      value={selectedConfigCollegeId}
                      onChange={(e) => setSelectedConfigCollegeId(e.target.value)}
                      className="text-xs p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-w-[200px]"
                    >
                      <option value="">Show All Colleges</option>
                      {adminColleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Colleges */}
                    <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                      <h4 className="font-extrabold text-sm border-b pb-2">Registered Colleges</h4>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {adminColleges.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No colleges onboarded.</p>
                        ) : (
                          adminColleges.map(c => (
                            <div key={c.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs font-bold flex justify-between items-center">
                              <span className="truncate mr-2">{c.name}</span>
                              <button
                                type="button"
                                onClick={() => deleteCollege(c.id)}
                                className="text-red-500 hover:text-red-700 transition-colors p-1"
                                title="Delete College"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Departments */}
                    <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                      <h4 className="font-extrabold text-sm border-b pb-2">Configured Departments</h4>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {adminDepts.filter(d => !selectedConfigCollegeId || d.college_id === selectedConfigCollegeId || d.collegeId === selectedConfigCollegeId).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No departments configured for this selection.</p>
                        ) : (
                          adminDepts
                            .filter(d => !selectedConfigCollegeId || d.college_id === selectedConfigCollegeId || d.collegeId === selectedConfigCollegeId)
                            .map(d => (
                              <div key={d.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center">
                                <div className="space-y-1 truncate mr-2">
                                  <p className="font-bold">{d.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{d.college_name || 'College'}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => deleteDepartment(d.id)}
                                  className="text-red-500 hover:text-red-700 transition-colors p-1 shrink-0"
                                  title="Delete Department"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    {/* Batches */}
                    <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                      <h4 className="font-extrabold text-sm border-b pb-2">Configured Batches</h4>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {adminBatches.filter(b => !selectedConfigCollegeId || b.college_id === selectedConfigCollegeId || b.collegeId === selectedConfigCollegeId).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No batches configured for this selection.</p>
                        ) : (
                          adminBatches
                            .filter(b => !selectedConfigCollegeId || b.college_id === selectedConfigCollegeId || b.collegeId === selectedConfigCollegeId)
                            .map(b => (
                              <div key={b.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center">
                                <div className="space-y-1 truncate mr-2">
                                  <p className="font-bold">{b.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{b.college_name || 'College'}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => deleteBatch(b.id)}
                                  className="text-red-500 hover:text-red-700 transition-colors p-1 shrink-0"
                                  title="Delete Batch"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    {/* Trainers */}
                    <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                      <h4 className="font-extrabold text-sm border-b pb-2">Configured Trainers</h4>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {adminTrainers.filter(t => !selectedConfigCollegeId || t.college_id === selectedConfigCollegeId || t.collegeId === selectedConfigCollegeId).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No trainers configured for this selection.</p>
                        ) : (
                          adminTrainers
                            .filter(t => !selectedConfigCollegeId || t.college_id === selectedConfigCollegeId || t.collegeId === selectedConfigCollegeId)
                            .map(t => (
                              <div key={t.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center">
                                <div className="space-y-1 truncate mr-2">
                                  <p className="font-bold">{t.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{t.specialization || 'General'}</p>
                                  <p className="text-[9px] text-indigo-500 font-bold truncate">Batch: {t.batch_name || 'No Batch'}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => deleteTrainer(t.id)}
                                  className="text-red-500 hover:text-red-700 transition-colors p-1 shrink-0"
                                  title="Delete Trainer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeAdminTab === 'students' && (
                <div className="space-y-6">
                  {/* Manual Creation Toggle / Bulk Import */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 gap-4">
                    <h3 className="font-extrabold text-lg">Student Onboarding</h3>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Manual create form */}
                    <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                      <h4 className="font-bold text-sm">Manual Student Creation</h4>
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        createStudentManual({
                          email: fd.get('email'),
                          fullName: fd.get('fullName'),
                          phone: fd.get('phone'),
                          rollNumber: fd.get('rollNumber'),
                          collegeId: fd.get('collegeId'),
                          departmentId: fd.get('departmentId'),
                          batchId: fd.get('batchId'),
                          year: fd.get('year')
                        });
                        e.currentTarget.reset();
                      }} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <input type="text" name="fullName" placeholder="Full Name" className="p-3 border rounded-xl text-xs bg-transparent" required />
                          <input type="email" name="email" placeholder="Email" className="p-3 border rounded-xl text-xs bg-transparent" required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <input type="text" name="phone" placeholder="Phone Number" className="p-3 border rounded-xl text-xs bg-transparent" />
                          <input type="text" name="rollNumber" placeholder="Roll Number" className="p-3 border rounded-xl text-xs bg-transparent" required />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <select name="collegeId" onChange={e => { fetchDepartments(e.target.value); fetchBatches(e.target.value); }} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" required>
                            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">College</option>
                            {adminColleges.map(c => <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c.name}</option>)}
                          </select>
                          <select name="departmentId" className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" required>
                            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Dept</option>
                            {departments.map(d => <option key={d.id} value={d.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{d.name}</option>)}
                          </select>
                          <select name="batchId" className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" required={batches.length > 0}>
                            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{batches.length > 0 ? 'Batch' : 'Batch (N/A)'}</option>
                            {batches.map(b => <option key={b.id} value={b.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{b.name}</option>)}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <select name="year" className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" required>
                            <option value="1st Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">1st Year</option>
                            <option value="2nd Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">2nd Year</option>
                            <option value="3rd Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">3rd Year</option>
                            <option value="4th Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">4th Year</option>
                          </select>
                          <select name="trainerId" className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Trainer (Optional)</option>
                            {adminTrainers.map(t => (
                              <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                                {t.name} ({t.batch_name || 'General'})
                              </option>
                            ))}
                          </select>
                        </div>
                        <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors">
                          Create Student Account
                        </button>
                      </form>
                    </div>

                    {/* Bulk Import */}
                    <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-sm">Bulk Import Students</h4>
                        <a 
                          href={`${API_ADMIN}/students/template`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline font-bold"
                          onClick={(e) => {
                            // Fallback simulation for offline download
                            const dummyCsv = "Full Name,Email,Phone,Roll Number,College,Department,Year\nJohn Doe,john@example.com,9876543210,CSE101,ABC Engineering College,CSE,3rd Year";
                            const blob = new Blob([dummyCsv], { type: 'text/csv' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.setAttribute('href', url);
                            a.setAttribute('download', 'students_template.csv');
                            a.click();
                          }}
                        >
                          <Download className="h-3.5 w-3.5" /> Download Template
                        </a>
                      </div>
                      <form onSubmit={importStudentsCsv} className="space-y-3">
                        <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center hover:border-indigo-500 dark:hover:border-indigo-500 transition-all group relative cursor-pointer">
                          <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleCsvFileUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Upload className="h-6 w-6 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-350">
                              Drag & drop or Click to upload CSV / Excel File
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Accepts .csv, .xlsx, and .xls formats.
                            </p>
                          </div>
                        </div>

                        <div className="text-center text-[10px] text-muted-foreground uppercase font-bold py-1">
                          — Or Paste CSV Text Directly —
                        </div>

                        <textarea
                          value={studentCsvInput}
                          onChange={e => setStudentCsvInput(e.target.value)}
                          placeholder="Paste CSV rows here (Header: Full Name,Email,Phone,Roll Number,College,Department,Year)"
                          rows={3}
                          className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-transparent font-mono focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                        />
                        <button type="submit" className="w-full py-3 border border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white font-bold rounded-xl text-xs transition-all">
                          Upload & Process Students
                        </button>
                      </form>

                      {importSummary && (
                        <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl text-xs space-y-1">
                          <p className="font-bold text-indigo-600">Import Summary:</p>
                          <p>Successful: {importSummary.success} | Failed: {importSummary.failed}</p>
                          {importSummary.errors.map((e: string, i: number) => <p key={i} className="text-rose-500">{e}</p>)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* List of onboarded Students */}
                  <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-sm flex items-center gap-2">
                        <span>Registered Students</span>
                        <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full font-mono font-bold text-slate-700 dark:text-slate-300">
                          {adminStudents.filter(student => {
                            if (studentFilterCollegeId && student.collegeId !== studentFilterCollegeId) return false;
                            if (studentFilterDeptId && student.departmentId !== studentFilterDeptId) return false;
                            if (studentFilterBatchId && student.batchId !== studentFilterBatchId) return false;
                            if (studentFilterTrainerId && (student.trainerId || student.trainer_id) !== studentFilterTrainerId) return false;
                            if (studentFilterYear && student.year !== studentFilterYear) return false;
                            return true;
                          }).length} / {adminStudents.length}
                        </span>
                      </h4>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-xl p-1 bg-slate-50 dark:bg-slate-900">
                          <input
                            type="text"
                            placeholder="New password for all..."
                            id="bulkPasswordInput"
                            className="bg-transparent text-xs p-1 focus:outline-none w-36 text-slate-900 dark:text-white"
                          />
                          <button
                            onClick={async () => {
                              const input = document.getElementById('bulkPasswordInput') as HTMLInputElement;
                              const newPw = input?.value?.trim();
                              if (!newPw) {
                                showToast('Please type a password first.', 'warning');
                                return;
                              }
                              if (newPw.length < 6) {
                                showToast('Password must be at least 6 characters.', 'warning');
                                return;
                              }
                              if (confirm(`Are you sure you want to set the password to "${newPw}" for ALL students?`)) {
                                try {
                                  const res = await fetch(`${API_ADMIN}/students/set-password-all`, {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ password: newPw })
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    showToast(data.message || 'Bulk password update successful!', 'success');
                                    if (input) input.value = '';
                                    loadAdminDashboard();
                                  } else {
                                    const err = await res.json();
                                    showToast(err.error || 'Bulk update failed.', 'error');
                                  }
                                } catch (e: any) {
                                  showToast(`Error updating passwords: ${e.message}`, 'error');
                                }
                              }
                            }}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-[10px] transition-colors"
                          >
                            Set Password for All
                          </button>
                        </div>
                        <button
                          onClick={downloadStudentsExcel}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" /> Download Excel
                        </button>
                      </div>
                    </div>

                    {/* Filter controls */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Filter College</label>
                        <select
                          value={studentFilterCollegeId}
                          onChange={(e) => {
                            setStudentFilterCollegeId(e.target.value);
                            setStudentFilterDeptId('');
                            setStudentFilterBatchId('');
                            setStudentFilterTrainerId('');
                          }}
                          className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                        >
                          <option value="">All Colleges</option>
                          {adminColleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Filter Department</label>
                        <select
                          value={studentFilterDeptId}
                          onChange={(e) => setStudentFilterDeptId(e.target.value)}
                          className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                          disabled={!studentFilterCollegeId}
                        >
                          <option value="">All Departments</option>
                          {adminDepts
                            .filter(d => d.college_id === studentFilterCollegeId || d.collegeId === studentFilterCollegeId)
                            .map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Filter Batch</label>
                        <select
                          value={studentFilterBatchId}
                          onChange={(e) => setStudentFilterBatchId(e.target.value)}
                          className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                          disabled={!studentFilterCollegeId}
                        >
                          <option value="">All Batches</option>
                          {adminBatches
                            .filter(b => b.college_id === studentFilterCollegeId || b.collegeId === studentFilterCollegeId)
                            .map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Filter Trainer</label>
                        <select
                          value={studentFilterTrainerId}
                          onChange={(e) => setStudentFilterTrainerId(e.target.value)}
                          className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                          disabled={!studentFilterCollegeId}
                        >
                          <option value="">All Trainers</option>
                          {adminTrainers
                            .filter(t => t.college_id === studentFilterCollegeId || t.collegeId === studentFilterCollegeId)
                            .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Filter Year</label>
                        <select
                          value={studentFilterYear}
                          onChange={(e) => setStudentFilterYear(e.target.value)}
                          className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                        >
                          <option value="">All Years</option>
                          <option value="1st Year">1st Year</option>
                          <option value="2nd Year">2nd Year</option>
                          <option value="3rd Year">3rd Year</option>
                          <option value="4th Year">4th Year</option>
                        </select>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b text-muted-foreground uppercase tracking-wider font-semibold">
                            <th className="py-3 px-2">Name</th>
                            <th>Roll Number</th>
                            <th>College / Dept</th>
                            <th>Year</th>
                            <th>Password</th>
                            <th>Status</th>
                            <th className="text-right py-3 px-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminStudents
                            .filter(student => {
                              if (studentFilterCollegeId && student.collegeId !== studentFilterCollegeId) return false;
                              if (studentFilterDeptId && student.departmentId !== studentFilterDeptId) return false;
                              if (studentFilterBatchId && student.batchId !== studentFilterBatchId) return false;
                              if (studentFilterTrainerId && (student.trainerId || student.trainer_id) !== studentFilterTrainerId) return false;
                              if (studentFilterYear && student.year !== studentFilterYear) return false;
                              return true;
                            })
                            .map(student => (
                            <tr key={student.id} className="border-b hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                              <td className="py-3.5 px-2">
                                <div className="font-bold">{student.fullName || student.full_name || 'N/A'}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{student.email}</div>
                              </td>
                              <td>{student.rollNumber || student.roll_number || 'N/A'}</td>
                              <td>
                                <div className="truncate max-w-[120px] font-semibold" title={student.college_name}>{student.college_name}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{student.department_name}</div>
                                <div className="mt-1 flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground">Batch:</span>
                                  <select
                                    value={student.batch_id || student.batchId || ''}
                                    onChange={(e) => updateStudentBatch(student.id, e.target.value)}
                                    className="text-[10px] p-0.5 border rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500"
                                  >
                                    <option value="">No Batch</option>
                                    {adminBatches
                                      .filter(b => b.college_id === student.college_id || b.collegeId === student.collegeId)
                                      .map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                      ))
                                    }
                                  </select>
                                </div>
                                <div className="mt-1 flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground">Trainer:</span>
                                  <select
                                    value={student.trainer_id || student.trainerId || ''}
                                    onChange={(e) => updateStudentTrainer(student.id, e.target.value)}
                                    className="text-[10px] p-0.5 border rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500"
                                  >
                                    <option value="">No Trainer</option>
                                    {adminTrainers
                                      .filter(t => t.college_id === student.college_id || t.collegeId === student.collegeId)
                                      .map(t => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.batch_name || 'General'})</option>
                                      ))
                                    }
                                  </select>
                                </div>
                              </td>
                              <td>{student.year}</td>
                              <td>
                                <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
                                  {student.raw_password || student.rawPassword || 'N/A'}
                                </code>
                              </td>
                              <td>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${student.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600'}`}>
                                  {student.status}
                                </span>
                              </td>
                              <td className="text-right py-3 px-2">
                                <button onClick={() => resetStudentPassword(student.id)} className="text-[10px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded mr-2 hover:bg-slate-200">Reset Pw</button>
                                <button onClick={() => deleteStudent(student.id)} className="text-rose-500 hover:text-rose-600 p-1.5"><Trash2 className="h-4 w-4" /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeAdminTab === 'trainers' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="flex border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 gap-4">
                    <h3 className="font-extrabold text-lg">Trainer Management</h3>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Create/Edit Trainer Form */}
                    <div className="lg:col-span-1 p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4 h-fit">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex justify-between items-center">
                        <span>{editingTrainerId ? 'Edit Trainer Details' : 'Onboard New Trainer'}</span>
                        {editingTrainerId && (
                          <button
                            type="button"
                            onClick={cancelEditTrainer}
                            className="text-[10px] font-bold text-amber-600 hover:underline"
                          >
                            Cancel Edit
                          </button>
                        )}
                      </h4>
                      <form onSubmit={createOrUpdateTrainer} className="space-y-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Trainer Name *</label>
                          <input
                            type="text"
                            value={trainerForm.name}
                            onChange={(e) => setTrainerForm({ ...trainerForm, name: e.target.value })}
                            placeholder="e.g. Dr. Sarah Connor"
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Email Address *</label>
                          <input
                            type="email"
                            value={trainerForm.email}
                            onChange={(e) => setTrainerForm({ ...trainerForm, email: e.target.value })}
                            placeholder="e.g. sarah.connor@clahan.com"
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Phone Number</label>
                          <input
                            type="text"
                            value={trainerForm.phone}
                            onChange={(e) => setTrainerForm({ ...trainerForm, phone: e.target.value })}
                            placeholder="e.g. +91 98765 43210"
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Area of Specialization</label>
                          <input
                            type="text"
                            value={trainerForm.specialization}
                            onChange={(e) => setTrainerForm({ ...trainerForm, specialization: e.target.value })}
                            placeholder="e.g. Machine Learning, Cloud Systems"
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Assign College</label>
                          <select
                            value={trainerForm.collegeId}
                            onChange={(e) => setTrainerForm({ ...trainerForm, collegeId: e.target.value, batchId: '' })}
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                          >
                            <option value="">No College Assigned</option>
                            {adminColleges.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Assign Batch</label>
                          <select
                            value={trainerForm.batchId}
                            onChange={(e) => setTrainerForm({ ...trainerForm, batchId: e.target.value })}
                            className="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 mt-1"
                            disabled={!trainerForm.collegeId}
                          >
                            <option value="">No Batch Assigned</option>
                            {adminBatches
                              .filter((b) => b.college_id === trainerForm.collegeId || b.collegeId === trainerForm.collegeId)
                              .map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow-md transition-colors"
                        >
                          {editingTrainerId ? 'Update Trainer' : 'Add Trainer'}
                        </button>
                      </form>
                    </div>

                    {/* Trainers List */}
                    <div className="lg:col-span-2 p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Onboarded Trainers</h4>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b text-muted-foreground uppercase tracking-wider font-semibold">
                              <th className="py-3 px-2">Name & Specialization</th>
                              <th>Contact</th>
                              <th>Assignment</th>
                              <th className="text-right py-3 px-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminTrainers.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                                  No trainers found in the system.
                                </td>
                              </tr>
                            ) : (
                              adminTrainers.map((trainer) => (
                                <tr key={trainer.id} className="border-b hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                                  <td className="py-3 px-2">
                                    <div className="font-bold text-slate-800 dark:text-slate-200">{trainer.name}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {trainer.specialization || 'General'}
                                    </div>
                                  </td>
                                  <td>
                                    <div>{trainer.email}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">{trainer.phone || 'N/A'}</div>
                                  </td>
                                  <td>
                                    <div className="font-semibold text-slate-700 dark:text-slate-300">
                                      {trainer.college_name || 'No College'}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {trainer.batch_name ? `Batch: ${trainer.batch_name}` : 'No Batch'}
                                    </div>
                                  </td>
                                  <td className="text-right py-3 px-2 space-x-2">
                                    <button
                                      onClick={() => startEditTrainer(trainer)}
                                      className="text-xs font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-indigo-600 dark:text-indigo-400"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => deleteTrainer(trainer.id)}
                                      className="text-rose-500 hover:text-rose-600 p-1"
                                      title="Delete Trainer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 inline" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeAdminTab === 'exams' && (
                <div className="space-y-6">
                  {/* Create Exam */}
                  <div id="exam-configuration-card" className={`p-6 rounded-2xl border-2 transition-all ${editingExamId ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/10' : 'border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950'} shadow-sm space-y-4`}>
                    <h3 className="font-extrabold text-base flex justify-between items-center">
                      <span>{editingExamId ? 'Reschedule & Reconfigure Exam' : 'Configure Exam & Settings'}</span>
                      {editingExamId && (
                        <button type="button" onClick={() => {
                          setEditingExamId(null);
                          setExamForm({
                            name: '', description: '', examType: 'mcq',
                            durationMinutes: 60, cutoffPercentage: 50, allowedAttempts: 1, scheduleDate: getLocalDatetimeString(),
                            windowOpenMinutes: 10,
                            collegeId: '', departmentId: '', departmentIds: [], batchId: '', trainerId: '', year: '1st Year'
                          });
                        }} className="text-xs font-bold text-amber-600 hover:underline">Cancel Edit</button>
                      )}
                    </h3>
                    <form onSubmit={editingExamId ? updateExam : createExam} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Exam Name</label>
                          <input type="text" value={examForm.name} onChange={e => setExamForm({...examForm, name: e.target.value})} placeholder="e.g. End Semester Exam" className="w-full p-3 border rounded-xl text-xs bg-transparent mt-1" required />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Exam Type</label>
                           <select value={examForm.examType} onChange={e => setExamForm({...examForm, examType: e.target.value as any})} className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 mt-1" required>
                            <option value="mcq" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">MCQ Only</option>
                            <option value="coding" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Coding Only</option>
                            <option value="both" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">MCQ + Coding</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Duration (Mins)</label>
                          <input type="number" value={examForm.durationMinutes} onChange={e => setExamForm({...examForm, durationMinutes: parseInt(e.target.value) || 60})} className="w-full p-3 border rounded-xl text-xs bg-transparent mt-1" required />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Cutoff %</label>
                          <input type="number" value={examForm.cutoffPercentage} onChange={e => setExamForm({...examForm, cutoffPercentage: parseInt(e.target.value) || 50})} className="w-full p-3 border rounded-xl text-xs bg-transparent mt-1" required />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Allowed Attempts</label>
                          <select value={examForm.allowedAttempts} onChange={e => setExamForm({...examForm, allowedAttempts: parseInt(e.target.value) || 1})} className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 mt-1">
                            <option value="1" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">1 Attempt</option>
                            <option value="2" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">2 Attempts</option>
                            <option value="3" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">3 Attempts</option>
                            <option value="999" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Unlimited</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">College Eligibility</label>
                          <select value={examForm.collegeId} onChange={e => { setExamForm({...examForm, collegeId: e.target.value, batchId: '', trainerId: ''}); fetchDepartments(e.target.value); fetchBatches(e.target.value); }} className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 mt-1" required>
                            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select College</option>
                            {adminColleges.map(c => <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Batch (Optional)</label>
                          <select 
                            value={examForm.batchId || ''} 
                            onChange={e => setExamForm({...examForm, batchId: e.target.value, trainerId: ''})} 
                            className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 mt-1"
                            disabled={!examForm.collegeId}
                          >
                            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">No Batch (Use Dept/Year below)</option>
                            {batches.map(b => <option key={b.id} value={b.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{b.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Trainer (Optional)</label>
                          <select 
                            value={examForm.trainerId || ''} 
                            onChange={e => setExamForm({...examForm, trainerId: e.target.value})} 
                            className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 mt-1"
                            disabled={!examForm.collegeId}
                          >
                            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Select Trainer</option>
                            {adminTrainers
                              .filter(t => {
                                const matchCollege = (t.college_id === examForm.collegeId || t.collegeId === examForm.collegeId);
                                if (!matchCollege) return false;
                                if (examForm.batchId) {
                                  return (t.batch_id === examForm.batchId || t.batchId === examForm.batchId);
                                }
                                return true;
                              })
                              .map(t => <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t.name} ({t.batch_name || 'General'})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Department Eligibility</label>
                          {!examForm.collegeId ? (
                            <div className="text-[10px] text-slate-400 italic p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/50 mt-1">
                              Select a college first
                            </div>
                          ) : examForm.batchId ? (
                            <div className="text-[10px] text-indigo-500 font-semibold italic p-3 border border-indigo-200 dark:border-indigo-850 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 mt-1">
                              Disabled (Batch Selected)
                            </div>
                          ) : departments.length === 0 ? (
                            <div className="text-[10px] text-slate-400 italic p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/50 mt-1">
                              No departments found
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 max-h-28 overflow-y-auto mt-1">
                              {departments.map(d => {
                                const isChecked = examForm.departmentIds?.includes(d.id);
                                return (
                                  <label key={d.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] cursor-pointer select-none transition-all ${isChecked ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400'}`}>
                                    <input 
                                      type="checkbox" 
                                      className="sr-only" 
                                      checked={isChecked || false}
                                      onChange={() => {
                                        const currentIds = examForm.departmentIds || [];
                                        const newIds = isChecked 
                                          ? currentIds.filter(id => id !== d.id)
                                          : [...currentIds, d.id];
                                        setExamForm({
                                          ...examForm, 
                                          departmentIds: newIds,
                                          departmentId: newIds[0] || ''
                                        });
                                      }}
                                    />
                                    {d.name}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Year Eligibility</label>
                          <select 
                            value={examForm.batchId ? '' : examForm.year} 
                            onChange={e => setExamForm({...examForm, year: e.target.value})} 
                            className="w-full p-3 border border-slate-200 dark:border-slate-850 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 mt-1" 
                            required={!examForm.batchId}
                            disabled={!!examForm.batchId}
                          >
                            {examForm.batchId ? (
                              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Disabled (Batch Selected)</option>
                            ) : (
                              <>
                                <option value="1st Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">1st Year</option>
                                <option value="2nd Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">2nd Year</option>
                                <option value="3rd Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">3rd Year</option>
                                <option value="4th Year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">4th Year</option>
                              </>
                            )}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Schedule Date & Time</label>
                          <input type="datetime-local" value={examForm.scheduleDate} onChange={e => setExamForm({...examForm, scheduleDate: e.target.value})} className="w-full p-2.5 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white mt-1" required />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Entry Window (Minutes)</label>
                          <input type="number" value={examForm.windowOpenMinutes} onChange={e => setExamForm({...examForm, windowOpenMinutes: parseInt(e.target.value) || 10})} className="w-full p-2.5 border rounded-xl text-xs bg-transparent mt-1" min={1} max={1440} placeholder="By default 10 mins" required />
                        </div>
                      </div>

                      <textarea value={examForm.description} onChange={e => setExamForm({...examForm, description: e.target.value})} placeholder="Exam instructions and general description..." rows={2} className="w-full p-3 border rounded-xl text-xs bg-transparent focus:outline-indigo-500" />
                      
                      <div className="flex items-center gap-2 p-1">
                        <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200 select-none">
                          <input 
                            type="checkbox" 
                            checked={examForm.enableFaceDetection !== false} 
                            onChange={e => setExamForm({...examForm, enableFaceDetection: e.target.checked})} 
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-900" 
                          />
                          Enable AI Face Detection (background checking for face absence/multiple people)
                        </label>
                      </div>

                      <button type="submit" className={`w-full py-3 ${editingExamId ? 'bg-amber-600 hover:bg-amber-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white font-bold rounded-xl text-xs transition-colors`}>
                        {editingExamId ? 'Save Configuration & Reschedule' : 'Configure & Create Exam'}
                      </button>
                    </form>
                  </div>

                  {/* Questions configuration is now managed in the dedicated full-screen Questions Editor page */}

                  {/* Exam wise Results Panel */}
                  {selectedExamIdForResults && (() => {
                    const passedStudentsCount = adminSelectedExamResults.filter(r => r.status !== 'terminated' && r.passed).length;
                    const failedStudentsCount = adminSelectedExamResults.filter(r => r.status === 'terminated' || !r.passed).length;
                    return (
                      <div className="p-6 rounded-2xl border-2 border-emerald-500/20 bg-emerald-500/5 space-y-6">
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="font-extrabold text-base text-emerald-700 dark:text-emerald-400">Exam Results & Scorecard Reports</h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Showing student attempts for: <span className="font-bold text-slate-800 dark:text-slate-100">{selectedExamNameForResults}</span></p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={downloadExamResultsCsv}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm transition-colors"
                            >
                              <Download className="h-3.5 w-3.5" /> Download CSV
                            </button>
                            <button
                              onClick={() => setSelectedExamIdForResults(null)}
                              className="text-xs font-bold text-muted-foreground hover:underline px-2 py-1"
                            >
                              Close Reports
                            </button>
                          </div>
                        </div>

                        {adminSelectedExamResults.length > 0 && (
                          <div className="grid grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                            <div className="text-center">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Attempts</span>
                              <p className="text-lg font-black text-slate-800 dark:text-slate-100">{adminSelectedExamResults.length}</p>
                            </div>
                            <div className="text-center border-x border-slate-100 dark:border-slate-800">
                              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Passed</span>
                              <p className="text-lg font-black text-emerald-650 dark:text-emerald-400">{passedStudentsCount}</p>
                            </div>
                            <div className="text-center">
                              <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">Failed</span>
                              <p className="text-lg font-black text-rose-650 dark:text-rose-400">{failedStudentsCount}</p>
                            </div>
                          </div>
                        )}

                        <div className="overflow-x-auto rounded-xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950">
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="border-b text-muted-foreground bg-slate-50/50 dark:bg-slate-900/50 uppercase tracking-wider font-semibold">
                                <th className="py-3 px-4">Student Info</th>
                                <th className="py-3 px-2">Roll Number</th>
                                <th className="py-3 px-2">Dept & Year</th>
                                <th className="py-3 px-2 text-center">Score</th>
                                <th className="py-3 px-2 text-center">Percentage</th>
                                <th className="py-3 px-4 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {adminSelectedExamResults.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="text-center py-8 text-muted-foreground italic">
                                    No student attempts found for this exam yet.
                                  </td>
                                </tr>
                              ) : (
                                adminSelectedExamResults.map(r => (
                                  <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                                    <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">{r.full_name || 'N/A'}</td>
                                    <td className="py-3.5 px-2 font-mono">{r.roll_number || 'N/A'}</td>
                                    <td className="py-3.5 px-2 text-muted-foreground">{r.department_name || 'N/A'} - {r.year || 'N/A'}</td>
                                    <td className="py-3.5 px-2 text-center font-bold">{r.score} pts</td>
                                    <td className="py-3.5 px-2 text-center font-black text-indigo-600 dark:text-indigo-400">{r.percentage}%</td>
                                    <td className="py-3.5 px-4 text-center">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        r.status === 'terminated'
                                          ? 'bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                          : r.passed 
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                      }`}>
                                        {r.status === 'terminated' ? 'Terminated' : r.passed ? 'Passed' : 'Failed'}
                                      </span>
                                      {r.status === 'terminated' && r.feedback && (
                                        <div className="mt-1.5 text-[9px] text-rose-600 dark:text-rose-400 font-semibold max-w-[200px] mx-auto leading-relaxed">
                                          {r.feedback}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* List of configured Exams */}
                  <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm">
                    <h3 className="font-extrabold text-base mb-4">Configured Exams</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b text-muted-foreground uppercase tracking-wider font-semibold">
                            <th className="py-3 px-2">Exam Info</th>
                            <th>Type</th>
                            <th>Duration / Cutoff</th>
                            <th>Eligibility</th>
                            <th>Status</th>
                            <th className="text-right py-3 px-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminExams.map(ex => (
                            <tr key={ex.id} className="border-b hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                              <td className="py-3.5 px-2">
                                <div className="font-bold">{ex.name}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">MCQs: {ex.mcq_count || 0} | Coding: {ex.coding_count || 0}</div>
                              </td>
                              <td className="uppercase font-semibold">{ex.exam_type}</td>
                              <td>{ex.duration_minutes} Mins / {ex.cutoff_percentage}%</td>
                              <td>
                                <div className="truncate max-w-[120px]" title={ex.college_name}>{ex.college_name}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{ex.batch_name ? `Batch: ${ex.batch_name}` : `${ex.department_name} - ${ex.year}`}</div>
                                {(ex.trainer_name || ex.trainerName) && (
                                  <div className="text-[9px] text-indigo-500 font-bold mt-0.5">Trainer: {ex.trainer_name || ex.trainerName}</div>
                                )}
                              </td>
                              <td>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ex.is_published ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>
                                  {ex.is_published ? 'Published' : 'Draft'}
                                </span>
                              </td>
                              <td className="text-right py-3 px-2 space-x-1 whitespace-nowrap">
                                <button onClick={() => { setSelectedExamIdForResults(null); loadAdminExamResults(ex.id, ex.name); }} className="text-[10px] font-bold px-2 py-1 border rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors">Results</button>
                                <button onClick={() => { setSelectedExamIdForQuestions(ex.id); loadAdminExamQuestions(ex.id); setCurrentPage('questions-editor'); }} className="text-[10px] font-bold px-2 py-1 border rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white transition-colors">Questions</button>
                                <button onClick={() => startEditingExam(ex)} className="text-[10px] font-bold px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded hover:bg-amber-500 hover:text-white transition-colors">Edit</button>
                                {!ex.is_published && <button onClick={() => publishExam(ex.id)} className="text-[10px] font-bold px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-500">Publish</button>}
                                <button onClick={() => duplicateExam(ex.id)} className="text-[10px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200">Duplicate</button>
                                <button onClick={() => deleteExam(ex.id)} className="text-rose-500 hover:text-rose-600 p-1"><Trash2 className="h-4 w-4 inline" /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeAdminTab === 'live' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
                        <span className="h-2.5 w-2.5 bg-rose-500 rounded-full animate-ping" />
                        AI Live Proctor Center
                      </h2>
                      <p className="text-sm text-muted-foreground">Monitor ongoing exams, violation warnings, and proctor feeds in real time.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setLiveSessions([]); setLiveAlerts([]); }}
                        className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-900 flex items-center gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Clear Feeds
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Active sessions list */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                        <div className="flex justify-between items-center border-b pb-3">
                          <h4 className="font-bold text-sm">Active Test Candidates ({liveSessions.length})</h4>
                          <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Auto-Updating</span>
                        </div>

                        {liveSessions.length === 0 ? (
                          <div className="p-12 text-center border rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-dashed">
                            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3 animate-pulse" />
                            <p className="font-bold">No active candidates right now</p>
                            <p className="text-xs text-muted-foreground mt-1">Once students join a proctored exam, they will appear here with live metrics.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {liveSessions.map((session) => (
                              <div
                                key={session.attemptId}
                                className={`p-4 rounded-xl border transition-all ${
                                  session.status === 'terminated'
                                    ? 'border-rose-500/30 bg-rose-500/5'
                                    : session.status === 'offline'
                                      ? 'border-slate-200 dark:border-slate-800 bg-slate-500/5'
                                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm'
                                }`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <h5 className="font-bold text-xs truncate max-w-[160px]">{session.studentName}</h5>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Roll: {session.rollNumber}</p>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                    session.status === 'active'
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : session.status === 'terminated'
                                        ? 'bg-rose-500/20 text-rose-600 dark:text-rose-450 border border-rose-500/30 animate-pulse'
                                        : 'bg-slate-100 dark:bg-slate-800 text-muted-foreground'
                                  }`}>
                                    {session.status}
                                  </span>
                                </div>

                                <div className="mt-3 py-1.5 px-2 bg-slate-50 dark:bg-slate-950 rounded-lg text-[10px] text-muted-foreground flex justify-between">
                                  <span>Exam: <strong className="text-slate-800 dark:text-slate-200">{session.examName}</strong></span>
                                  <span className="font-bold text-rose-600 dark:text-rose-400">{session.violationCount} Violations</span>
                                </div>

                                {/* Simulated camera stream thumbnail */}
                                <div className="relative mt-3 h-28 rounded-lg bg-slate-950 overflow-hidden flex items-center justify-center border border-slate-800">
                                  {session.status === 'active' ? (
                                    session.liveImage ? (
                                      <>
                                        <img src={session.liveImage} alt="Live feed" className="h-full w-full object-cover" />
                                        <span className="absolute bottom-2 left-2 flex items-center gap-1 text-[9px] bg-black/60 px-1.5 py-0.5 rounded text-emerald-400 font-bold">
                                          <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" /> LIVE FEED
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />
                                        <Video className="h-6 w-6 text-emerald-500/40 animate-pulse" />
                                        <span className="absolute bottom-2 left-2 flex items-center gap-1 text-[9px] bg-black/60 px-1.5 py-0.5 rounded text-emerald-400 font-bold">
                                          <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" /> LIVE FEED
                                        </span>
                                      </>
                                    )
                                  ) : session.status === 'terminated' ? (
                                    <>
                                      <div className="absolute inset-0 bg-rose-500/10" />
                                      <ShieldAlert className="h-6 w-6 text-rose-500/50" />
                                      <span className="absolute bottom-2 left-2 text-[9px] bg-rose-650 px-1.5 py-0.5 rounded text-white font-bold">
                                        TERMINATED
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <div className="absolute inset-0 bg-slate-900" />
                                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">OFFLINE / ENDED</span>
                                    </>
                                  )}
                                </div>

                                {/* Recent violations list */}
                                {session.recentViolations && session.recentViolations.length > 0 && (
                                  <div className="mt-3 space-y-1">
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Recent Alerts:</p>
                                    {session.recentViolations.slice(0, 3).map((v: any, vi: number) => (
                                      <div key={vi} className="flex justify-between items-center text-[9px] text-rose-600 dark:text-rose-450 bg-rose-500/5 p-1 rounded">
                                        <span className="truncate max-w-[130px]">{v.event_type.replace(/_/g, ' ')}</span>
                                        <span className="text-[8px] text-muted-foreground">{new Date(v.created_at).toLocaleTimeString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {session.status === 'active' && (
                                  <div className="mt-3 flex gap-2">
                                    <button
                                      onClick={() => {
                                        setWarningModal({ attemptId: session.attemptId, studentName: session.studentName });
                                        setWarningReason('');
                                      }}
                                      className="flex-1 py-1.5 px-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                    >
                                      <AlertTriangle className="h-3.5 w-3.5" /> Warn Student
                                    </button>
                                    <button
                                      onClick={() => {
                                        setTerminationModal({ attemptId: session.attemptId, studentName: session.studentName });
                                        setTerminationReason('');
                                      }}
                                      className="flex-1 py-1.5 px-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                    >
                                      <ShieldAlert className="h-3.5 w-3.5" /> Terminate
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Live alerts log */}
                    <div className="space-y-6">
                      <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                        <div className="flex justify-between items-center border-b pb-3">
                          <h4 className="font-bold text-sm">Security Log</h4>
                          <span className="h-2 w-2 bg-rose-500 rounded-full animate-ping" />
                        </div>

                        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                          {liveAlerts.length === 0 ? (
                            <div className="p-8 text-center text-xs text-muted-foreground">
                              No security incidents logged in this session.
                            </div>
                          ) : (
                            liveAlerts.map((alert, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-xl border text-[11px] space-y-1 ${
                                  alert.severity === 'critical' || alert.eventType === 'TERMINATED'
                                    ? 'border-rose-500/25 bg-rose-500/5 text-rose-800 dark:text-rose-300'
                                    : 'border-amber-500/20 bg-amber-500/5 text-amber-800 dark:text-amber-350'
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <strong className="uppercase text-[9px] tracking-wider font-bold">
                                    {alert.eventType.replace(/_/g, ' ')}
                                  </strong>
                                  <span className="text-[8px] opacity-70">{alert.timestamp}</span>
                                </div>
                                <p className="leading-tight">{alert.details}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeAdminTab === 'settings' && (
                <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-6">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">System Settings</h2>
                    <p className="text-sm text-muted-foreground">Configure SMTP mail server parameters and branding options.</p>
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); showToast('Settings saved successfully!'); }} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">Company Name</label>
                        <input type="text" value={companySettings.companyName} onChange={e => setCompanySettings({...companySettings, companyName: e.target.value})} className="w-full p-3.5 mt-1 border rounded-xl text-xs bg-transparent" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">Contact Email</label>
                        <input type="email" value={companySettings.contactEmail} onChange={e => setCompanySettings({...companySettings, contactEmail: e.target.value})} className="w-full p-3.5 mt-1 border rounded-xl text-xs bg-transparent" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">SMTP Host</label>
                        <input type="text" value={companySettings.smtpHost} onChange={e => setCompanySettings({...companySettings, smtpHost: e.target.value})} className="w-full p-3.5 mt-1 border rounded-xl text-xs bg-transparent" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">SMTP Port</label>
                        <input type="text" value={companySettings.smtpPort} onChange={e => setCompanySettings({...companySettings, smtpPort: e.target.value})} className="w-full p-3.5 mt-1 border rounded-xl text-xs bg-transparent" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">SMTP User</label>
                        <input type="text" value={companySettings.smtpUser} onChange={e => setCompanySettings({...companySettings, smtpUser: e.target.value})} className="w-full p-3.5 mt-1 border rounded-xl text-xs bg-transparent" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">Footer Copyright details</label>
                      <input type="text" value={companySettings.footerText} onChange={e => setCompanySettings({...companySettings, footerText: e.target.value})} className="w-full p-3.5 mt-1 border rounded-xl text-xs bg-transparent" />
                    </div>

                    <button type="submit" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-md transition-colors">
                      Save Settings Configuration
                    </button>
                  </form>
                </div>
              )}

            </div>
          </div>
        </main>
      )}

      {/* DEDICATED FULL-PAGE QUESTIONS EDITOR PAGE */}
      {currentPage === 'questions-editor' && selectedExamIdForQuestions && (
        <main className="max-w-7xl mx-auto py-10 px-4">
          <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900/50 backdrop-blur-md p-6 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-lg">
            <div>
              <button 
                onClick={() => {
                  setSelectedExamIdForQuestions(null);
                  setCurrentPage('admin-dash');
                }}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors mb-2"
              >
                &larr; Back to Admin Dashboard
              </button>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
                <BookOpen className="h-6 w-6 text-indigo-600" />
                Exam Questions Manager
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Configure, create, and bulk-import test scenarios for exam: <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{adminExams.find(ex => ex.id === selectedExamIdForQuestions)?.name || 'Selected Exam'}</span>
              </p>
            </div>
            
            <div className="flex gap-4">
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-950 rounded-2xl text-center min-w-[100px]">
                <div className="text-lg font-black text-indigo-600 dark:text-indigo-400">{adminSelectedExamMCQs.length}</div>
                <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">Total MCQs</div>
              </div>
              <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-950 rounded-2xl text-center min-w-[100px]">
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{adminSelectedExamCodings.length}</div>
                <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">Coding Challenges</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Side: Question Creator Forms */}
            <div className="lg:col-span-7 space-y-6">
              {/* Tab selector */}
              <div className="flex gap-1.5 p-1 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 w-full md:w-fit shadow-sm">
                <button
                  onClick={() => setQuestionEditorTab('mcq')}
                  className={`flex-1 md:flex-initial px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${questionEditorTab === 'mcq' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-muted-foreground hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-foreground'}`}
                >
                  Multiple Choice Questions (MCQ)
                </button>
                <button
                  onClick={() => setQuestionEditorTab('coding')}
                  className={`flex-1 md:flex-initial px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${questionEditorTab === 'coding' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-muted-foreground hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-foreground'}`}
                >
                  Coding Challenges
                </button>
              </div>

              {questionEditorTab === 'mcq' ? (
                <div className="bg-white dark:bg-slate-950 p-6 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-md space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Add MCQ Question</h3>
                    <p className="text-[11px] text-muted-foreground">Add multiple choice questions manually or use CSV import below.</p>
                  </div>

                  <form onSubmit={addMcqQuestion} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground">Question Statement</label>
                      <textarea 
                        value={mcqForm.question} 
                        onChange={e => setMcqForm({...mcqForm, question: e.target.value})} 
                        placeholder="What is the output of print(type(1/2)) in Python 3?" 
                        rows={3} 
                        className="w-full p-3.5 mt-1 border rounded-xl text-xs bg-transparent focus:outline-indigo-500 text-slate-900 dark:text-white" 
                        required 
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground">Option A</label>
                        <input type="text" value={mcqForm.optionA} onChange={e => setMcqForm({...mcqForm, optionA: e.target.value})} placeholder="Option A" className="w-full p-3 mt-1 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white" required />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground">Option B</label>
                        <input type="text" value={mcqForm.optionB} onChange={e => setMcqForm({...mcqForm, optionB: e.target.value})} placeholder="Option B" className="w-full p-3 mt-1 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white" required />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground">Option C</label>
                        <input type="text" value={mcqForm.optionC} onChange={e => setMcqForm({...mcqForm, optionC: e.target.value})} placeholder="Option C" className="w-full p-3 mt-1 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white" required />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground">Option D</label>
                        <input type="text" value={mcqForm.optionD} onChange={e => setMcqForm({...mcqForm, optionD: e.target.value})} placeholder="Option D" className="w-full p-3 mt-1 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white" required />
                      </div>
                    </div>

                     <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground">Correct Option</label>
                        <select value={mcqForm.correctAnswer} onChange={e => setMcqForm({...mcqForm, correctAnswer: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" required>
                          <option value="A" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Option A</option>
                          <option value="B" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Option B</option>
                          <option value="C" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Option C</option>
                          <option value="D" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Option D</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground">Question Marks</label>
                        <input type="number" value={mcqForm.marks} onChange={e => setMcqForm({...mcqForm, marks: parseInt(e.target.value) || 1})} placeholder="Marks" className="w-full p-3 mt-1 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white" required />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground">Difficulty Level</label>
                        <select value={mcqForm.difficulty} onChange={e => setMcqForm({...mcqForm, difficulty: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" required>
                          <option value="easy" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Easy</option>
                          <option value="medium" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Medium</option>
                          <option value="hard" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Hard</option>
                        </select>
                      </div>
                    </div>

                    <button type="submit" className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors flex justify-center items-center gap-2">
                      <Plus className="h-4 w-4" /> Save MCQ Question
                    </button>
                  </form>

                  <div className="border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Bulk Import via CSV</h4>
                        <p className="text-[10px] text-muted-foreground">Add multiple questions at once using a formatted CSV file.</p>
                      </div>
                      <button
                        type="button"
                        onClick={downloadMcqTemplate}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-500 hover:underline flex items-center gap-1"
                      >
                        <Download className="h-3.5 w-3.5" /> Download Template
                      </button>
                    </div>
                    
                    <form onSubmit={importMcqCsv} className="space-y-4">
                      <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-6 text-center hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors relative cursor-pointer">
                        <label className="cursor-pointer block">
                          <span className="text-sm text-indigo-600 dark:text-indigo-400 font-extrabold block">📂 Choose CSV / Excel File</span>
                          <span className="text-xs text-muted-foreground block mt-1">
                            {selectedMcqFileName 
                              ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Selected: {selectedMcqFileName}</span>
                              : 'Select a valid .csv, .xlsx, or .xls template'
                            }
                          </span>
                          <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleMcqFileChange}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground">Or Paste CSV Content</label>
                        <textarea
                          value={mcqCsvInput}
                          onChange={e => setMcqCsvInput(e.target.value)}
                          placeholder="Header: Question,Option A,Option B,Option C,Option D,Correct Answer,Marks,Difficulty"
                          rows={4}
                          className="w-full p-3 border rounded-xl text-xs bg-transparent font-mono focus:outline-indigo-500 text-slate-900 dark:text-white"
                          required
                        />
                      </div>
                      <button type="submit" className="w-full py-3 border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white font-extrabold rounded-xl text-xs transition-all">
                        Import MCQ CSV Data
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-950 p-8 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-md space-y-6 flex flex-col items-center text-center">
                  <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 mb-2">
                    <Code className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Coding Challenge Studio</h3>
                    <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
                      Configure complex technical coding assessments. You can define test cases, target language templates, memory/time limits, and enable automated code grading.
                    </p>
                  </div>
                  
                  <button 
                    type="button"
                    onClick={() => setIsCodingModalOpen(true)}
                    className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-xs transition-all shadow-md shadow-indigo-500/10 flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" /> Open Coding Studio
                  </button>

                  <div className="w-full border-t border-slate-200/40 dark:border-slate-800/40 pt-6 text-left space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Quick Guide:</h4>
                    <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4 leading-relaxed">
                      <li>Use standard system inputs/outputs in your test cases.</li>
                      <li>Define at least one visible test case for candidates to verify syntax.</li>
                      <li>Use the starter template code editor to offer baseline code structures.</li>
                      <li>Custom time limits are defined in milliseconds (default: 2000ms).</li>
                    </ul>
                  </div>
                </div>
              )}

              {isCodingModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-white dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/50 rounded-3xl w-full max-w-4xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-start border-b border-slate-200/40 dark:border-slate-800/40 pb-4">
                      <div>
                        <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <Code className="h-5 w-5 text-indigo-600" />
                          Coding Challenge Studio
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">Configure challenge parameters, custom starter templates, and expected test outputs.</p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setIsCodingModalOpen(false)}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-muted-foreground hover:text-foreground transition-all"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <form onSubmit={async (e) => {
                      await addCodingQuestion(e);
                      setIsCodingModalOpen(false);
                    }} className="space-y-6">
                      {/* AI QUESTION GENERATOR BOX */}
                      <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/30 dark:from-indigo-950/20 dark:to-slate-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-950/50 space-y-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400 animate-pulse" />
                          <h4 className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">AI Challenge Auto-Generator</h4>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-relaxed max-w-2xl">
                          Type a high-level topic (e.g., "Check prime number", "Fibonacci sequence", "Verify BST", "Find array duplicates"). 
                          The AI will automatically write the title, detailed markdown description, boilerplate code template, and test cases!
                        </p>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="e.g. Check if a number is prime" 
                            id="ai-topic-input"
                            className="flex-1 p-2.5 border rounded-xl text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-indigo-500" 
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const inputEl = document.getElementById('ai-topic-input') as HTMLInputElement;
                              const topic = inputEl?.value?.trim();
                              if (!topic) return showToast('Please enter a topic first', 'error');
                              
                              showToast('Generating question using AI...', 'info');
                              try {
                                const response = await fetch('/api/exams/admin/generate-coding-question', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                  },
                                  body: JSON.stringify({
                                    topic,
                                    difficulty: codingForm.difficulty,
                                    language: codingForm.language
                                  })
                                });
                                if (response.ok) {
                                  const qData = await response.json();
                                  setCodingForm(prev => ({
                                    ...prev,
                                    title: qData.title || prev.title,
                                    description: qData.description || prev.description,
                                    starterCode: qData.starter_code || prev.starterCode
                                  }));
                                  if (qData.test_cases && Array.isArray(qData.test_cases)) {
                                    setCodingTestCases(qData.test_cases.map((tc: any) => ({
                                      input: tc.input || '',
                                      expected_output: tc.expected_output || '',
                                      isHidden: tc.is_hidden || false
                                    })));
                                  }
                                  showToast('Question details loaded into the editor below!', 'success');
                                } else {
                                  const errData = await response.json();
                                  showToast(errData.error || 'AI Generation failed', 'error');
                                }
                              } catch (err: any) {
                                showToast(`Error generating question: ${err.message}`, 'error');
                              }
                            }}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
                          >
                            <Sparkles className="h-4 w-4" /> Auto-Generate
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-muted-foreground">Challenge Title</label>
                          <input 
                            type="text" 
                            value={codingForm.title} 
                            onChange={e => setCodingForm({...codingForm, title: e.target.value})} 
                            placeholder="Fibonacci Sequence Generator" 
                            className="w-full p-3 mt-1 border rounded-xl text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-indigo-500" 
                            required 
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground">Target Language</label>
                          <select 
                            value={codingForm.language} 
                            onChange={e => {
                              const lang = e.target.value;
                              const starterTemplates: Record<string, string> = {
                                'Python': 'def solve(input_val):\n    # Write your code here\n    pass',
                                'Java': 'import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your code here\n    }\n}',
                                'C++': '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your code here\n    return 0;\n}',
                                'JavaScript': 'function solve(inputVal) {\n    // Write your code here\n    return null;\n}'
                              };
                              setCodingForm({
                                ...codingForm,
                                language: lang,
                                starterCode: starterTemplates[lang] || ''
                              });
                            }} 
                            className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" 
                            required
                          >
                            <option value="Python">Python</option>
                            <option value="Java">Java</option>
                            <option value="C++">C++</option>
                            <option value="JavaScript">JavaScript</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-bold text-muted-foreground">Marks</label>
                          <input type="number" value={codingForm.marks} onChange={e => setCodingForm({...codingForm, marks: parseInt(e.target.value) || 10})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" required />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground">Time Limit (ms)</label>
                          <input type="number" value={codingForm.timeLimit} onChange={e => setCodingForm({...codingForm, timeLimit: parseInt(e.target.value) || 2000})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" required />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground">Memory Limit (KB)</label>
                          <input type="number" value={codingForm.memoryLimit} onChange={e => setCodingForm({...codingForm, memoryLimit: parseInt(e.target.value) || 512000})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" required />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-muted-foreground">Challenge Description & Examples</label>
                        <textarea 
                          value={codingForm.description} 
                          onChange={e => setCodingForm({...codingForm, description: e.target.value})} 
                          placeholder="Write clear instructions for the student, detailing inputs, outputs, constraints, and test scenarios..." 
                          rows={4} 
                          className="w-full p-3.5 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-indigo-500" 
                          required 
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-muted-foreground">Starter template code (Reflected automatically on changing language)</label>
                        <textarea 
                          value={codingForm.starterCode} 
                          onChange={e => setCodingForm({...codingForm, starterCode: e.target.value})} 
                          placeholder="Code shown to students at the beginning of the test..." 
                          rows={5} 
                          className="w-full p-3.5 mt-1 border rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 font-mono focus:outline-indigo-500" 
                        />
                      </div>
                      
                      {/* Test cases selection */}
                      <div className="border-t border-slate-200/50 dark:border-slate-800/50 pt-4">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">Evaluation Test Cases</h4>
                            <p className="text-[10px] text-muted-foreground">Minimum 1 testcase is required for automated evaluation.</p>
                          </div>
                          <button 
                            type="button" 
                            onClick={addTestCaseInput} 
                            className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-1 transition-all"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Case
                          </button>
                        </div>
                        
                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                          {codingTestCases.map((tc, idx) => (
                            <div key={idx} className="flex flex-col md:flex-row gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/50 dark:border-slate-800/50 items-end">
                              <div className="flex-1 w-full">
                                <label className="text-[10px] font-bold text-muted-foreground block mb-1">Standard Input</label>
                                <input 
                                  type="text" 
                                  placeholder="Input" 
                                  value={tc.input} 
                                  onChange={e => {
                                    const updated = [...codingTestCases];
                                    updated[idx].input = e.target.value;
                                    setCodingTestCases(updated);
                                  }} 
                                  className="w-full p-2 border rounded-lg text-xs bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white" 
                                  required 
                                />
                              </div>
                              <div className="flex-1 w-full">
                                <label className="text-[10px] font-bold text-muted-foreground block mb-1">Expected Output</label>
                                <input 
                                  type="text" 
                                  placeholder="Output" 
                                  value={tc.expected_output} 
                                  onChange={e => {
                                    const updated = [...codingTestCases];
                                    updated[idx].expected_output = e.target.value;
                                    setCodingTestCases(updated);
                                  }} 
                                  className="w-full p-2 border rounded-lg text-xs bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white" 
                                  required 
                                />
                              </div>
                              <div className="w-full md:w-32">
                                <label className="text-[10px] font-bold text-muted-foreground block mb-1">Visibility</label>
                                <select 
                                  value={tc.isHidden ? 'true' : 'false'} 
                                  onChange={e => {
                                    const updated = [...codingTestCases];
                                    updated[idx].isHidden = e.target.value === 'true';
                                    setCodingTestCases(updated);
                                  }} 
                                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                                >
                                  <option value="false">Visible</option>
                                  <option value="true">Hidden</option>
                                </select>
                              </div>
                              <button 
                                type="button" 
                                onClick={() => {
                                  setCodingTestCases(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="p-2.5 rounded-lg border border-rose-200 dark:border-rose-950 hover:bg-rose-500 hover:text-white text-rose-500 transition-all flex items-center justify-center shrink-0 w-full md:w-auto"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-3 justify-end border-t border-slate-200/45 dark:border-slate-800/45 pt-4 mt-6">
                        <button 
                          type="button"
                          onClick={() => setIsCodingModalOpen(false)}
                          className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all"
                        >
                          Cancel
                        </button>
                        <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-2">
                          <Plus className="h-4 w-4" /> Save Coding Question
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>

            {/* Right Side: Configured Questions List (Interactive & beautifully styled) */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-950 p-6 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-md space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  Configured Questions
                  <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                    {adminSelectedExamMCQs.length + adminSelectedExamCodings.length} Total
                  </span>
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Manage existing questions that will appear in the exam test environment.</p>
              </div>

              <div className="space-y-6 max-h-[680px] overflow-y-auto pr-1">
                {adminSelectedExamMCQs.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-200/40 dark:border-slate-800/40 pb-2">
                      <h4 className="font-extrabold text-xs text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">MCQ List ({adminSelectedExamMCQs.length})</h4>
                    </div>
                    <div className="space-y-3">
                      {adminSelectedExamMCQs.map((q, idx) => (
                        <div key={q.id || idx} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs text-left shadow-sm group relative">
                          <div className="font-bold text-slate-800 dark:text-slate-100 pr-6">{idx + 1}. {q.question}</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5 text-[11px] text-muted-foreground border-t border-slate-200/20 dark:border-slate-800/20 pt-2">
                            <div>A: {q.option_a || (q as any).optionA}</div>
                            <div>B: {q.option_b || (q as any).optionB}</div>
                            <div>C: {q.option_c || (q as any).optionC}</div>
                            <div>D: {q.option_d || (q as any).optionD}</div>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-slate-200/20 dark:border-slate-800/20">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[9px]">Correct: {q.correct_answer || (q as any).correctAnswer}</span>
                            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-[9px]">{q.marks} Marks</span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-[9px] capitalize">{q.difficulty}</span>
                            
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this MCQ question?')) {
                                  setAdminSelectedExamMCQs(prev => prev.filter(item => item.id !== q.id));
                                  setAdminExams(prev => prev.map(ex => ex.id === selectedExamIdForQuestions ? { ...ex, mcq_count: Math.max(0, (ex.mcq_count || 1) - 1) } : ex));
                                  showToast('MCQ Question deleted (Simulated)');
                                }
                              }}
                              className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-600 hover:scale-105 transition-all p-1"
                              title="Delete Question"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {adminSelectedExamCodings.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-200/40 dark:border-slate-800/40 pb-2">
                      <h4 className="font-extrabold text-xs text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">Coding List ({adminSelectedExamCodings.length})</h4>
                    </div>
                    <div className="space-y-3">
                      {adminSelectedExamCodings.map((q, idx) => (
                        <div key={q.id || idx} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs text-left shadow-sm group relative">
                          <div className="font-bold text-slate-800 dark:text-slate-100 pr-6">{idx + 1}. {q.title} ({q.language})</div>
                          <div className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap font-mono line-clamp-3 bg-white dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200/40 dark:border-slate-800/40">{q.description}</div>
                          
                          {(q as any).testCases && (q as any).testCases.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Evaluation Test Cases</span>
                              <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                                {(q as any).testCases.map((tc: any, tcIdx: number) => (
                                  <div key={tc.id || tcIdx} className="p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200/30 dark:border-slate-800/30 text-[10px] flex items-center justify-between font-mono">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400">In:</span>
                                      <span className="font-bold text-slate-800 dark:text-slate-200">{tc.input}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400">Out:</span>
                                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{tc.expected_output || tc.expectedOutput}</span>
                                    </div>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider ${tc.is_hidden || tc.isHidden ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'}`}>
                                      {tc.is_hidden || tc.isHidden ? 'Hidden' : 'Visible'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-slate-200/20 dark:border-slate-800/20">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-[9px]">{q.marks} Marks</span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-[9px] capitalize">{q.difficulty}</span>
                            
                            <button
                              type="button"
                              onClick={() => {
                                  if (confirm('Are you sure you want to delete this coding question?')) {
                                    setAdminSelectedExamCodings(prev => prev.filter(item => item.id !== q.id));
                                    setAdminExams(prev => prev.map(ex => ex.id === selectedExamIdForQuestions ? { ...ex, coding_count: Math.max(0, (ex.coding_count || 1) - 1) } : ex));
                                    showToast('Coding Question deleted (Simulated)');
                                  }
                              }}
                              className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-600 hover:scale-105 transition-all p-1"
                              title="Delete Question"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {adminSelectedExamMCQs.length === 0 && adminSelectedExamCodings.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-xs italic bg-slate-50 dark:bg-slate-900/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-850">
                    No questions configured for this exam yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* EXAM ENVIRONMENT ROUTE (STRICT PROCTOR MODE) */}
      {currentPage === 'exam-env' && currentExam && (
        <main className="fixed inset-0 z-50 bg-slate-900 text-white overflow-y-auto p-4 md:p-8 flex flex-col justify-between">
          {validationStep === 'instructions' && (
            <div className="max-w-2xl mx-auto my-auto p-8 rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl space-y-6">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <Shield className="h-8 w-8 text-indigo-400 animate-pulse" />
                <div>
                  <h2 className="text-xl font-extrabold">{currentExam.name}</h2>
                  <p className="text-xs text-indigo-300 mt-0.5">Secure AI-Proctoring Environment</p>
                </div>
              </div>
              <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
                <p className="font-bold text-white">Before starting the exam, please review the rules carefully:</p>
                <ul className="space-y-2 list-disc list-inside text-xs">
                  <li><strong>Camera & Mic Access:</strong> Webcam and microphone must remain enabled throughout the test.</li>
                  <li><strong>Tab lock:</strong> Do not navigate away or switch tabs. Doing so twice terminates the attempt.</li>
                  <li><strong>Object detection:</strong> Do not use books, cell phones, or study notes. AI monitors your frame.</li>
                  <li><strong>Fullscreen restriction:</strong> Leaving fullscreen triggers an immediate fraud warning.</li>
                </ul>
              </div>
              <button
                onClick={requestHardwarePermissions}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 font-bold rounded-2xl shadow-lg transition-all text-sm uppercase tracking-wide"
              >
                Validate Hardware & Permissions
              </button>
            </div>
          )}

          {validationStep === 'validation' && (
            <div className="max-w-xl mx-auto my-auto p-8 rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl text-center space-y-6">
              <h3 className="font-extrabold text-lg">Hardware Handshake Verification</h3>
              <div className="h-44 w-60 mx-auto rounded-2xl overflow-hidden bg-slate-900 border border-white/10 relative flex items-center justify-center">
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
                {!cameraPermission && <Video className="h-8 w-8 text-white/40 animate-pulse" />}
              </div>

              <div className="space-y-3 text-left max-w-sm mx-auto text-xs">
                <div className="flex justify-between items-center border-b border-white/5 py-2">
                  <span>Webcam Access</span>
                  <span className={cameraPermission ? 'text-emerald-400 font-bold' : 'text-slate-500 animate-pulse'}>{cameraPermission ? 'Connected' : 'Verifying...'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 py-2">
                  <span>Microphone Access</span>
                  <span className={micPermission ? 'text-emerald-400 font-bold' : 'text-slate-500 animate-pulse'}>{micPermission ? 'Connected' : 'Verifying...'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 py-2">
                  <span>Face detection (InsightFace)</span>
                  <span className={faceCheck ? 'text-emerald-400 font-bold' : 'text-slate-500 animate-pulse'}>{faceCheck ? 'Face Verified' : 'Checking Face...'}</span>
                </div>
              </div>

              {hardwareProgress === 100 && (
                <div className="space-y-4 pt-4">
                  <button onClick={enterFullscreen} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold uppercase tracking-wider">
                    Enter Fullscreen Mode
                  </button>
                  {fullscreenCheck && (
                    <button onClick={startExamAttempt} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm uppercase">
                      Start Proctored Exam
                    </button>
                  )}
                </div>
              )}

              {hardwareProgress === 75 && !faceCheck && (
                <div className="pt-4">
                  <button
                    onClick={() => {
                      setHardwareProgress(80);
                      verifyFacePeriodically(0);
                    }}
                    className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-sm uppercase"
                  >
                    Retry Face Verification
                  </button>
                </div>
              )}
            </div>
          )}

          {validationStep === 'active' && currentAttempt && (
            <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
              
              {/* STICKY EXAM HEADER */}
              <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/10 bg-slate-900/95 backdrop-blur-md z-40 relative">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <div>
                    <h3 className="font-extrabold text-sm tracking-tight text-white uppercase">{currentExam?.name || 'Clahan Assessment'}</h3>
                    <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">Section: {selectedSection === 'mcq' ? 'Multiple Choice Questions' : 'Coding Challenge'}</p>
                  </div>
                </div>

                {/* Metrics Badges */}
                <div className="hidden md:flex items-center gap-4 text-[10px] font-bold">
                  <span className="bg-slate-950 border border-white/5 px-2.5 py-1 rounded-lg text-slate-450 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-indigo-400" />
                    Proctored Session
                  </span>
                  
                  {/* Camera Status Badge */}
                  <span className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${cameraStream ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                    <Video className="h-3.5 w-3.5" />
                    Camera: {cameraStream ? 'Active' : 'Disabled'}
                  </span>

                  {/* Dev Debug Panel Toggle Badge */}
                  <button
                    onClick={() => setShowDebugPanel(!showDebugPanel)}
                    className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all text-[10px] font-bold ${
                      showDebugPanel 
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                        : 'bg-slate-950 border-white/5 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Cpu className="h-3.5 w-3.5" />
                    Debug Panel
                  </button>

                  {/* Tab warning lock status */}
                  <span className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${tabWarnings > 0 ? 'bg-rose-500/10 border-rose-500/20 text-rose-450' : 'bg-slate-950 border-white/5 text-slate-405'}`}>
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Tab Switches: {tabWarnings}/2 Warnings
                  </span>

                  {/* Connection Status */}
                  <span className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${isOnline ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500 animate-ping'}`}></span>
                    {isOnline ? 'Connected' : 'Offline'}
                  </span>

                  {/* Auto-Save Indicator */}
                  {autoSaveStatus && (
                    <span className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all ${
                      autoSaveStatus === 'saving' 
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                        : autoSaveStatus === 'saved' 
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}>
                      {autoSaveStatus === 'saving' ? 'Saving draft...' : autoSaveStatus === 'saved' ? 'Draft saved' : 'Save Error'}
                    </span>
                  )}
                </div>

                {/* Right side controls: Video PIP, Timer, and Submit */}
                <div className="flex items-center gap-4">
                  {/* Small Camera PIP */}
                  <div className="h-10 w-14 rounded-lg bg-slate-950 border border-white/10 overflow-hidden relative shadow-lg">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="h-full w-full object-cover" 
                    />
                    <div className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 border border-slate-950 animate-pulse"></div>
                  </div>

                  {/* Timer display */}
                  <div className="text-right">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Time Remaining</p>
                    <p className={`font-mono font-black text-base tracking-wide ${timeLeft < 300 ? 'text-rose-505 animate-pulse' : 'text-indigo-400'}`}>
                      {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </p>
                  </div>

                  {/* Submission Button */}
                  <button
                    onClick={() => {
                      if (isExamLocked) return;
                      if (timeLeft > 0) {
                        showToast("You cannot submit early. Please wait for the exam time to complete.", "warning");
                        return;
                      }
                      submitEntireExam();
                    }}
                    disabled={timeLeft > 0 || isExamLocked}
                    className={`px-5 py-2.5 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all border ${
                      (timeLeft > 0 || isExamLocked)
                        ? 'bg-slate-800/40 cursor-not-allowed text-slate-500 border-white/5' 
                        : 'bg-rose-600 hover:bg-rose-500 border-rose-500/30 shadow-lg shadow-rose-600/25'
                    }`}
                    title={timeLeft > 0 ? "Submit is locked until timer runs out" : "Submit Exam"}
                  >
                    {timeLeft > 0 ? "Submit Locked" : "Submit Exam"}
                  </button>
                </div>
              </header>

              {/* Developer Debug Panel */}
              {showDebugPanel && (
                <div className="absolute top-16 right-6 w-80 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl z-50 text-xs font-semibold text-slate-350 space-y-4 font-mono">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 animate-pulse" />
                      Developer Debug Panel
                    </span>
                    <button 
                      onClick={() => setShowDebugPanel(false)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Camera Connected</span>
                      <span className={cameraConnected ? 'text-emerald-400 font-bold' : 'text-rose-455 font-bold'}>
                        {cameraConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Stream Active</span>
                      <span className={cameraStreamActive ? 'text-emerald-400 font-bold' : 'text-rose-455 font-bold'}>
                        {cameraStreamActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Face Detected</span>
                      <span className={faceDetected ? 'text-emerald-400 font-bold' : 'text-rose-455 font-bold'}>
                        {faceDetected ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Confidence</span>
                      <span className="text-white font-bold">
                        {(faceConfidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Face Count</span>
                      <span className="text-white font-bold">
                        {faceCount}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Tracking Active</span>
                      <span className={faceTrackingActive ? 'text-emerald-400 font-bold' : 'text-rose-455 font-bold'}>
                        {faceTrackingActive ? 'Active' : 'Lost'}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">No Face Timer</span>
                      <span className={`font-bold ${noFaceTimer > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
                        {noFaceTimer.toFixed(1)}s
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Detection Source</span>
                      <span className="text-indigo-400 font-bold">
                        {detectionSource}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5 col-span-2">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Last Face Seen</span>
                      <span className="text-white">{lastFaceSeen}</span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5 col-span-2">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Active Fraud State</span>
                      <span className={`font-bold ${activeFraudState === 'Normal' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {activeFraudState}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-white/5 col-span-2">
                      <span className="text-slate-500 block uppercase tracking-wider text-[8px]">Detection FPS</span>
                      <span className="text-indigo-400">{detectionFps} FPS</span>
                    </div>
                  </div>
                  <div className="space-y-1 bg-slate-950 p-2.5 rounded-lg border border-white/5">
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] block mb-1">State Transition Logs</span>
                    <div className="h-24 overflow-y-auto text-[8px] space-y-1 scrollbar-thin text-slate-400">
                      {debugLogs.map((log, i) => (
                        <div key={i} className="flex gap-1.5">
                          <span className="text-indigo-400/80">[{log.time}]</span>
                          <span>{log.event}</span>
                        </div>
                      ))}
                      {debugLogs.length === 0 && <div className="text-slate-650">No events logged yet.</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* MAIN CONTENT AREA */}
              <div className="flex-1 flex flex-row overflow-hidden w-full relative">
                
                {/* 1. LEFT SIDEBAR: QUESTION NAVIGATOR */}
                <aside 
                  style={{ width: isSidebarCollapsed ? '60px' : '240px' }} 
                  className="flex-shrink-0 bg-slate-900 border-r border-white/10 flex flex-col justify-between transition-all duration-300 relative z-30"
                >
                  <div className="flex flex-col h-full overflow-hidden">
                    {/* Collapse Header */}
                    <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
                      {!isSidebarCollapsed && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Navigator</span>}
                      <button 
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors ml-auto"
                        title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                      >
                        {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Section Switcher */}
                    {!isSidebarCollapsed ? (
                      <div className="p-3 space-y-1.5 border-b border-white/5 bg-slate-950/20">
                        {(currentExam?.exam_type !== 'coding' || examMCQs.length > 0) && (
                          <button
                            onClick={() => { if (!isExamLocked) { setSelectedSection('mcq'); setActiveQuestionIndex(0); } }}
                            disabled={isExamLocked}
                            className={`w-full py-2 px-2.5 text-left rounded-lg transition-all border flex items-center justify-between ${
                              selectedSection === 'mcq' 
                                ? 'bg-indigo-600/20 text-indigo-405 border-indigo-500/30 font-bold' 
                                : 'bg-slate-905 border-white/5 text-slate-400 hover:bg-slate-800 text-xs'
                            } ${isExamLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span className="text-xs font-semibold flex items-center gap-1.5">
                              <BookOpen className="h-3.5 w-3.5" />
                              Section A: MCQs
                            </span>
                          </button>
                        )}
                        {(currentExam?.exam_type !== 'mcq' || examCodings.length > 0) && (
                          <button
                            onClick={() => { if (!isExamLocked) { setSelectedSection('coding'); setActiveQuestionIndex(0); } }}
                            disabled={isExamLocked}
                            className={`w-full py-2 px-2.5 text-left rounded-lg transition-all border flex items-center justify-between ${
                              selectedSection === 'coding' 
                                ? 'bg-indigo-600/20 text-indigo-405 border-indigo-500/30 font-bold' 
                                : 'bg-slate-905 border-white/5 text-slate-400 hover:bg-slate-800 text-xs'
                            } ${isExamLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span className="text-xs font-semibold flex items-center gap-1.5">
                              <Code className="h-3.5 w-3.5" />
                              Section B: Coding
                            </span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-4 border-b border-white/5">
                        {(currentExam?.exam_type !== 'coding' || examMCQs.length > 0) && (
                          <button 
                            onClick={() => { if (!isExamLocked) { setSelectedSection('mcq'); setActiveQuestionIndex(0); } }}
                            disabled={isExamLocked}
                            className={`p-2 rounded-lg border transition-all ${selectedSection === 'mcq' ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400' : 'border-transparent text-slate-400 hover:bg-slate-800'} ${isExamLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Switch to MCQ section"
                          >
                            <BookOpen className="h-4 w-4" />
                          </button>
                        )}
                        {(currentExam?.exam_type !== 'mcq' || examCodings.length > 0) && (
                          <button 
                            onClick={() => { if (!isExamLocked) { setSelectedSection('coding'); setActiveQuestionIndex(0); } }}
                            disabled={isExamLocked}
                            className={`p-2 rounded-lg border transition-all ${selectedSection === 'coding' ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400' : 'border-transparent text-slate-400 hover:bg-slate-800'} ${isExamLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Switch to Coding section"
                          >
                            <Code className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Question Grid */}
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
                      {!isSidebarCollapsed && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Question Grid</span>
                          <span className="text-[9px] font-bold text-indigo-400">{activeQuestionIndex + 1} / {(selectedSection === 'mcq' ? examMCQs : examCodings).length}</span>
                        </div>
                      )}
                      <div className={`grid ${isSidebarCollapsed ? 'grid-cols-1 gap-3 justify-items-center' : 'grid-cols-4 gap-2'}`}>
                        {(selectedSection === 'mcq' ? examMCQs : examCodings).map((q, idx) => {
                          const isAnswered = selectedSection === 'mcq' ? !!mcqAnswers[q.id] : (codingSolutions[q.id]?.code?.length || 0) > 5;
                          const isMarked = markedForReview[q.id];
                          const isActive = activeQuestionIndex === idx;

                          let bgClass = '';
                          if (isActive) {
                            bgClass = 'bg-blue-600 text-white border-blue-500 font-extrabold scale-105';
                          } else if (isMarked) {
                            bgClass = 'bg-amber-500/20 text-amber-400 border-amber-500/30 font-bold';
                          } else if (isAnswered) {
                            bgClass = 'bg-emerald-600/20 text-emerald-400 border-emerald-500/25';
                          } else {
                            bgClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                          }

                          return (
                            <button
                              key={q.id}
                              onClick={() => {
                                if (isExamLocked) return;
                                saveCurrentCodeImmediately();
                                setActiveQuestionIndex(idx);
                              }}
                              disabled={isExamLocked}
                              className={`h-9 w-9 flex items-center justify-center rounded-lg text-xs transition-all border shadow-inner ${bgClass} ${isExamLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title={`Go to Question ${idx + 1} ${isMarked ? '(Marked for Review)' : isAnswered ? '(Answered)' : '(Not Answered)'}`}
                            >
                              {idx + 1}
                            </button>
                          );
                        })}
                      </div>

                      {/* Legend details */}
                      {!isSidebarCollapsed && (
                        <div className="pt-4 border-t border-white/5 space-y-2 text-[10px] font-semibold text-slate-400">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded bg-blue-600 border border-blue-500"></span>
                            <span>Current</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded bg-emerald-600/20 border border-emerald-500/25"></span>
                            <span>Answered</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded bg-amber-500/20 border border-amber-500/30"></span>
                            <span>Marked for Review</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded bg-rose-500/10 border border-rose-500/20"></span>
                            <span>Not Answered</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom status - Proctor Logs */}
                    {!isSidebarCollapsed && (
                      <div className="p-3 bg-slate-950/40 border-t border-white/10">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Live Proctor Logs</span>
                        <div className="h-20 overflow-y-auto text-[8px] font-mono text-slate-500 space-y-1 scrollbar-thin">
                          {proctorLogs.slice(0, 8).map((log, i) => <div key={i} className="truncate">{log}</div>)}
                          {proctorLogs.length === 0 && <div>Initializing logs...</div>}
                        </div>
                      </div>
                    )}
                  </div>
                </aside>

                {/* MCQ WORKSPACE VIEW */}
                {selectedSection === 'mcq' && examMCQs[activeQuestionIndex] && (
                  <div className="flex-1 flex flex-col bg-slate-950 p-8 overflow-y-auto">
                    <div className="max-w-3xl mx-auto w-full space-y-8 bg-slate-900 border border-white/10 rounded-2xl p-8 shadow-2xl">
                      <div className="flex justify-between items-center border-b border-white/5 pb-4">
                        <div>
                          <span className="text-xs text-indigo-400 font-extrabold uppercase tracking-wider">Question {activeQuestionIndex + 1} of {examMCQs.length}</span>
                          <span className="ml-3 text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 font-bold uppercase tracking-wider">{examMCQs[activeQuestionIndex].difficulty}</span>
                        </div>
                        <span className="text-xs text-slate-400 font-bold">Marks: {examMCQs[activeQuestionIndex].marks} pts</span>
                      </div>
                      
                      <h3 className="text-lg font-bold text-white leading-relaxed">{examMCQs[activeQuestionIndex].question}</h3>

                      <div className="space-y-3.5">
                        {['A', 'B', 'C', 'D'].map(opt => {
                          const optionKey = `option_${opt.toLowerCase()}` as keyof MCQQuestion;
                          const optionText = examMCQs[activeQuestionIndex][optionKey] as string;
                          const isSelected = mcqAnswers[examMCQs[activeQuestionIndex].id] === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => { if (!isExamLocked) saveMcqChoice(examMCQs[activeQuestionIndex].id, opt); }}
                              disabled={isExamLocked}
                              className={`w-full text-left p-4 rounded-xl text-xs font-semibold transition-all border flex items-center gap-4 ${
                                isSelected 
                                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/15' 
                                  : 'bg-slate-955 border-white/5 text-slate-300 hover:border-white/15 hover:bg-slate-850'
                              } ${isExamLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span className={`h-6 w-6 rounded-lg flex items-center justify-center border font-bold text-[10px] transition-colors ${
                                isSelected ? 'bg-white text-indigo-600 border-transparent' : 'bg-slate-900 border-white/10 text-slate-400'
                              }`}>
                                {opt}
                              </span>
                              {optionText}
                            </button>
                          );
                        })}
                      </div>

                      {/* Navigation buttons */}
                      <div className="flex justify-between items-center mt-8 border-t border-white/10 pt-5">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { if (!isExamLocked) setActiveQuestionIndex(p => Math.max(0, p - 1)); }}
                            className="px-4 py-2 border border-white/10 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                            disabled={isExamLocked || activeQuestionIndex === 0}
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => {
                              if (isExamLocked) return;
                              const qId = examMCQs[activeQuestionIndex].id;
                              setMarkedForReview(prev => ({ ...prev, [qId]: !prev[qId] }));
                            }}
                            disabled={isExamLocked}
                            className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors ${
                              markedForReview[examMCQs[activeQuestionIndex].id]
                                ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                                : 'border-white/10 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <Bookmark className="h-3.5 w-3.5" />
                            {markedForReview[examMCQs[activeQuestionIndex].id] ? 'Flagged' : 'Mark for Review'}
                          </button>
                        </div>

                        {mcqAnswers[examMCQs[activeQuestionIndex].id] && (
                          <button
                            onClick={() => { if (!isExamLocked) clearMcqChoice(examMCQs[activeQuestionIndex].id); }}
                            disabled={isExamLocked}
                            className="px-4 py-2 bg-rose-500/10 text-rose-450 hover:bg-rose-500/20 rounded-xl text-xs font-bold border border-rose-500/20 transition-all"
                          >
                            Clear Response
                          </button>
                        )}
                        
                        <button
                          onClick={() => { if (!isExamLocked) setActiveQuestionIndex(p => Math.min(examMCQs.length - 1, p + 1)); }}
                          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-30 disabled:hover:bg-indigo-600"
                          disabled={isExamLocked || activeQuestionIndex === examMCQs.length - 1}
                        >
                          Next Question
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* CODING SECTION WORKSPACE VIEW */}
                {selectedSection === 'coding' && examCodings[activeQuestionIndex] && (
                  <div className="flex-1 flex flex-row overflow-hidden items-stretch w-full">
                    
                    {/* 2. CENTER LEFT: RESIZABLE QUESTION PANEL */}
                    {!isDescriptionCollapsed && (
                      <div 
                        style={{ width: isFullscreenQuestion ? '100%' : `${questionWidth}px` }} 
                        className={`flex-shrink-0 flex flex-col bg-slate-900 border-r border-white/10 overflow-hidden relative transition-all duration-100 ${
                          isFullscreenQuestion ? 'fixed inset-0 z-50 bg-slate-950 p-6' : ''
                        }`}
                      >
                        {/* Header controls */}
                        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-white/5 sticky top-0 z-10">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                            Problem Statement
                          </span>
                          
                          <div className="flex items-center gap-2">
                            {/* Width Presets */}
                            {!isFullscreenQuestion && (
                              <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded-lg border border-white/5 mr-2">
                                <button
                                  onClick={() => setWidthPercent(0.25)}
                                  className="px-2 py-0.5 text-[9px] font-bold rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
                                  title="Set width to 25%"
                                >
                                  25%
                                </button>
                                <button
                                  onClick={() => setWidthPercent(0.40)}
                                  className="px-2 py-0.5 text-[9px] font-bold rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
                                  title="Set width to 40%"
                                >
                                  40%
                                </button>
                                <button
                                  onClick={() => setWidthPercent(0.50)}
                                  className="px-2 py-0.5 text-[9px] font-bold rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
                                  title="Set width to 50%"
                                >
                                  50%
                                </button>
                              </div>
                            )}
                            {/* Fullscreen Button */}
                            <button
                              onClick={() => setIsFullscreenQuestion(!isFullscreenQuestion)}
                              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                              title={isFullscreenQuestion ? "Exit Fullscreen" : "Fullscreen description"}
                            >
                              {isFullscreenQuestion ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                            </button>
                            {/* Collapse Button */}
                            {!isFullscreenQuestion && (
                              <button
                                onClick={() => setIsDescriptionCollapsed(true)}
                                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                title="Collapse panel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Question Content Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                          <div>
                            <h2 className="text-base font-extrabold text-white">{examCodings[activeQuestionIndex].title}</h2>
                            <div className="flex items-center gap-2 mt-2 text-[9px] font-bold">
                              <span className="bg-slate-950 px-2 py-0.5 border border-white/5 rounded text-indigo-400 uppercase">{examCodings[activeQuestionIndex].difficulty}</span>
                              <span className="bg-slate-950 px-2 py-0.5 border border-white/5 rounded text-slate-400">{examCodings[activeQuestionIndex].marks} pts</span>
                            </div>
                          </div>

                          <div className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                            {examCodings[activeQuestionIndex].description}
                          </div>

                          {/* Constraints Card */}
                          <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-2 text-[10px] font-mono shadow-inner">
                            <div className="font-bold text-slate-400 uppercase tracking-widest text-[8px]">Constraints & Limits</div>
                            <div className="grid grid-cols-2 gap-2 text-slate-300 text-[9px]">
                              <div>Time Limit: <span className="text-indigo-400 font-bold">{examCodings[activeQuestionIndex].time_limit || 2} seconds</span></div>
                              <div>Memory Limit: <span className="text-indigo-400 font-bold">{examCodings[activeQuestionIndex].memory_limit || 256} MB</span></div>
                            </div>
                          </div>

                          {/* Render Sample Test Cases */}
                          {examCodings[activeQuestionIndex].testCases && examCodings[activeQuestionIndex].testCases.length > 0 && (
                            <div className="space-y-3.5 pt-4 border-t border-white/5">
                              <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest font-black block">Sample Cases</span>
                              
                              <div className="space-y-3.5">
                                {examCodings[activeQuestionIndex].testCases.map((tc: any, tcIdx: number) => (
                                  <div key={tc.id || tcIdx} className="p-3 bg-slate-950/80 rounded-xl border border-white/5 space-y-2 text-[10px] font-mono shadow-inner">
                                    <div className="font-bold text-slate-400">Sample Test Case #{tcIdx + 1}</div>
                                    <div className="space-y-2">
                                      <div>
                                        <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Input:</div>
                                        <pre className="bg-slate-900 p-2 rounded text-slate-350 overflow-x-auto whitespace-pre-wrap max-h-[80px]">{tc.input}</pre>
                                      </div>
                                      <div>
                                        <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Expected Output:</div>
                                        <pre className="bg-slate-900 p-2 rounded text-slate-350 overflow-x-auto whitespace-pre-wrap max-h-[80px]">{tc.expected_output}</pre>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Drag Handle 1: Between Question Panel and Code Editor */}
                    {!isDescriptionCollapsed && !isFullscreenQuestion && !isFullscreenEditor && (
                      <div 
                        onMouseDown={startDragQuestion}
                        className="w-1.5 hover:w-2 bg-slate-950 hover:bg-indigo-500/50 cursor-col-resize flex-shrink-0 transition-all self-stretch z-25 relative border-r border-l border-white/5"
                        title="Drag to resize Question Panel"
                      />
                    )}
                    {isDescriptionCollapsed && (
                      <button
                        onClick={() => setIsDescriptionCollapsed(false)}
                        className="w-10 bg-slate-900 border-r border-white/10 hover:bg-slate-800 flex flex-col items-center justify-start gap-2 cursor-pointer select-none py-6 text-slate-400 hover:text-white transition-all group shrink-0"
                        title="Expand Problem Statement"
                      >
                        <BookOpen className="h-4 w-4 text-indigo-400 group-hover:scale-110 transition-transform mb-4" />
                        <span 
                          className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap mt-4"
                          style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
                        >
                          Problem Statement
                        </span>
                      </button>
                    )}
                    <div 
                      style={{ width: (isFullscreenEditor || isDescriptionCollapsed) ? 'auto' : `${editorWidth}px` }} 
                      className={`flex-1 lg:flex-initial flex flex-col bg-slate-950 border-r border-white/10 overflow-hidden relative transition-all duration-100 ${
                        isFullscreenEditor ? 'fixed inset-0 z-50 bg-slate-955 p-6' : ''
                      }`}
                    >
                      {/* Editor Toolbar */}
                      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-slate-900 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          {isDescriptionCollapsed && (
                            <button
                              onClick={() => setIsDescriptionCollapsed(false)}
                              className="px-2.5 py-1 bg-slate-950 border border-white/5 rounded-lg text-xs font-bold text-indigo-400 hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                              title="Show Question panel"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              Show Question
                            </button>
                          )}
                          
                          {/* Font Size controls */}
                          <div className="flex items-center gap-1 bg-slate-955 p-1 rounded-lg border border-white/5">
                            <button 
                              onClick={() => setEditorFontSize(f => Math.max(10, f - 1))}
                              className="w-6 h-6 flex items-center justify-center hover:bg-slate-800 text-[10px] font-black rounded text-slate-400 transition-all"
                              title="Decrease font size"
                            >
                              A-
                            </button>
                            <select
                              value={editorFontSize}
                              onChange={e => setEditorFontSize(parseInt(e.target.value))}
                              className="bg-transparent border-0 text-[10px] font-bold px-1 text-slate-305 outline-none cursor-pointer text-center"
                            >
                              {[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(sz => (
                                <option key={sz} value={sz} className="bg-slate-900">{sz}px</option>
                              ))}
                            </select>
                            <button 
                              onClick={() => setEditorFontSize(f => Math.min(20, f + 1))}
                              className="w-6 h-6 flex items-center justify-center hover:bg-slate-800 text-[10px] font-black rounded text-slate-400 transition-all"
                              title="Increase font size"
                            >
                              A+
                            </button>
                          </div>

                          {/* Theme Selector */}
                          <select
                            value={editorTheme}
                            onChange={e => setEditorTheme(e.target.value)}
                            className="bg-slate-955 border border-white/5 text-[10px] font-bold px-2 py-1 rounded-lg text-slate-355 outline-none cursor-pointer"
                          >
                            <option value="vs-dark">VS Code Dark</option>
                            <option value="vs-dark-custom">Slate Dark</option>
                            <option value="light">Light</option>
                            <option value="monokai">Monokai</option>
                            <option value="github-light">GitHub Light</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Compiler Language Selection */}
                          <div className="flex items-center gap-1 bg-slate-955 p-1 rounded-lg border border-white/5">
                            <select
                              value={codingSolutions[examCodings[activeQuestionIndex].id]?.language || examCodings[activeQuestionIndex].language}
                              onChange={e => {
                                const newLang = e.target.value;
                                const qId = examCodings[activeQuestionIndex].id;
                                const currentVal = codingSolutions[qId];
                                const currentCode = currentVal?.code || '';

                                const isTemplateOrEmpty = !currentCode.trim() || 
                                  currentCode.includes('Write your logic here') || 
                                  currentCode.includes('import java.util.*;') ||
                                  currentCode.includes('#include <iostream>') ||
                                  currentCode.includes('const fs = require') ||
                                  currentCode === examCodings[activeQuestionIndex].starter_code;

                                const updatedSolutions = {
                                  ...codingSolutions,
                                  [qId]: { 
                                    code: isTemplateOrEmpty ? getCustomTemplate(examCodings[activeQuestionIndex], newLang) : currentCode, 
                                    language: newLang 
                                  }
                                };
                                setCodingSolutions(updatedSolutions);
                                saveCurrentCodeImmediately(updatedSolutions);
                              }}
                              className="bg-transparent border-0 text-[10px] font-bold px-2 py-0.5 text-slate-205 outline-none cursor-pointer"
                            >
                              <option value="Python">Python</option>
                              <option value="Java">Java</option>
                              <option value="C++">C++</option>
                              <option value="JavaScript">JavaScript</option>
                            </select>
                          </div>

                          {/* Fullscreen Button */}
                          <button
                            onClick={() => setIsFullscreenEditor(!isFullscreenEditor)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                            title={isFullscreenEditor ? "Exit Fullscreen Editor" : "Fullscreen Editor"}
                          >
                            {isFullscreenEditor ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Header Help Tip */}
                      <div className="bg-slate-950 px-4 py-1.5 border-b border-white/5 text-[9px] text-indigo-400 font-mono flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          💡 Read from <strong>stdin</strong> & write to <strong>stdout</strong>
                        </span>
                        
                        <button
                          onClick={() => {
                            const qId = examCodings[activeQuestionIndex].id;
                            const lang = codingSolutions[qId]?.language || examCodings[activeQuestionIndex].language;
                            setCodingSolutions(prev => ({
                              ...prev,
                              [qId]: { code: getCustomTemplate(examCodings[activeQuestionIndex], lang), language: lang }
                            }));
                            showToast('Reset editor to starter template.', 'info');
                          }}
                          className="text-[9px] text-slate-500 hover:text-indigo-405 font-semibold transition-all px-2 py-0.5 rounded border border-white/5 hover:border-indigo-500/30 bg-slate-950"
                        >
                          Reset Starter Code
                        </button>
                      </div>

                      {/* Monaco Editor Container */}
                      <div className="flex-1 w-full bg-[#1e1e1e]">
                        <Editor
                          height="100%"
                          language={(() => {
                            const rawLang = codingSolutions[examCodings[activeQuestionIndex].id]?.language || examCodings[activeQuestionIndex].language || 'python';
                            const l = rawLang.toLowerCase();
                            if (l === 'c++' || l === 'cpp') return 'cpp';
                            return l;
                          })()}
                          value={codingSolutions[examCodings[activeQuestionIndex].id]?.code || ''}
                          theme={editorTheme}
                          beforeMount={(monaco) => {
                            monaco.editor.defineTheme('vs-dark-custom', {
                              base: 'vs-dark',
                              inherit: true,
                              rules: [],
                              colors: {
                                'editor.background': '#0f172a',
                              }
                            });
                            monaco.editor.defineTheme('monokai', {
                              base: 'vs-dark',
                              inherit: true,
                              rules: [
                                { token: 'comment', foreground: '75715E', fontStyle: 'italic' },
                                { token: 'keyword', foreground: 'F92672' },
                                { token: 'string', foreground: 'E6DB74' },
                                { token: 'number', foreground: 'AE81FF' },
                                { token: 'regexp', foreground: 'AE81FF' },
                                { token: 'type', foreground: '66D9EF', fontStyle: 'italic' },
                                { token: 'class', foreground: 'A6E22E' },
                                { token: 'function', foreground: 'A6E22E' },
                                { token: 'variable', foreground: 'F8F8F2' },
                              ],
                              colors: {
                                'editor.background': '#272822',
                                'editor.foreground': '#F8F8F2',
                                'editorCursor.foreground': '#F8F8F0',
                                'editor.lineHighlightBackground': '#3E3D32',
                                'editorLineNumber.foreground': '#90908A',
                                'editorLineNumber.activeForeground': '#C2C2BF',
                              }
                            });
                            monaco.editor.defineTheme('github-light', {
                              base: 'vs',
                              inherit: true,
                              rules: [
                                { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
                                { token: 'keyword', foreground: 'd73a49' },
                                { token: 'string', foreground: '032f62' },
                                { token: 'variable', foreground: '24292e' },
                                { token: 'function', foreground: '6f42c1' },
                              ],
                              colors: {
                                'editor.background': '#ffffff',
                                'editor.foreground': '#24292e',
                                'editor.lineHighlightBackground': '#f6f8fa',
                                'editorLineNumber.foreground': '#e1e4e8',
                              }
                            });
                          }}
                          onChange={(value) => {
                            const qId = examCodings[activeQuestionIndex].id;
                            const updatedSolutions = {
                              ...codingSolutions,
                              [qId]: { 
                                code: value || '', 
                                language: codingSolutions[qId]?.language || examCodings[activeQuestionIndex].language 
                              }
                            };
                            setCodingSolutions(updatedSolutions);
                            if (currentAttempt?.id) {
                              localStorage.setItem(`clahan_coding_sol_${currentAttempt.id}`, JSON.stringify(updatedSolutions));
                            }
                          }}
                          options={{
                            fontSize: editorFontSize,
                            minimap: { enabled: false },
                            lineNumbers: 'on',
                            roundedSelection: false,
                            scrollBeyondLastLine: false,
                            readOnly: isExamLocked,
                            automaticLayout: true,
                            cursorBlinking: 'smooth',
                            formatOnType: true,
                            formatOnPaste: true,
                            folding: true,
                            bracketPairColorization: { enabled: true },
                            autoIndent: 'full',
                          }}
                        />
                      </div>

                      {/* Bottom actions inside editor */}
                      <div className="bg-slate-900 border-t border-white/5 px-4 py-3 flex items-center justify-between">
                        <button
                          onClick={() => {
                            if (isExamLocked) return;
                            const qId = examCodings[activeQuestionIndex].id;
                            setMarkedForReview(prev => ({ ...prev, [qId]: !prev[qId] }));
                          }}
                          disabled={isExamLocked}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                            markedForReview[examCodings[activeQuestionIndex].id]
                              ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                              : 'border-white/5 text-slate-400 hover:bg-slate-800'
                          } ${isExamLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Bookmark className="h-3.5 w-3.5" />
                          {markedForReview[examCodings[activeQuestionIndex].id] ? 'Flagged' : 'Mark for Review'}
                        </button>

                        <div className="flex gap-2">
                          <button
                            onClick={() => { if (!isExamLocked) runCodeSample(examCodings[activeQuestionIndex].id); }}
                            className="px-4 py-2 bg-slate-955 hover:bg-slate-800 border border-white/10 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 text-slate-350 transition-colors"
                            disabled={isExamLocked || isRunningCode}
                          >
                            <Play className="h-3.5 w-3.5 text-indigo-400" /> 
                            {isRunningCode ? 'Running...' : 'Run Samples'}
                          </button>
                          
                          <button
                            onClick={() => { if (!isExamLocked) submitCodingSolution(examCodings[activeQuestionIndex].id); }}
                            disabled={isExamLocked}
                            className={`px-4 py-2 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/30 text-white rounded-xl text-xs font-bold transition-all shadow-md ${isExamLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            Submit Code
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Drag Handle 2: Between Editor and Output Panel */}
                    {!isFullscreenEditor && !isFullscreenOutput && (
                      <div 
                        onMouseDown={startDragEditor}
                        className="w-1.5 hover:w-2 bg-slate-950 hover:bg-indigo-500/50 cursor-col-resize flex-shrink-0 transition-all self-stretch z-25 relative border-r border-l border-white/5"
                        title="Drag to resize Output Panel"
                      />
                    )}

                    {/* 4. RIGHT: RESIZABLE OUTPUT / TEST CASES PANEL */}
                    <div 
                      className={`flex-1 flex flex-col bg-slate-900 border-l border-white/10 overflow-hidden relative ${
                        isFullscreenOutput ? 'fixed inset-0 z-50 bg-slate-955 p-6' : ''
                      }`}
                    >
                      {/* Tabbed Navigation Bar */}
                      <div className="flex-shrink-0 flex items-center justify-between bg-slate-955 border-b border-white/5 sticky top-0 z-10 px-4 py-1.5">
                        <div className="flex gap-1">
                          {(['output', 'testcases', 'errors', 'details'] as const).map(tab => {
                            let label = 'Output';
                            if (tab === 'testcases') label = 'Test Cases';
                            if (tab === 'errors') label = 'Errors';
                            if (tab === 'details') label = 'Details';

                            return (
                              <button
                                key={tab}
                                onClick={() => setOutputTab(tab)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                  outputTab === tab 
                                    ? 'bg-indigo-600/10 border-indigo-500/35 text-indigo-405' 
                                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsFullscreenOutput(!isFullscreenOutput)}
                            className="p-1 hover:bg-slate-805 rounded text-slate-400 hover:text-white transition-colors"
                            title={isFullscreenOutput ? "Exit Fullscreen" : "Fullscreen Output"}
                          >
                            {isFullscreenOutput ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Tab Content Display */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        
                        {/* Tab 1: Output Results */}
                        {outputTab === 'output' && (
                          <div className="space-y-4 h-full">
                            {codeExecutionResults.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-48 text-center space-y-2.5">
                                <Terminal className="h-8 w-8 text-slate-600" />
                                <p className="text-[11px] font-semibold text-slate-500">No output logs. Click "Run Samples" to execute code.</p>
                              </div>
                            ) : (
                              codeExecutionResults.map((res, i) => (
                                <div key={i} className="font-mono text-[10px] bg-slate-950 p-4 rounded-xl border border-white/5 space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-350 text-xs">Sample Case #{i+1}</span>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                      res.passed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                                    }`}>
                                      {res.passed ? 'Passed' : 'Failed'} ({res.status || 'Done'})
                                    </span>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 gap-3.5">
                                    {res.stdout && (
                                      <div className="bg-slate-900 p-2.5 rounded-lg border border-white/5">
                                        <div className="text-[8px] text-slate-500 mb-1 font-bold uppercase">Your Stdout:</div>
                                        <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap max-h-[100px] text-[10px]">{res.stdout.trim()}</pre>
                                      </div>
                                    )}

                                    {!res.stdout && !res.stderr && (
                                      <div className="bg-slate-900 p-2.5 rounded-lg border border-white/5 italic text-slate-505 text-center">
                                        No stdout outputs produced.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* Tab 2: Detailed Test Cases Check */}
                        {outputTab === 'testcases' && (
                          <div className="space-y-4">
                            {isRunningCode ? (
                              <div className="flex flex-col items-center justify-center h-48 text-center space-y-3">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                                <p className="text-xs font-semibold text-blue-500 dark:text-blue-400">Running Test Cases...</p>
                              </div>
                            ) : codeExecutionResults.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-48 text-center space-y-2.5">
                                <CheckCircle className="h-8 w-8 text-slate-400 dark:text-slate-650" />
                                <p className="text-[11px] font-semibold text-slate-505">No execution results. Run code or submit to view test cases.</p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {/* Total Summary Card */}
                                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-sm space-y-3">
                                  <div className="flex items-center justify-between border-b border-slate-105 dark:border-white/5 pb-2">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Total Summary</span>
                                    <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded">
                                      Score: {codeSummary?.scoreObtained ?? codeExecutionResults.filter(r => r.passed).length * 10} / {codeSummary?.totalMarks ?? codeExecutionResults.length * 10}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                                    <div className="bg-emerald-50 dark:bg-emerald-500/10 p-2 rounded-lg border border-emerald-250 dark:border-emerald-500/20">
                                      <div className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                                        {codeExecutionResults.filter(r => r.passed).length}
                                      </div>
                                      <div className="text-[10px] text-emerald-500 dark:text-emerald-500">Passed</div>
                                    </div>
                                    <div className="bg-rose-50 dark:bg-rose-500/10 p-2 rounded-lg border border-rose-250 dark:border-rose-500/20">
                                      <div className="text-rose-600 dark:text-rose-455 font-extrabold text-sm">
                                        {codeExecutionResults.filter(r => !r.passed).length}
                                      </div>
                                      <div className="text-[10px] text-rose-500 dark:text-rose-500">Failed</div>
                                    </div>
                                    <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-white/5">
                                      <div className="text-slate-700 dark:text-slate-300 font-extrabold text-sm">
                                        {codeExecutionResults.length}
                                      </div>
                                      <div className="text-[10px] text-slate-500">Total Cases</div>
                                    </div>
                                  </div>
                                </div>

                                {/* Visible Cases Section */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-indigo-400 uppercase tracking-widest font-black">Visible Cases</span>
                                    <span className="text-[10px] font-mono text-slate-400">
                                      ({codeExecutionResults.filter(r => !r.is_hidden && r.passed).length} / {codeExecutionResults.filter(r => !r.is_hidden).length} Passed)
                                    </span>
                                  </div>
                                  <div className="space-y-2">
                                    {codeExecutionResults.filter(r => !r.is_hidden).map((res, i) => (
                                      <div key={i} className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-between text-[11px] font-mono shadow-sm">
                                        <div className="flex items-center gap-2.5">
                                          <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                                            res.passed
                                              ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                                              : 'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-455 border border-rose-200 dark:border-rose-500/30'
                                          }`}>
                                            {res.passed ? '✓' : '✗'}
                                          </span>
                                          <span className="font-bold text-slate-700 dark:text-slate-350">Test Case #{i+1}</span>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                          res.passed ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/5' : 'text-rose-600 bg-rose-50 dark:text-rose-455 dark:bg-rose-500/5'
                                        }`}>
                                          {res.status || (res.passed ? 'Passed' : 'Failed')}
                                        </span>
                                      </div>
                                    ))}
                                    {codeExecutionResults.filter(r => !r.is_hidden).length === 0 && (
                                      <p className="text-[10px] text-slate-500 italic">No visible test cases.</p>
                                    )}
                                  </div>
                                </div>

                                {/* Hidden Cases Section */}
                                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-indigo-400 uppercase tracking-widest font-black">Hidden Cases</span>
                                    <span className="text-[10px] font-mono text-slate-400">
                                      ({codeExecutionResults.filter(r => r.is_hidden && r.passed).length} / {codeExecutionResults.filter(r => r.is_hidden).length} Passed)
                                    </span>
                                  </div>
                                  <div className="space-y-2">
                                    {codeExecutionResults.filter(r => r.is_hidden).map((res, i) => (
                                      <div key={i} className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-between text-[11px] font-mono shadow-sm">
                                        <div className="flex items-center gap-2.5">
                                          <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                                            res.passed
                                              ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                                              : 'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-455 border border-rose-200 dark:border-rose-500/30'
                                          }`}>
                                            {res.passed ? '✓' : '✗'}
                                          </span>
                                          <span className="font-bold text-slate-700 dark:text-slate-350">Hidden Case #{i+1}</span>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                          res.passed ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/5' : 'text-rose-600 bg-rose-50 dark:text-rose-455 dark:bg-rose-500/5'
                                        }`}>
                                          {res.status || (res.passed ? 'Passed' : 'Failed')}
                                        </span>
                                      </div>
                                    ))}
                                    {codeExecutionResults.filter(r => r.is_hidden).length === 0 && (
                                      <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-white/5 text-[10px] font-mono text-slate-505 text-center">
                                        No hidden test cases executed yet. Click "Submit Code" to run the full suite.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tab 3: Compilation and Runtime Errors */}
                        {outputTab === 'errors' && (
                          <div className="space-y-4">
                            {codeExecutionResults.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-48 text-center space-y-2.5">
                                <AlertTriangle className="h-8 w-8 text-slate-600" />
                                <p className="text-[11px] font-semibold text-slate-505">No error reports. Run code to analyze errors.</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {codeExecutionResults.some(res => res.stderr) ? (
                                  codeExecutionResults.map((res, i) => res.stderr ? (
                                    <div key={i} className="p-4 bg-rose-955 border border-rose-500/20 rounded-xl space-y-2 text-[10px] font-mono">
                                      <div className="font-bold text-rose-400 uppercase">Case #{i+1} Diagnostics (Stderr):</div>
                                      <pre className="text-rose-350 overflow-x-auto whitespace-pre-wrap max-h-[160px] text-[10px] bg-slate-950 p-3 rounded-lg border border-white/5">{res.stderr}</pre>
                                    </div>
                                  ) : null)
                                ) : (
                                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-[10px] font-mono text-emerald-400">
                                    <Check className="h-4.5 w-4.5" />
                                    <span>Compilation and execution successful! No compiler errors or tracebacks detected.</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tab 4: Execution Details */}
                        {outputTab === 'details' && (
                          <div className="space-y-4">
                            <div className="bg-slate-955 p-4 rounded-xl border border-white/5 space-y-3.5 text-[10px] font-mono">
                              <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block font-black border-b border-white/5 pb-1.5">Profile Diagnostics</span>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-slate-500 uppercase tracking-wider block text-[8px]">Language Profile:</span>
                                  <span className="text-slate-202 font-bold">{codingSolutions[examCodings[activeQuestionIndex].id]?.language || examCodings[activeQuestionIndex].language}</span>
                                </div>
                                <div>
                                  <span className="text-slate-505 uppercase tracking-wider block text-[8px]">Time Metric (Max Limit):</span>
                                  <span className="text-slate-202 font-bold">{examCodings[activeQuestionIndex].time_limit || 2} seconds</span>
                                </div>
                                <div>
                                  <span className="text-slate-505 uppercase tracking-wider block text-[8px]">Memory Metric (Max Limit):</span>
                                  <span className="text-slate-202 font-bold">{examCodings[activeQuestionIndex].memory_limit || 256} MB</span>
                                </div>
                                <div>
                                  <span className="text-slate-505 uppercase tracking-wider block text-[8px]">Attempt Status:</span>
                                  <span className="text-indigo-400 font-bold">Ongoing Attempt #{currentAttempt?.attempt_number || 1}</span>
                                </div>
                              </div>
                            </div>

                            {codeExecutionResults.length > 0 && (
                              <div className="bg-slate-955 p-4 rounded-xl border border-white/5 space-y-3.5 text-[10px] font-mono">
                                <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block font-black border-b border-white/5 pb-1.5">Performance Analysis</span>
                                
                                <div className="space-y-2.5">
                                  {codeExecutionResults.map((res, i) => (
                                    <div key={i} className="flex justify-between items-center text-slate-400 text-[10px]">
                                      <span>Case #{i+1}:</span>
                                      <span className="font-semibold text-slate-200">Time: <strong className="text-indigo-400">{res.timeMs || 0}ms</strong> | Memory: <strong className="text-indigo-400">{res.memoryKb || 0}KB</strong></span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION NAVIGATION BAR */}
              <footer className="flex-shrink-0 bg-slate-900 border-t border-white/10 px-6 py-3.5 flex items-center justify-between z-30 relative">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (isExamLocked) return;
                      saveCurrentCodeImmediately();
                      if (selectedSection === 'coding' && activeQuestionIndex === 0) {
                        if (examMCQs.length > 0) {
                          setSelectedSection('mcq');
                          setActiveQuestionIndex(examMCQs.length - 1);
                        }
                      } else {
                        setActiveQuestionIndex(p => Math.max(0, p - 1));
                      }
                    }}
                    className="px-4 py-2 border border-white/10 rounded-xl text-xs font-bold text-slate-355 hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    disabled={
                      isExamLocked ||
                      (selectedSection === 'mcq' && activeQuestionIndex === 0) ||
                      (selectedSection === 'coding' && activeQuestionIndex === 0 && examMCQs.length === 0)
                    }
                  >
                    Previous Question
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (isExamLocked) return;
                      saveCurrentCodeImmediately();
                      const totalQs = selectedSection === 'mcq' ? examMCQs.length : examCodings.length;
                      if (activeQuestionIndex === totalQs - 1) {
                        if (selectedSection === 'mcq' && examCodings.length > 0) {
                          setSelectedSection('coding');
                          setActiveQuestionIndex(0);
                        } else {
                          showToast("All questions processed! Please review and click Submit Exam above.");
                        }
                      } else {
                        setActiveQuestionIndex(p => p + 1);
                      }
                    }}
                    disabled={isExamLocked}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-550 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-30"
                  >
                    Next Question
                  </button>
                </div>
              </footer>

              {isExamLocked && (
                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
                  <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-toast">
                    <div className="mx-auto w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center animate-bounce">
                      <Clock className="h-8 w-8 text-rose-500" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-extrabold text-white">Time is Up!</h3>
                      <p className="text-xs text-slate-350 leading-relaxed">
                        Time is up. Your exam has been automatically submitted successfully. Redirecting to dashboard...
                      </p>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full animate-loader"></div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </main>
      )}
      {/* DETAILED RESULT VIEW ROUTE */}
      {currentPage === 'result-view' && detailedResult && (
        <main className="max-w-4xl mx-auto py-12 px-4 space-y-8">
          <div className="p-8 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-xl space-y-6">
            
            {/* Header Block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
              <div>
                <span className={`px-2.5 py-1 rounded text-xs font-black tracking-wider uppercase ${
                  detailedResult.attempt.status === 'terminated' 
                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-450 border border-rose-500/35' 
                    : detailedResult.attempt.passed 
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}>
                  {detailedResult.attempt.status === 'terminated' ? 'Terminated Assessment' : detailedResult.attempt.passed ? 'Passed Assessment' : 'Failed Assessment'}
                </span>
                <h2 className="text-2xl font-black mt-2">{detailedResult.attempt.exam_name}</h2>
                <p className="text-xs text-muted-foreground mt-1">Submitted on: {new Date(detailedResult.attempt.created_at).toLocaleString()}</p>
              </div>

              <div className="text-right">
                <p className="text-3xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">{Math.round(detailedResult.attempt.percentage)}%</p>
                <p className="text-xs text-muted-foreground mt-1">Score: {detailedResult.attempt.score} / {detailedResult.attempt.maxScore} pts</p>
              </div>
            </div>

            {/* Metric Summary Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Total Marks</span>
                <span className="text-base font-black text-slate-800 dark:text-white">
                  {detailedResult.attempt.score} <span className="text-xs font-normal text-slate-400 font-mono">/ {detailedResult.attempt.maxScore} pts</span>
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Percentage</span>
                <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
                  {Math.round(detailedResult.attempt.percentage)}%
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">MCQ Score</span>
                <span className="text-base font-black text-slate-800 dark:text-white">
                  {detailedResult.attempt.mcq_score} <span className="text-xs font-normal text-slate-400 font-mono">/ {detailedResult.attempt.max_mcq || 0} pts</span>
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Coding Score</span>
                <span className="text-base font-black text-slate-800 dark:text-white">
                  {detailedResult.attempt.coding_score} <span className="text-xs font-normal text-slate-400 font-mono">/ {detailedResult.attempt.max_coding || 0} pts</span>
                </span>
              </div>
            </div>

            {/* Proctor Termination Reason Alert */}
            {detailedResult.attempt.status === 'terminated' && (
              <div className="p-6 rounded-2xl bg-gradient-to-tr from-rose-500/10 to-orange-500/10 border border-rose-500/20 relative overflow-hidden">
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-rose-900 dark:text-rose-300">Exam Terminated via AI Proctoring</h4>
                    <p className="text-sm font-semibold text-rose-800 dark:text-rose-200 mt-2">
                      Reason: <span className="font-black text-rose-700 dark:text-rose-300">{detailedResult.attempt.feedback || 'Multiple warnings exceeded / screen violations detected.'}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* AI Feedback Card */}
            {detailedResult.attempt.status !== 'terminated' && detailedResult.attempt.feedback && (
              <div className="p-6 rounded-2xl bg-gradient-to-tr from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 relative overflow-hidden">
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Cpu className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-indigo-900 dark:text-indigo-300">AI Evaluation Feedback (Phi-3)</h4>
                    <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 italic mt-2">
                      "{detailedResult.attempt.feedback}"
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* MCQ Responses Details */}
            {detailedResult.mcqResponses && detailedResult.mcqResponses.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-extrabold text-base">MCQ Answers Verification</h3>
                <div className="space-y-3">
                  {detailedResult.mcqResponses.map((res: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs">
                      <p className="font-bold">{idx + 1}. {res.question}</p>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-muted-foreground">
                        <p>Option A: {res.option_a}</p>
                        <p>Option B: {res.option_b}</p>
                        <p>Option C: {res.option_c}</p>
                        <p>Option D: {res.option_d}</p>
                      </div>
                      <div className="flex items-center gap-6 mt-4 pt-3 border-t text-[10px] font-bold">
                        <span className={res.is_correct ? 'text-emerald-500' : 'text-rose-500'}>
                          Your choice: {res.selected_option} {res.is_correct ? '(Correct)' : '(Incorrect)'}
                        </span>
                        <span className="text-emerald-500">Correct answer: {res.correct_answer}</span>
                        <span className="text-muted-foreground ml-auto">Marks obtained: {res.marks_obtained} / {res.marks} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coding Challenge Results */}
            {detailedResult.codingResponses && detailedResult.codingResponses.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-extrabold text-base border-b border-slate-100 dark:border-white/5 pb-2">Coding Details</h3>
                <div className="space-y-4">
                  {detailedResult.codingResponses.map((res: any, idx: number) => {
                    const failedCount = Math.max(0, res.total_test_cases - res.test_cases_passed);
                    return (
                      <div key={idx} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-[10px] text-indigo-500 uppercase tracking-widest font-black block font-mono">Coding Question #{idx+1}</span>
                            <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 mt-0.5">{res.title}</h4>
                          </div>
                          <span className={`text-[10px] font-mono px-2 py-1 rounded font-black uppercase ${
                            res.status === 'Accepted'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            {res.status}
                          </span>
                        </div>
                        
                        <div className="p-3 bg-slate-950 rounded-lg font-mono text-[10px] overflow-x-auto max-h-36">
                          <pre className={res.code ? 'text-emerald-400' : 'text-slate-500 italic'}>
                            {res.code || '// No solution submitted'}
                          </pre>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-200 dark:border-slate-800/80 pt-4 text-xs font-mono">
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-bold text-slate-405 block">Passed Cases</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                              {res.test_cases_passed} <span className="text-[10px] text-slate-400">/ {res.total_test_cases}</span>
                            </span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-bold text-slate-405 block">Failed Cases</span>
                            <span className="text-rose-600 dark:text-rose-455 font-extrabold text-sm">
                              {failedCount} <span className="text-[10px] text-slate-400">/ {res.total_test_cases}</span>
                            </span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-bold text-slate-405 block">Test Details</span>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5">
                              <div>Visible: {res.visible_test_cases_passed || 0}/{res.visible_test_cases_total || 0}</div>
                              <div>Hidden: {res.hidden_test_cases_passed || 0}/{res.hidden_test_cases_total || 0}</div>
                            </div>
                          </div>
                          <div className="space-y-1 text-right">
                            <span className="text-[9px] uppercase font-bold text-slate-405 block">Marks Earned</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-black text-sm bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 rounded-xl inline-block">
                              {res.marks_obtained} / {res.marks} pts
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setCurrentPage('student-dash');
                loadStudentDashboard();
              }}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl shadow-md transition-colors text-sm uppercase"
            >
              Return to Student Dashboard
            </button>
          </div>
        </main>
      )}

      {terminationModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-500" />
                  Terminate Student Session
                </h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  You are about to terminate the exam attempt for <span className="font-bold text-slate-800 dark:text-slate-250">{terminationModal.studentName}</span>.
                </p>
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-550 uppercase">Reason for Termination</label>
              <textarea
                value={terminationReason}
                onChange={e => setTerminationReason(e.target.value)}
                placeholder="Specify the reason (e.g., Using unauthorized materials, not facing screen)"
                rows={3}
                className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-transparent focus:outline-indigo-500 text-slate-900 dark:text-white"
                required
              />
            </div>
            
            <div className="flex justify-end gap-2.5 mt-2">
              <button
                type="button"
                onClick={() => setTerminationModal(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!terminationReason.trim()}
                onClick={() => {
                  adminSocketRef.current?.emit('admin-terminate-student', {
                    attemptId: terminationModal.attemptId,
                    reason: terminationReason.trim()
                  });
                  setTerminationModal(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                Terminate Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {warningModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Warn Student candidate
                </h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  You are sending a manual real-time warning to <span className="font-bold text-slate-800 dark:text-slate-250">{warningModal.studentName}</span>.
                </p>
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-550 uppercase">Warning Message</label>
              <textarea
                value={warningReason}
                onChange={e => setWarningReason(e.target.value)}
                placeholder="Specify the warning details (e.g., Please adjust your camera view, no cellphones allowed)"
                rows={3}
                className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-transparent focus:outline-indigo-500 text-slate-900 dark:text-white"
                required
              />
            </div>
            
            <div className="flex justify-end gap-2.5 mt-2">
              <button
                type="button"
                onClick={() => setWarningModal(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!warningReason.trim()}
                onClick={() => {
                  adminSocketRef.current?.emit('admin-warn-student', {
                    attemptId: warningModal.attemptId,
                    reason: warningReason.trim()
                  });
                  setWarningModal(null);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                Send Warning
              </button>
            </div>
          </div>
        </div>
      )}

      {studentWarningMessage && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border-2 border-amber-500 rounded-3xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-amber-500/20 pb-3">
              <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                <AlertTriangle className="h-6 w-6 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-black text-amber-600 dark:text-amber-400">
                  IMPORTANT PROCTOR WARNING
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Administrator Warning Issued
                </p>
              </div>
            </div>
            
            <div className="py-2">
              <p className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
                {studentWarningMessage}
              </p>
            </div>
            
            <button
              type="button"
              onClick={() => setStudentWarningMessage(null)}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white font-bold rounded-xl text-xs uppercase transition-all shadow-md shadow-amber-500/20"
            >
              I Acknowledge & Understand
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
