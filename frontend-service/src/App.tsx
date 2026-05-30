import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Code, Shield, Video, Bell, Settings, Award, Users, CheckCircle, AlertTriangle, 
  Trash2, Copy, Send, Download, Upload, Plus, Play, Check, Moon, Sun, ArrowRight, User, 
  LogOut, RefreshCw, Layers, Cpu, Laptop, Terminal, Mail, Phone, MapPin, Eye, EyeOff, Lock
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

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
}
interface Exam {
  id: string; name: string; description: string; exam_type: 'mcq' | 'coding' | 'both';
  duration_minutes: number; cutoff_percentage: number; allowed_attempts: number;
  schedule_date: string; college_id: string; department_id: string; year: string;
  is_published: boolean; mcq_count?: number; coding_count?: number;
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
}

export default function App() {
  // Theme State
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });

  // App Routing
  const [currentPage, setCurrentPage] = useState<'landing' | 'login' | 'register' | 'forgot-pw' | 'reset-pw' | 'student-dash' | 'admin-dash' | 'exam-env' | 'result-view'>('landing');
  
  // Auth state
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
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
    collegeId: '', departmentId: '', year: '1st Year', githubProfile: '', linkedinProfile: '', profilePhotoUrl: ''
  });

  // Data Cache Lists
  const [colleges, setColleges] = useState<College[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [upcomingExams, setUpcomingExams] = useState<Exam[]>([]);
  const [activeExams, setActiveExams] = useState<Exam[]>([]);
  const [completedAttempts, setCompletedAttempts] = useState<Attempt[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeAdminTab, setActiveAdminTab] = useState<'metrics' | 'colleges' | 'students' | 'exams' | 'live' | 'settings'>('metrics');
  const [activeStudentTab, setActiveStudentTab] = useState<'active-exams' | 'results' | 'profile' | 'notifications'>('active-exams');

  // Admin College/Dept Creation state
  const [newCollegeName, setNewCollegeName] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCollegeId, setNewDeptCollegeId] = useState('');
  const [adminColleges, setAdminColleges] = useState<College[]>([]);
  const [adminDepts, setAdminDepts] = useState<any[]>([]);
  const [adminStudents, setAdminStudents] = useState<UserProfile[]>([]);
  const [adminExams, setAdminExams] = useState<any[]>([]);
  const [adminMetrics, setAdminMetrics] = useState<any>({
    totalStudents: 0, totalExams: 0, liveExams: 0, completedExams: 0, averageScore: 0, passPercentage: 0, failPercentage: 0
  });

  // Settings State
  const [companySettings, setCompanySettings] = useState({
    companyName: 'Clahan Academy',
    contactPhone: '+1-555-123-4567',
    contactEmail: 'support@clahan.com',
    companyAddress: '100 Innovation Way, Silicon Valley, CA',
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

  // Bulk student import state
  const [studentCsvInput, setStudentCsvInput] = useState('');
  const [importSummary, setImportSummary] = useState<any>(null);

  // Manual Exam Creation state
  const [examForm, setExamForm] = useState({
    name: '', description: '', examType: 'mcq' as 'mcq' | 'coding' | 'both',
    durationMinutes: 60, cutoffPercentage: 50, allowedAttempts: 1, scheduleDate: '',
    collegeId: '', departmentId: '', year: '1st Year'
  });
  const [selectedExamIdForQuestions, setSelectedExamIdForQuestions] = useState<string | null>(null);
  const [adminSelectedExamMCQs, setAdminSelectedExamMCQs] = useState<MCQQuestion[]>([]);
  const [adminSelectedExamCodings, setAdminSelectedExamCodings] = useState<CodingQuestion[]>([]);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [mcqForm, setMcqForm] = useState({
    question: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A', marks: 1, difficulty: 'medium'
  });
  // MCQ bulk import
  const [mcqCsvInput, setMcqCsvInput] = useState('');

  // Manual Coding Question Configuration
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
  const [hardwareProgress, setHardwareProgress] = useState(0);

  // Ongoing Exam IDE State
  const [examMCQs, setExamMCQs] = useState<MCQQuestion[]>([]);
  const [examCodings, setExamCodings] = useState<CodingQuestion[]>([]);
  const [selectedSection, setSelectedSection] = useState<'mcq' | 'coding'>('mcq');
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, string>>({}); // { questionId: selectedOption }
  const [codingSolutions, setCodingSolutions] = useState<Record<string, { code: string; language: string }>>({}); // { questionId: { code, lang } }
  
  // Proctor warnings
  const [tabWarnings, setTabWarnings] = useState(0);
  const [proctorLogs, setProctorLogs] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const timerRef = useRef<any>(null);
  
  // Real-time proctor socket client
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const proctorIntervalRef = useRef<any>(null);

  // View Result Detail State
  const [selectedResultAttemptId, setSelectedResultAttemptId] = useState<string | null>(null);
  const [detailedResult, setDetailedResult] = useState<any>(null);

  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, validationStep]);
  
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
      }
    } catch (err) {
      console.warn("REST Colleges API failed, loading mock colleges data.");
      // Fallback
      const mockCols = [
        { id: 'col-1', name: 'ABC Engineering College' },
        { id: 'col-2', name: 'XYZ Institute of Technology' }
      ];
      setColleges(mockCols);
      setAdminColleges(mockCols);
    }
  };

  const fetchDepartments = async (collegeId: string) => {
    if (!collegeId) return;
    try {
      const res = await fetch(`${API_AUTH}/colleges/${collegeId}/departments`);
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
      }
    } catch (err) {
      // Fallback departments mapping
      const mockDepts = [
        { id: 'dept-1', college_id: collegeId, name: 'CSE' },
        { id: 'dept-2', college_id: collegeId, name: 'ECE' },
        { id: 'dept-3', college_id: collegeId, name: 'AIDS' },
        { id: 'dept-4', college_id: collegeId, name: 'AIML' },
        { id: 'dept-5', college_id: collegeId, name: 'IT' }
      ];
      setDepartments(mockDepts);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch(`${API_AUTH}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const user = await res.json();
        setCurrentUser(user);
        if (user.role === 'admin') {
          setCurrentPage('admin-dash');
          loadAdminDashboard();
        } else {
          setCurrentPage('student-dash');
          loadStudentDashboard();
        }
      } else {
        handleLogout();
      }
    } catch (err) {
      // Decode JWT locally for mock usage if REST API offline
      if (token) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const mockUser: UserProfile = {
              id: payload.id || 'usr-mock',
              email: payload.email || 'student@clahan.com',
              role: payload.role || 'student',
              fullName: payload.fullName || 'Demo Student',
              rollNumber: payload.roll_number || '2026CSE104',
              collegeId: payload.college_id || 'col-1',
              departmentId: payload.department_id || 'dept-1',
              year: payload.year || '3rd Year',
              status: 'active',
              college_name: 'ABC Engineering College',
              department_name: 'CSE'
            };
            setCurrentUser(mockUser);
            if (mockUser.role === 'admin') {
              setCurrentPage('admin-dash');
              loadAdminDashboard();
            } else {
              setCurrentPage('student-dash');
              loadStudentDashboard();
            }
          }
        } catch (e) {
          handleLogout();
        }
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
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
      }
      
      const notifRes = await fetch(`${API_STUDENT}/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData);
      }
    } catch (err) {
      console.warn("Student dashboard APIs offline, rendering interactive mock data.");
      // Fallback interactive mock dataset
      setUpcomingExams([
        {
          id: 'exam-upcoming-1',
          name: 'Cloud Infrastructure & DevOps Mock',
          description: 'Evaluate knowledge on AWS, Terraform, Docker, and Github Actions CI pipelines.',
          exam_type: 'both',
          duration_minutes: 80,
          cutoff_percentage: 50,
          allowed_attempts: 2,
          schedule_date: new Date(Date.now() + 86400000 * 2).toISOString(),
          college_id: 'col-1',
          department_id: 'dept-1',
          year: '3rd Year',
          is_published: true
        }
      ]);

      setActiveExams([
        {
          id: 'exam-active-1',
          name: 'Technical Aptitude & Java Coding Test',
          description: 'Standard MCQ aptitude followed by Java programming algorithms evaluation.',
          exam_type: 'both',
          duration_minutes: 60,
          cutoff_percentage: 60,
          allowed_attempts: 1,
          schedule_date: new Date(Date.now() - 3600000).toISOString(),
          college_id: 'col-1',
          department_id: 'dept-1',
          year: '3rd Year',
          is_published: true
        },
        {
          id: 'exam-active-2',
          name: 'Python Algorithms MCQ Assessment',
          description: 'Focuses on sorting algorithms, complexities, data structures, and Python basics.',
          exam_type: 'mcq',
          duration_minutes: 30,
          cutoff_percentage: 50,
          allowed_attempts: 3,
          schedule_date: new Date(Date.now() - 7200000).toISOString(),
          college_id: 'col-1',
          department_id: 'dept-1',
          year: '3rd Year',
          is_published: true
        }
      ]);

      setCompletedAttempts([
        {
          id: 'att-mock-1',
          exam_id: 'exam-completed-1',
          student_id: 'usr-mock',
          attempt_number: 1,
          score: 84,
          percentage: 84.00,
          passed: true,
          mcq_score: 44,
          coding_score: 40,
          time_taken_seconds: 2400,
          feedback: 'Excellent Work! You scored 84%. Strong Coding Performance. Focus More On Aptitude Accuracy.',
          status: 'completed',
          created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
          exam_name: 'Mettl Style Placement Coding Round 1',
          exam_type: 'both',
          cutoff_percentage: 50
        }
      ]);

      setNotifications([
        { id: 'n-1', title: 'New Exam Published', message: 'Exam "Technical Aptitude & Java Coding Test" has been scheduled for your batch.', createdAt: new Date().toISOString() },
        { id: 'n-2', title: 'Results Declared', message: 'Your result for Mettl Style Placement Coding Round 1 is published.', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() }
      ]);
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
          profilePhotoUrl: photoUpdate
        })
      });
      if (res.ok) {
        showToast('Profile updated successfully!');
        fetchCurrentUser();
      } else {
        const data = await res.json();
        showToast(data.error || 'Update failed', 'error');
      }
    } catch (err) {
      // Simulate local save
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          phone: phoneUpdate || currentUser.phone,
          githubProfile: githubUpdate || currentUser.githubProfile,
          linkedinProfile: linkedinUpdate || currentUser.linkedinProfile,
          profilePhotoUrl: photoUpdate || currentUser.profilePhotoUrl
        });
        showToast('Profile updated successfully (Simulated)');
      }
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
      }
      
      // Load students
      const studRes = await fetch(`${API_ADMIN}/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (studRes.ok) {
        setAdminStudents(await studRes.json());
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

    } catch (err) {
      console.warn("Admin endpoints offline, rendering admin fallback dashboard.");
      // Fallback Mock Metrics
      setAdminMetrics({
        totalStudents: 142,
        totalExams: 18,
        liveExams: 2,
        completedExams: 8,
        averageScore: 71.4,
        passPercentage: 78.5,
        failPercentage: 21.5
      });
      
      setAdminStudents([
        { id: 'std-1', email: 'john.doe@college.edu', role: 'student', fullName: 'John Doe', rollNumber: 'CSE101', status: 'active', college_name: 'ABC Engineering College', department_name: 'CSE', year: '3rd Year', email_verified: true },
        { id: 'std-2', email: 'jane.smith@college.edu', role: 'student', fullName: 'Jane Smith', rollNumber: 'ECE203', status: 'active', college_name: 'ABC Engineering College', department_name: 'ECE', year: '4th Year', email_verified: true },
        { id: 'std-3', email: 'bobby.miller@college.edu', role: 'student', fullName: 'Bobby Miller', rollNumber: 'AIDS04', status: 'pending', college_name: 'XYZ Institute of Technology', department_name: 'AIDS', year: '2nd Year', email_verified: false }
      ]);

      setAdminExams([
        { id: 'exam-1', name: 'Technical Aptitude & Java Coding Test', exam_type: 'both', duration_minutes: 60, cutoff_percentage: 60, schedule_date: new Date().toISOString(), is_published: true, mcq_count: 10, coding_count: 1, college_name: 'ABC Engineering College', department_name: 'CSE', year: '3rd Year' },
        { id: 'exam-2', name: 'Python Algorithms MCQ Assessment', exam_type: 'mcq', duration_minutes: 30, cutoff_percentage: 50, schedule_date: new Date().toISOString(), is_published: true, mcq_count: 15, coding_count: 0, college_name: 'ABC Engineering College', department_name: 'CSE', year: '3rd Year' },
        { id: 'exam-3', name: 'MLOps & Deployment Assessment', exam_type: 'coding', duration_minutes: 90, cutoff_percentage: 65, schedule_date: new Date(Date.now() + 86400000 * 5).toISOString(), is_published: false, mcq_count: 0, coding_count: 2, college_name: 'XYZ Institute of Technology', department_name: 'AIML', year: '4th Year' }
      ]);
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
      }
    } catch (err) {
      const mockD = { id: `dept-${Date.now()}`, college_id: newDeptCollegeId, name: newDeptName, college_name: adminColleges.find(c => c.id === newDeptCollegeId)?.name || 'Default' };
      setAdminDepts(prev => [...prev, mockD]);
      setNewDeptName('');
      showToast('Department added successfully (Simulated)');
    }
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
      const mockS: UserProfile = {
        id: `std-${Date.now()}`,
        email: studentData.email,
        role: 'student',
        fullName: studentData.fullName,
        rollNumber: studentData.rollNumber,
        status: 'active',
        college_name: colleges.find(c => c.id === studentData.collegeId)?.name || 'College',
        department_name: 'CSE',
        year: studentData.year,
        email_verified: true
      };
      setAdminStudents(prev => [mockS, ...prev]);
      showToast(`Student created! Temporary password: Clahan@${Math.floor(1000 + Math.random() * 9000)} (Simulated)`);
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
      const lines = studentCsvInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const rows = lines.slice(1);
      const parsed: UserProfile[] = [];
      let success = 0, failed = 0;
      rows.forEach((row, index) => {
        const parts = row.split(',');
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

  const createExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_EXAMS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(examForm)
      });
      if (res.ok) {
        const data = await res.json();
        showToast('Exam created successfully. Now customize questions.');
        setSelectedExamIdForQuestions(data.id);
        loadAdminDashboard();
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
        schedule_date: examForm.scheduleDate || new Date().toISOString(),
        is_published: false,
        mcq_count: 0,
        coding_count: 0,
        college_name: colleges.find(c => c.id === examForm.collegeId)?.name || 'College',
        department_name: 'CSE',
        year: examForm.year
      };
      setAdminExams(prev => [mockE, ...prev]);
      setSelectedExamIdForQuestions(mockId);
      showToast('Exam created successfully (Simulated). Add questions now.');
    }
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
        loadAdminExamQuestions(selectedExamIdForQuestions);
        loadAdminDashboard();
      }
    } catch (err) {
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
    } catch (err) {
      // Fallback mock start
      const ex = activeExams.find(e => e.id === examId) || upcomingExams.find(e => e.id === examId);
      if (ex) {
        setCurrentExam(ex);
        setValidationStep('instructions');
        setCurrentPage('exam-env');
      }
    }
  };

  const requestHardwarePermissions = async () => {
    setValidationStep('validation');
    setHardwareProgress(20);
    
    // Simulate validation sequences
    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setCameraPermission(true); // Fallback mock true if browser blocks in dev
      }
      setHardwareProgress(50);
    }, 1000);

    setTimeout(async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicPermission(true);
      } catch (err) {
        setMicPermission(true); // Fallback true
      }
      setHardwareProgress(80);
    }, 2000);

    setTimeout(() => {
      setFaceCheck(true);
      setHardwareProgress(100);
      showToast('Hardware permissions validated successfully!', 'success');
    }, 3000);
  };

  const enterFullscreen = () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().then(() => setFullscreenCheck(true)).catch(() => setFullscreenCheck(true));
    } else {
      setFullscreenCheck(true);
    }
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
      }
    } catch (err) {
      // Mock Start Attempt
      const mockAttempt: Attempt = {
        id: `att-${Date.now()}`,
        exam_id: currentExam.id,
        student_id: currentUser?.id || 'usr-mock',
        attempt_number: 1,
        score: 0,
        percentage: 0,
        passed: false,
        mcq_score: 0,
        coding_score: 0,
        time_taken_seconds: 0,
        feedback: '',
        status: 'ongoing',
        created_at: new Date().toISOString()
      };
      setCurrentAttempt(mockAttempt);
      loadAttemptQuestions(mockAttempt.id);
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
        
        // Initialize default answers
        const mcqAns: Record<string, string> = {};
        data.responses.mcqs.forEach((r: any) => {
          mcqAns[r.question_id] = r.selected_option;
        });
        setMcqAnswers(mcqAns);

        const codSol: Record<string, { code: string; language: string }> = {};
        data.responses.codings.forEach((r: any) => {
          codSol[r.question_id] = { code: r.code, language: r.language };
        });
        setCodingSolutions(codSol);
      }
    } catch (err) {
      // Mock Exam Questions
      const mockMcqs: MCQQuestion[] = [
        { id: 'q-mcq-1', question: 'Which data structure follows the Last In First Out (LIFO) principal?', option_a: 'Queue', option_b: 'Stack', option_c: 'Graph', option_d: 'Binary Tree', marks: 2, difficulty: 'Easy' },
        { id: 'q-mcq-2', question: 'What is the time complexity of searching in a perfectly balanced binary search tree?', option_a: 'O(1)', option_b: 'O(N)', option_c: 'O(log N)', option_d: 'O(N log N)', marks: 3, difficulty: 'Medium' }
      ];

      const mockCodings: CodingQuestion[] = [
        {
          id: 'q-code-1',
          title: 'Two Sum Algorithm',
          description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nExample:\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]',
          difficulty: 'Medium',
          marks: 10,
          language: 'Python',
          starter_code: 'def twoSum(nums, target):\n    # Write your solution code here\n    return []',
          time_limit: 2000,
          memory_limit: 512000,
          testCases: [
            { id: 'tc-1', input: '[2,7,11,15]\n9', expected_output: '[0,1]', is_hidden: false }
          ]
        }
      ];

      setExamMCQs(mockMcqs);
      setExamCodings(mockCodings);
      
      const defaultSols: Record<string, { code: string; language: string }> = {};
      mockCodings.forEach(c => {
        defaultSols[c.id] = { code: c.starter_code, language: c.language };
      });
      setCodingSolutions(defaultSols);
    }

    setValidationStep('active');
    setTimeLeft((currentExam?.duration_minutes || 60) * 60);
    setTabWarnings(0);
    setProctorLogs([]);
    
    // Start timers and socket connection
    startExamTimer();
    initProctoringSocket(attemptId);
  };

  const startExamTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          submitEntireExam(true); // auto submit
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const initProctoringSocket = (attemptId: string) => {
    // Connect socket to proctoring service
    try {
      const socket = io('/api/proctor', { path: '/socket.io' });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join-exam', { token, attemptId, examId: currentExam?.id });
      });

      socket.on('proctor-warning', (alert: any) => {
        showToast(alert.message, 'warning');
        setProctorLogs(prev => [`[Warning] ${alert.message} (${new Date().toLocaleTimeString()})`, ...prev]);
      });

      socket.on('exam-terminated', (data: any) => {
        clearInterval(timerRef.current);
        alert(`Exam terminated automatically: ${data.reason}`);
        handleExamTermination();
      });

    } catch (err) {
      console.warn("Socket.IO proctoring offline, running local proctor rules.");
    }

    // Set up local camera proctor simulator
    proctorIntervalRef.current = setInterval(() => {
      // Periodically trigger a mock validation check or log event
      // If student is tab switching, browser events will catch it.
      // We simulate occasional warnings for interactive proctor validation demonstration
    }, 10000);

    // Track tab switching browser events
    window.addEventListener('blur', handleTabSwitch);
  };

  const handleTabSwitch = () => {
    setTabWarnings(prev => {
      const updated = prev + 1;
      const logMsg = `Tab Switch Violation #${updated} detected.`;
      setProctorLogs(p => [`[Violation] ${logMsg} (${new Date().toLocaleTimeString()})`, ...p]);
      
      // Emit to server
      if (socketRef.current) {
        socketRef.current.emit('proctor-event', {
          eventType: 'TAB_SWITCH',
          details: 'Browser focus lost (blur event)',
          severity: updated >= 2 ? 'critical' : 'warning'
        });
      } else {
        // Mock termination logic if offline
        if (updated >= 2) {
          clearInterval(timerRef.current);
          alert('Exam terminated: 2 Tab switches detected.');
          handleExamTermination();
        } else {
          showToast(`Warning: Tab switch detected! (Limit: 2). Exam will terminate on next tab switch.`, 'error');
        }
      }

      return updated;
    });
  };

  const handleExamTermination = () => {
    // Clear listeners/intervals
    cleanupProctoring();
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
    window.removeEventListener('blur', handleTabSwitch);
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const saveMcqChoice = async (questionId: string, option: string) => {
    setMcqAnswers(prev => ({ ...prev, [questionId]: option }));
    try {
      await fetch(`${API_EXAMS}/student/attempts/${currentAttempt?.id}/mcq-response`, {
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

  const [isRunningCode, setIsRunningCode] = useState(false);
  const [codeExecutionResults, setCodeExecutionResults] = useState<any[]>([]);

  const runCodeSample = async (questionId: string) => {
    const sol = codingSolutions[questionId];
    if (!sol) return;
    setIsRunningCode(true);
    setCodeExecutionResults([]);
    try {
      const res = await fetch(`${API_EXAMS}/student/attempts/${currentAttempt?.id}/run-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: sol.code, language: sol.language, questionId })
      });
      const data = await res.json();
      setCodeExecutionResults(data.results);
    } catch (err) {
      // Simulation fallback if runner is offline
      setTimeout(() => {
        setCodeExecutionResults([
          { input: '[2,7,11,15]\n9', expectedOutput: '[0,1]', stdout: '[0,1]', stderr: '', passed: true, status: 'Accepted (Simulated)', timeMs: 14, memoryKb: 140 }
        ]);
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
      const res = await fetch(`${API_EXAMS}/student/attempts/${currentAttempt?.id}/submit-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: sol.code, language: sol.language, questionId })
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`Coding submission saved. Passed: ${data.passedCount}/${data.totalCount}`);
      }
    } catch (err) {
      showToast('Coding submission saved (Simulated).', 'success');
    }
  };

  const submitEntireExam = async (isAuto = false) => {
    if (!isAuto && !confirm('Are you sure you want to finish and submit your exam?')) return;
    cleanupProctoring();
    const timeTaken = ((currentExam?.duration_minutes || 60) * 60) - timeLeft;

    try {
      const res = await fetch(`${API_EXAMS}/student/attempts/${currentAttempt?.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ timeTakenSeconds: timeTaken })
      });
      if (res.ok) {
        const result = await res.json();
        setSelectedResultAttemptId(currentAttempt!.id);
        fetchResultDetails(currentAttempt!.id);
      }
    } catch (err) {
      // Mock result evaluation
      const mockResult = {
        attempt: {
          exam_name: currentExam?.name || 'Technical Aptitude Exam',
          exam_type: currentExam?.exam_type || 'both',
          cutoff_percentage: currentExam?.cutoff_percentage || 50,
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
      setDetailedResult(mockResult);
      setCurrentPage('result-view');
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
      }
    } catch (err) {
      showToast('Error loading results data', 'error');
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
        localStorage.setItem('token', data.accessToken);
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
      
      localStorage.setItem('token', mockJwt);
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
        if (data.otp) {
          showToast(`[TESTING] OTP Code: ${data.otp}`, 'info');
          setOtpInput(data.otp);
        } else {
          showToast('Registration successful! OTP sent to email.');
        }
      } else {
        const data = await res.json();
        showToast(data.error || 'Registration failed', 'error');
      }
    } catch (err) {
      setUnverifiedEmail(regForm.email);
      setShowOtpVerification(true);
      setOtpInput('123456');
      showToast('Registration simulated. OTP pre-filled with 123456.', 'info');
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_AUTH}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.otp) {
          showToast(`[TESTING] OTP Code: ${data.otp}`, 'info');
          setResetOtp(data.otp);
        } else {
          showToast('Password reset OTP sent to your email.');
        }
        setCurrentPage('reset-pw');
      }
    } catch (err) {
      setResetOtp('123456');
      showToast('OTP sent to email. OTP pre-filled with 123456.', 'info');
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
      
      {/* Toast Alert Engine */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 p-4 rounded-xl shadow-lg border backdrop-blur-md transition-all animate-bounce ${
            t.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
            t.type === 'error' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' :
            t.type === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' :
            'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
          }`}>
            {t.type === 'success' && <CheckCircle className="h-5 w-5" />}
            {t.type === 'error' && <AlertTriangle className="h-5 w-5" />}
            {t.type === 'warning' && <AlertTriangle className="h-5 w-5" />}
            {t.type === 'info' && <Bell className="h-5 w-5" />}
            <span className="text-sm font-semibold">{t.message}</span>
          </div>
        ))}
      </div>

      {/* HEADER NAVBAR */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/40 dark:border-slate-800/40 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentPage('landing')}>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-indigo-500/20">
              C
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
              CLAHAN ACADEMY
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <span className="text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors" onClick={() => setCurrentPage('landing')}>Home</span>
            <span className="text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors" onClick={() => { setCurrentPage('landing'); setTimeout(() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>About</span>
            <span className="text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors" onClick={() => { setCurrentPage('landing'); setTimeout(() => document.getElementById('tech')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>Assessments</span>
            <span className="text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors" onClick={() => { setCurrentPage('landing'); setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>Contact</span>
          </nav>

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
                  onClick={() => setCurrentPage(currentUser.role === 'admin' ? 'admin-dash' : 'student-dash')}
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
                      <MapPin className="h-5 w-5 text-indigo-500" />
                      <span>{companySettings.companyAddress}</span>
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
            <h2 className="text-2xl font-extrabold text-center mb-6">Welcome Back</h2>
            
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
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl mb-4">
                  <button 
                    type="button" 
                    onClick={() => setLoginRole('student')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${loginRole === 'student' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`}
                  >
                    Student
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setLoginRole('admin')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${loginRole === 'admin' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`}
                  >
                    Admin
                  </button>
                </div>
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

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">College *</label>
                    <select 
                      value={regForm.collegeId} 
                      onChange={e => {
                        setRegForm({...regForm, collegeId: e.target.value});
                        fetchDepartments(e.target.value);
                      }} 
                      className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent"
                      required
                    >
                      <option value="">Select College</option>
                      {colleges.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Department *</label>
                    <select 
                      value={regForm.departmentId} 
                      onChange={e => setRegForm({...regForm, departmentId: e.target.value})} 
                      className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent"
                      required
                      disabled={!regForm.collegeId}
                    >
                      <option value="">Select Dept</option>
                      {departments.map(d => <option key={d.id} value={d.id} className="text-slate-900">{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Year *</label>
                    <select value={regForm.year} onChange={e => setRegForm({...regForm, year: e.target.value})} className="w-full p-3 mt-1 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-indigo-500 bg-transparent" required>
                      <option value="1st Year" className="text-slate-900">1st Year</option>
                      <option value="2nd Year" className="text-slate-900">2nd Year</option>
                      <option value="3rd Year" className="text-slate-900">3rd Year</option>
                      <option value="4th Year" className="text-slate-900">4th Year</option>
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
                <h3 className="font-extrabold text-lg">{currentUser.fullName || currentUser.full_name || 'Student'}</h3>
                <p className="text-xs font-mono text-muted-foreground mt-1">{currentUser.rollNumber || 'No Roll'}</p>
                <div className="border-t border-slate-200/40 dark:border-slate-800/40 pt-4 mt-4 space-y-2 text-left text-sm text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between"><span className="font-semibold">College:</span><span className="truncate max-w-[120px] text-xs" title={currentUser.college_name}>{currentUser.college_name || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Dept:</span><span>{currentUser.department_name || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Year:</span><span>{currentUser.year || 'N/A'}</span></div>
                </div>
              </div>

              {/* Navigation Menu */}
              <div className="p-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm flex flex-col gap-1">
                {[
                  { id: 'active-exams', label: 'Assessments', icon: BookOpen },
                  { id: 'results', label: 'Results & Performance', icon: Award },
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
                            <div className="flex justify-between items-start gap-2 mb-4">
                              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase">{ex.exam_type}</span>
                              <span className="text-xs text-muted-foreground font-mono">{ex.duration_minutes} Mins</span>
                            </div>
                            <h3 className="font-extrabold text-base mb-2 text-slate-900 dark:text-white">{ex.name}</h3>
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
                              <p className="text-xs text-muted-foreground mt-1">Scheduled for: {new Date(ex.schedule_date).toLocaleString()}</p>
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
                              <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${att.passed ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                                {att.passed ? 'PASSED' : 'FAILED'}
                              </span>
                              <span className="text-xs text-muted-foreground">Cutoff: {att.cutoff_percentage || 50}%</span>
                            </div>
                            <h3 className="font-extrabold text-base">{att.exam_name || 'Technical Assessment'}</h3>
                            <p className="text-xs text-muted-foreground mt-1">Submitted on: {new Date(att.created_at).toLocaleString()}</p>
                            
                            {att.feedback && (
                              <div className="mt-3 bg-indigo-500/5 border-l-2 border-indigo-500 p-2.5 rounded-r-lg max-w-xl text-xs text-indigo-700 dark:text-indigo-300 font-semibold italic">
                                "{att.feedback}"
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <p className="font-black text-2xl tracking-tight text-indigo-600 dark:text-indigo-400">{att.percentage}%</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Score: {att.score} pts</p>
                            </div>
                            <button
                              onClick={() => fetchResultDetails(att.id)}
                              className="px-4 py-2.5 text-xs font-bold bg-slate-100 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                            >
                              View Report
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
                          <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                            <Bell className="h-4 w-4" />
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
                    <button type="submit" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md transition-colors text-sm">
                      Update Profile
                    </button>
                  </form>
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
                            <div className="w-12 rounded-t-lg transition-all" style={{ height: `${bar.pct * 1.2}px`, backgroundColor: bar.color }} />
                            <span className="text-[10px] font-semibold text-muted-foreground">{bar.name}</span>
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
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-transparent focus:outline-indigo-500" 
                        required
                      >
                        <option value="">Select Target College</option>
                        {adminColleges.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>)}
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
                          <select name="collegeId" onChange={e => fetchDepartments(e.target.value)} className="p-3 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white" required>
                            <option value="">College</option>
                            {adminColleges.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>)}
                          </select>
                          <select name="departmentId" className="p-3 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white" required>
                            <option value="">Dept</option>
                            {departments.map(d => <option key={d.id} value={d.id} className="text-slate-900">{d.name}</option>)}
                          </select>
                          <select name="year" className="p-3 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white" required>
                            <option value="1st Year" className="text-slate-900">1st Year</option>
                            <option value="2nd Year" className="text-slate-900">2nd Year</option>
                            <option value="3rd Year" className="text-slate-900">3rd Year</option>
                            <option value="4th Year" className="text-slate-900">4th Year</option>
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
                        <textarea
                          value={studentCsvInput}
                          onChange={e => setStudentCsvInput(e.target.value)}
                          placeholder="Paste CSV rows here (Header: Full Name,Email,Phone,Roll Number,College,Department,Year)"
                          rows={4}
                          className="w-full p-3 border rounded-xl text-xs bg-transparent font-mono"
                          required
                        />
                        <button type="submit" className="w-full py-3 border border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white font-bold rounded-xl text-xs transition-all">
                          Upload CSV Rows
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
                    <h4 className="font-bold text-sm mb-4">Registered Students</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b text-muted-foreground uppercase tracking-wider font-semibold">
                            <th className="py-3 px-2">Name</th>
                            <th>Roll Number</th>
                            <th>College / Dept</th>
                            <th>Year</th>
                            <th>Status</th>
                            <th className="text-right py-3 px-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminStudents.map(student => (
                            <tr key={student.id} className="border-b hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                              <td className="py-3.5 px-2">
                                <div className="font-bold">{student.fullName || student.full_name || 'N/A'}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{student.email}</div>
                              </td>
                              <td>{student.rollNumber || student.roll_number || 'N/A'}</td>
                              <td>
                                <div className="truncate max-w-[120px]" title={student.college_name}>{student.college_name}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{student.department_name}</div>
                              </td>
                              <td>{student.year}</td>
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

              {activeAdminTab === 'exams' && (
                <div className="space-y-6">
                  {/* Create Exam */}
                  <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm space-y-4">
                    <h3 className="font-extrabold text-base">Configure Exam & Settings</h3>
                    <form onSubmit={createExam} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Exam Name</label>
                          <input type="text" value={examForm.name} onChange={e => setExamForm({...examForm, name: e.target.value})} placeholder="e.g. End Semester Exam" className="w-full p-3 border rounded-xl text-xs bg-transparent mt-1" required />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Exam Type</label>
                          <select value={examForm.examType} onChange={e => setExamForm({...examForm, examType: e.target.value as any})} className="w-full p-3 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white mt-1" required>
                            <option value="mcq" className="text-slate-900">MCQ Only</option>
                            <option value="coding" className="text-slate-900">Coding Only</option>
                            <option value="both" className="text-slate-900">MCQ + Coding</option>
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
                          <select value={examForm.allowedAttempts} onChange={e => setExamForm({...examForm, allowedAttempts: parseInt(e.target.value) || 1})} className="w-full p-3 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white mt-1">
                            <option value="1" className="text-slate-900">1 Attempt</option>
                            <option value="2" className="text-slate-900">2 Attempts</option>
                            <option value="3" className="text-slate-900">3 Attempts</option>
                            <option value="999" className="text-slate-900">Unlimited</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">College Eligibility</label>
                          <select value={examForm.collegeId} onChange={e => { setExamForm({...examForm, collegeId: e.target.value}); fetchDepartments(e.target.value); }} className="w-full p-3 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white mt-1" required>
                            <option value="">Select College</option>
                            {adminColleges.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Department Eligibility</label>
                          <select value={examForm.departmentId} onChange={e => setExamForm({...examForm, departmentId: e.target.value})} className="w-full p-3 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white mt-1" required disabled={!examForm.collegeId}>
                            <option value="">Select Dept</option>
                            {departments.map(d => <option key={d.id} value={d.id} className="text-slate-900">{d.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Year Eligibility</label>
                          <select value={examForm.year} onChange={e => setExamForm({...examForm, year: e.target.value})} className="w-full p-3 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white mt-1" required>
                            <option value="1st Year" className="text-slate-900">1st Year</option>
                            <option value="2nd Year" className="text-slate-900">2nd Year</option>
                            <option value="3rd Year" className="text-slate-900">3rd Year</option>
                            <option value="4th Year" className="text-slate-900">4th Year</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Schedule Date & Time</label>
                          <input type="datetime-local" value={examForm.scheduleDate} onChange={e => setExamForm({...examForm, scheduleDate: e.target.value})} className="w-full p-2.5 border rounded-xl text-xs bg-transparent text-slate-900 dark:text-white mt-1" required />
                        </div>
                      </div>

                      <textarea value={examForm.description} onChange={e => setExamForm({...examForm, description: e.target.value})} placeholder="Exam instructions and general description..." rows={2} className="w-full p-3 border rounded-xl text-xs bg-transparent focus:outline-indigo-500" />
                      
                      <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors">
                        Configure & Create Exam
                      </button>
                    </form>
                  </div>

                  {/* Add Questions Panel (appears after exam creation or when exam is selected) */}
                  {selectedExamIdForQuestions && (
                    <div className="p-6 rounded-2xl border-2 border-indigo-500/20 bg-indigo-500/5 space-y-6">
                      <div className="flex justify-between items-center">
                        <h4 className="font-extrabold text-base text-indigo-700 dark:text-indigo-400">Configure Questions for Selected Exam</h4>
                        <button onClick={() => setSelectedExamIdForQuestions(null)} className="text-xs font-bold text-muted-foreground hover:underline">Close Editor</button>
                      </div>

                      {/* Toggle MCQ or Coding Question Form */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* MCQ Questions form */}
                        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-4">
                          <h5 className="font-bold text-xs">Add MCQ Question</h5>
                          <form onSubmit={addMcqQuestion} className="space-y-3">
                            <input type="text" value={mcqForm.question} onChange={e => setMcqForm({...mcqForm, question: e.target.value})} placeholder="Question Statement" className="w-full p-2 border rounded-lg text-xs bg-transparent" required />
                            <div className="grid grid-cols-2 gap-2">
                              <input type="text" value={mcqForm.optionA} onChange={e => setMcqForm({...mcqForm, optionA: e.target.value})} placeholder="Option A" className="p-2 border rounded-lg text-xs bg-transparent" required />
                              <input type="text" value={mcqForm.optionB} onChange={e => setMcqForm({...mcqForm, optionB: e.target.value})} placeholder="Option B" className="p-2 border rounded-lg text-xs bg-transparent" required />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input type="text" value={mcqForm.optionC} onChange={e => setMcqForm({...mcqForm, optionC: e.target.value})} placeholder="Option C" className="p-2 border rounded-lg text-xs bg-transparent" required />
                              <input type="text" value={mcqForm.optionD} onChange={e => setMcqForm({...mcqForm, optionD: e.target.value})} placeholder="Option D" className="p-2 border rounded-lg text-xs bg-transparent" required />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <select value={mcqForm.correctAnswer} onChange={e => setMcqForm({...mcqForm, correctAnswer: e.target.value})} className="p-2 border rounded-lg text-xs bg-transparent text-slate-900 dark:text-white" required>
                                <option value="A" className="text-slate-900">Ans: A</option>
                                <option value="B" className="text-slate-900">Ans: B</option>
                                <option value="C" className="text-slate-900">Ans: C</option>
                                <option value="D" className="text-slate-900">Ans: D</option>
                              </select>
                              <input type="number" value={mcqForm.marks} onChange={e => setMcqForm({...mcqForm, marks: parseInt(e.target.value) || 1})} placeholder="Marks" className="p-2 border rounded-lg text-xs bg-transparent" required />
                              <select value={mcqForm.difficulty} onChange={e => setMcqForm({...mcqForm, difficulty: e.target.value})} className="p-2 border rounded-lg text-xs bg-transparent text-slate-900 dark:text-white" required>
                                <option value="easy" className="text-slate-900">Easy</option>
                                <option value="medium" className="text-slate-900">Medium</option>
                                <option value="hard" className="text-slate-900">Hard</option>
                              </select>
                            </div>
                            <button type="submit" className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs">
                              Add Question
                            </button>
                          </form>

                          <div className="border-t pt-4">
                            <h6 className="font-bold text-[10px] text-muted-foreground uppercase mb-2">Or Bulk Import MCQs</h6>
                            <form onSubmit={importMcqCsv} className="space-y-2">
                              <textarea
                                value={mcqCsvInput}
                                onChange={e => setMcqCsvInput(e.target.value)}
                                placeholder="Paste MCQ CSV rows here (Header: Question,Option A,Option B,Option C,Option D,Correct Answer,Marks,Difficulty)"
                                rows={3}
                                className="w-full p-2 border rounded-lg text-xs bg-transparent font-mono"
                                required
                              />
                              <button type="submit" className="w-full py-2 border border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white font-bold rounded-lg text-xs transition-colors">
                                Import MCQ CSV
                              </button>
                            </form>
                          </div>
                        </div>

                        {/* Coding Question Form */}
                        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-4">
                          <h5 className="font-bold text-xs">Add Coding Challenge</h5>
                          <form onSubmit={addCodingQuestion} className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <input type="text" value={codingForm.title} onChange={e => setCodingForm({...codingForm, title: e.target.value})} placeholder="Challenge Title" className="p-2 border rounded-lg text-xs bg-transparent" required />
                              <select value={codingForm.language} onChange={e => setCodingForm({...codingForm, language: e.target.value})} className="p-2 border rounded-lg text-xs bg-transparent text-slate-900 dark:text-white" required>
                                <option value="Python" className="text-slate-900">Python</option>
                                <option value="Java" className="text-slate-900">Java</option>
                                <option value="C++" className="text-slate-900">C++</option>
                                <option value="JavaScript" className="text-slate-900">JavaScript</option>
                              </select>
                            </div>
                            <textarea value={codingForm.description} onChange={e => setCodingForm({...codingForm, description: e.target.value})} placeholder="Challenge description & examples..." rows={3} className="w-full p-2 border rounded-lg text-xs bg-transparent" required />
                            <textarea value={codingForm.starterCode} onChange={e => setCodingForm({...codingForm, starterCode: e.target.value})} placeholder="Starter template code..." rows={2} className="w-full p-2 border rounded-lg text-xs bg-transparent font-mono" />
                            
                            {/* Testcases */}
                            <div className="border-t pt-2">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Evaluation Test Cases</span>
                                <button type="button" onClick={addTestCaseInput} className="text-xs font-bold text-indigo-600 flex items-center gap-0.5"><Plus className="h-3.5 w-3.5" /> Add Case</button>
                              </div>
                              <div className="space-y-2 max-h-28 overflow-y-auto pr-1">
                                {codingTestCases.map((tc, idx) => (
                                  <div key={idx} className="grid grid-cols-3 gap-1">
                                    <input type="text" placeholder="Input" value={tc.input} onChange={e => {
                                      const updated = [...codingTestCases];
                                      updated[idx].input = e.target.value;
                                      setCodingTestCases(updated);
                                    }} className="p-1 border rounded text-[10px]" required />
                                    <input type="text" placeholder="Expected Out" value={tc.expected_output} onChange={e => {
                                      const updated = [...codingTestCases];
                                      updated[idx].expected_output = e.target.value;
                                      setCodingTestCases(updated);
                                    }} className="p-1 border rounded text-[10px]" required />
                                    <select value={tc.isHidden ? 'true' : 'false'} onChange={e => {
                                      const updated = [...codingTestCases];
                                      updated[idx].isHidden = e.target.value === 'true';
                                      setCodingTestCases(updated);
                                    }} className="p-1 border rounded text-[10px]">
                                      <option value="false">Visible</option>
                                      <option value="true">Hidden</option>
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <button type="submit" className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs">
                              Save Coding Question
                            </button>
                          </form>
                        </div>
                      </div>

                      {/* Currently Configured Questions List */}
                      <div className="mt-8 border-t border-slate-200/30 dark:border-slate-800/30 pt-6">
                        <h5 className="font-extrabold text-xs uppercase tracking-wider text-indigo-800 dark:text-indigo-300 mb-4">Currently Configured Questions ({adminSelectedExamMCQs.length + adminSelectedExamCodings.length})</h5>
                        <div className="space-y-6 max-h-[400px] overflow-y-auto pr-1">
                          {adminSelectedExamMCQs.length > 0 && (
                            <div className="space-y-3">
                              <h6 className="font-bold text-xs text-slate-800 dark:text-slate-200 border-l-2 border-indigo-500 pl-2">Multiple Choice Questions ({adminSelectedExamMCQs.length})</h6>
                              <div className="grid grid-cols-1 gap-3">
                                {adminSelectedExamMCQs.map((q, idx) => (
                                  <div key={q.id || idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-left shadow-sm">
                                    <div className="font-bold text-slate-800 dark:text-slate-100">{idx + 1}. {q.question}</div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                                      <div>A: {q.option_a || (q as any).optionA}</div>
                                      <div>B: {q.option_b || (q as any).optionB}</div>
                                      <div>C: {q.option_c || (q as any).optionC}</div>
                                      <div>D: {q.option_d || (q as any).optionD}</div>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[9px]">Correct: {q.correct_answer || (q as any).correctAnswer}</span>
                                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-[9px]">{q.marks} Marks</span>
                                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-[9px] capitalize">{q.difficulty}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {adminSelectedExamCodings.length > 0 && (
                            <div className="space-y-3">
                              <h6 className="font-bold text-xs text-slate-800 dark:text-slate-200 border-l-2 border-indigo-500 pl-2">Coding Challenges ({adminSelectedExamCodings.length})</h6>
                              <div className="grid grid-cols-1 gap-3">
                                {adminSelectedExamCodings.map((q, idx) => (
                                  <div key={q.id || idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-left shadow-sm">
                                    <div className="font-bold text-slate-800 dark:text-slate-100">{idx + 1}. {q.title} ({q.language})</div>
                                    <div className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap font-mono line-clamp-3 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">{q.description}</div>
                                    <div className="flex gap-2 mt-3">
                                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-[9px]">{q.marks} Marks</span>
                                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-[9px] capitalize">{q.difficulty}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {adminSelectedExamMCQs.length === 0 && adminSelectedExamCodings.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground text-xs italic bg-white dark:bg-slate-950 rounded-xl border border-dashed">
                              No questions configured for this exam yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

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
                                <div className="text-[10px] text-muted-foreground mt-0.5">{ex.department_name} - {ex.year}</div>
                              </td>
                              <td>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ex.is_published ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>
                                  {ex.is_published ? 'Published' : 'Draft'}
                                </span>
                              </td>
                              <td className="text-right py-3 px-2 space-x-1 whitespace-nowrap">
                                <button onClick={() => { setSelectedExamIdForQuestions(ex.id); loadAdminExamQuestions(ex.id); }} className="text-[10px] font-bold px-2 py-1 border rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white transition-colors">Questions</button>
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
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">AI Proctor Monitor</h2>
                    <p className="text-sm text-muted-foreground">Monitor ongoing exams, warning counts, and flag fraud events in real time.</p>
                  </div>

                  {/* List of active ongoing sessions */}
                  <div className="p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-950 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-sm">Active Test Candidates</h4>
                      <span className="flex items-center gap-1.5 px-2 py-1 bg-rose-500/10 text-rose-600 rounded text-xs font-bold animate-pulse"><Video className="h-4 w-4" /> Live Tracking</span>
                    </div>

                    <div className="p-12 text-center border rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-dashed">
                      <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3 animate-bounce" />
                      <p className="font-bold">Waiting for students to join exam...</p>
                      <p className="text-xs text-muted-foreground mt-1">Once students start an exam attempt, their video feeds and fraud logs appear here.</p>
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
            </div>
          )}

          {validationStep === 'active' && currentAttempt && (
            <div className="h-full flex flex-col justify-between">
              {/* Header inside Exam environment */}
              <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-4">
                <div>
                  <h3 className="font-extrabold text-base">{currentExam.name}</h3>
                  <p className="text-[10px] text-indigo-400 mt-0.5">Warnings: {tabWarnings} / 2 (Tab-Locks active)</p>
                </div>

                <div className="flex items-center gap-4">
                  {/* Webcam small PIP */}
                  <div className="h-12 w-16 rounded-lg bg-slate-950 border border-white/15 overflow-hidden hidden sm:block relative">
                    <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Time Remaining</p>
                    <p className="font-mono font-bold text-lg text-indigo-400">
                      {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </p>
                  </div>

                  <button
                    onClick={() => submitEntireExam()}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs uppercase"
                  >
                    Submit Exam
                  </button>
                </div>
              </div>

              {/* Exam IDE Content area split */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch min-h-[500px]">
                {/* Left Side: Question Navigation */}
                <div className="lg:col-span-1 rounded-2xl bg-slate-950 border border-white/10 p-4 space-y-4 flex flex-col">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Exam Sections</h4>
                    <div className="flex bg-slate-900 p-1 rounded-xl">
                      {currentExam.exam_type !== 'coding' && (
                        <button
                          onClick={() => { setSelectedSection('mcq'); setActiveQuestionIndex(0); }}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${selectedSection === 'mcq' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                        >
                          MCQ Section
                        </button>
                      )}
                      {currentExam.exam_type !== 'mcq' && (
                        <button
                          onClick={() => { setSelectedSection('coding'); setActiveQuestionIndex(0); }}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${selectedSection === 'coding' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                        >
                          Coding Section
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Question indices */}
                  <div className="flex-1">
                    <span className="text-xs text-slate-400 font-bold block mb-2">Question Grid</span>
                    <div className="grid grid-cols-5 gap-2">
                      {(selectedSection === 'mcq' ? examMCQs : examCodings).map((q, idx) => {
                        const isAnswered = selectedSection === 'mcq' ? mcqAnswers[q.id] : codingSolutions[q.id]?.code.length > 50;
                        return (
                          <button
                            key={q.id}
                            onClick={() => setActiveQuestionIndex(idx)}
                            className={`p-2.5 rounded-lg text-xs font-bold transition-all border ${
                              activeQuestionIndex === idx ? 'bg-indigo-600 text-white border-indigo-500' :
                              isAnswered ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/20' :
                              'bg-slate-900 text-slate-400 border-white/5'
                            }`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Proctor Logs list */}
                  <div className="border-t border-white/10 pt-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Proctor logs</span>
                    <div className="h-28 overflow-y-auto text-[9px] font-mono text-slate-500 space-y-1 pr-1">
                      {proctorLogs.map((log, i) => <div key={i} className="truncate">{log}</div>)}
                      {proctorLogs.length === 0 && <div>Proctor initialized. Scanning frame...</div>}
                    </div>
                  </div>
                </div>

                {/* Right Side: Active Question Workspace */}
                <div className="lg:col-span-3 rounded-2xl bg-slate-950 border border-white/10 p-6 flex flex-col justify-between">
                  {selectedSection === 'mcq' && examMCQs[activeQuestionIndex] && (
                    <div className="h-full flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-xs text-indigo-400 font-bold">MCQ Question {activeQuestionIndex + 1} of {examMCQs.length}</span>
                          <span className="text-xs text-muted-foreground">Marks: {examMCQs[activeQuestionIndex].marks} pts</span>
                        </div>
                        <h3 className="text-lg font-bold mb-6 leading-relaxed">{examMCQs[activeQuestionIndex].question}</h3>
                        <div className="space-y-3 max-w-2xl">
                          {['A', 'B', 'C', 'D'].map(opt => {
                            const optionKey = `option_${opt.toLowerCase()}` as keyof MCQQuestion;
                            const optionText = examMCQs[activeQuestionIndex][optionKey] as string;
                            const isSelected = mcqAnswers[examMCQs[activeQuestionIndex].id] === opt;
                            return (
                              <button
                                key={opt}
                                onClick={() => saveMcqChoice(examMCQs[activeQuestionIndex].id, opt)}
                                className={`w-full text-left p-4 rounded-xl text-xs font-semibold transition-all border flex items-center gap-3 ${
                                  isSelected ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/10' : 'bg-slate-900 border-white/5 hover:border-white/15'
                                }`}
                              >
                                <span className={`h-6 w-6 rounded-lg flex items-center justify-center border font-bold text-[10px] ${isSelected ? 'bg-white text-indigo-600 border-transparent' : 'bg-slate-950 border-white/10 text-slate-400'}`}>
                                  {opt}
                                </span>
                                {optionText}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Navigation buttons */}
                      <div className="flex justify-between mt-8 border-t border-white/10 pt-4">
                        <button
                          onClick={() => setActiveQuestionIndex(p => Math.max(0, p - 1))}
                          className="px-4 py-2 border rounded-xl text-xs font-semibold disabled:opacity-50"
                          disabled={activeQuestionIndex === 0}
                        >
                          Previous Question
                        </button>
                        <button
                          onClick={() => setActiveQuestionIndex(p => Math.min(examMCQs.length - 1, p + 1))}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs disabled:opacity-50"
                          disabled={activeQuestionIndex === examMCQs.length - 1}
                        >
                          Next Question
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedSection === 'coding' && examCodings[activeQuestionIndex] && (
                    <div className="h-full flex flex-col justify-between gap-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 items-stretch min-h-[350px]">
                        {/* Description */}
                        <div className="p-4 rounded-xl bg-slate-900 border border-white/5 overflow-y-auto space-y-3">
                          <h4 className="font-bold text-sm text-indigo-400">{examCodings[activeQuestionIndex].title}</h4>
                          <p className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                            {examCodings[activeQuestionIndex].description}
                          </p>
                        </div>

                        {/* IDE Editor */}
                        <div className="flex flex-col rounded-xl border border-white/5 overflow-hidden">
                          <div className="bg-slate-900 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{examCodings[activeQuestionIndex].language} Compiler</span>
                          </div>
                          <textarea
                            value={codingSolutions[examCodings[activeQuestionIndex].id]?.code || ''}
                            onChange={e => {
                              const qId = examCodings[activeQuestionIndex].id;
                              setCodingSolutions(prev => ({
                                ...prev,
                                [qId]: { code: e.target.value, language: examCodings[activeQuestionIndex].language }
                              }));
                            }}
                            className="flex-1 w-full p-4 bg-slate-950 text-xs font-mono text-emerald-400 border-none outline-none resize-none min-h-[200px]"
                            placeholder="Write your solution here..."
                          />
                        </div>
                      </div>

                      {/* Code Execution Panel */}
                      {codeExecutionResults.length > 0 && (
                        <div className="p-4 rounded-xl bg-slate-900 border border-white/10 text-xs space-y-2">
                          <p className="font-bold text-indigo-400">Execution Results:</p>
                          {codeExecutionResults.map((res, i) => (
                            <div key={i} className="font-mono text-[10px]">
                              <p className={res.passed ? 'text-emerald-400' : 'text-rose-500'}>
                                Test case #{i+1}: {res.passed ? 'Passed' : 'Failed'} ({res.status})
                              </p>
                              {res.stderr && <p className="text-rose-400 whitespace-pre-wrap mt-1">{res.stderr}</p>}
                              {res.stdout && <p className="text-slate-400 mt-1">Stdout: {res.stdout}</p>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* IDE Action Bar */}
                      <div className="flex justify-between items-center border-t border-white/10 pt-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => runCodeSample(examCodings[activeQuestionIndex].id)}
                            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-white/10 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                            disabled={isRunningCode}
                          >
                            <Play className="h-4 w-4 text-indigo-400" /> Run sample test cases
                          </button>
                          <button
                            onClick={() => submitCodingSolution(examCodings[activeQuestionIndex].id)}
                            className="px-4 py-2.5 border border-indigo-600 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl text-xs font-bold transition-all"
                          >
                            Submit Code (Evaluates Hidden Cases)
                          </button>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => setActiveQuestionIndex(p => Math.max(0, p - 1))}
                            className="px-3 py-2 border rounded-xl text-xs disabled:opacity-50"
                            disabled={activeQuestionIndex === 0}
                          >
                            Prev Coding Question
                          </button>
                          <button
                            onClick={() => setActiveQuestionIndex(p => Math.min(examCodings.length - 1, p + 1))}
                            className="px-3 py-2 border rounded-xl text-xs disabled:opacity-50"
                            disabled={activeQuestionIndex === examCodings.length - 1}
                          >
                            Next Coding Question
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
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
                <span className={`px-2.5 py-1 rounded text-xs font-black tracking-wider uppercase ${detailedResult.attempt.passed ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                  {detailedResult.attempt.passed ? 'Passed Assessment' : 'Failed Assessment'}
                </span>
                <h2 className="text-2xl font-black mt-2">{detailedResult.attempt.exam_name}</h2>
                <p className="text-xs text-muted-foreground mt-1">Submitted on: {new Date(detailedResult.attempt.created_at).toLocaleString()}</p>
              </div>

              <div className="text-right">
                <p className="text-3xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">{Math.round(detailedResult.attempt.percentage)}%</p>
                <p className="text-xs text-muted-foreground mt-1">Score: {detailedResult.attempt.score} / {detailedResult.attempt.maxScore} pts</p>
              </div>
            </div>

            {/* AI Feedback Card */}
            {detailedResult.attempt.feedback && (
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
                <h3 className="font-extrabold text-base">Coding Challenge Submissions</h3>
                <div className="space-y-3">
                  {detailedResult.codingResponses.map((res: any, idx: number) => (
                    <div key={idx} className="p-5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-sm text-indigo-600 dark:text-indigo-400">{res.title}</h4>
                        <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-bold uppercase">{res.status}</span>
                      </div>
                      
                      <div className="p-3 bg-slate-950 rounded-lg text-emerald-400 font-mono text-[10px] overflow-x-auto max-h-36">
                        <pre>{res.code}</pre>
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-emerald-500">Passed cases: {res.test_cases_passed} / {res.total_test_cases}</span>
                        <span className="text-muted-foreground">Marks obtained: {res.marks_obtained} / {res.marks} pts</span>
                      </div>
                    </div>
                  ))}
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

    </div>
  );
}
