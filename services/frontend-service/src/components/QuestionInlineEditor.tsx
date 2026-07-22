import React, { useState } from 'react';
import { Plus, Trash2, Check, X, Code, Image as ImageIcon } from 'lucide-react';
import { RichTextEditor } from './RichTextEditor';

interface MCQQuestionData {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_a_image?: string;
  option_b_image?: string;
  option_c_image?: string;
  option_d_image?: string;
  correct_answer?: string;
  marks: number;
  difficulty: string;
  content_blocks?: any[];
  images?: string[];
}

interface CodingQuestionData {
  id: string;
  title: string;
  description: string;
  language: string;
  starter_code: string;
  marks: number;
  difficulty: string;
  time_limit: number;
  memory_limit: number;
  testCases?: Array<{ input: string; expected_output: string; isHidden?: boolean; is_hidden?: boolean }>;
  images?: string[];
}

interface QuestionInlineEditorProps {
  type: 'mcq' | 'coding';
  initialData: any;
  onSave: (updatedData: any) => Promise<void>;
  onCancel: () => void;
}

export const QuestionInlineEditor: React.FC<QuestionInlineEditorProps> = ({
  type,
  initialData,
  onSave,
  onCancel
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // MCQ state
  const [mcqForm, setMcqForm] = useState<MCQQuestionData>({
    id: initialData.id,
    question: initialData.question || '',
    option_a: initialData.option_a || '',
    option_b: initialData.option_b || '',
    option_c: initialData.option_c || '',
    option_d: initialData.option_d || '',
    option_a_image: initialData.option_a_image || '',
    option_b_image: initialData.option_b_image || '',
    option_c_image: initialData.option_c_image || '',
    option_d_image: initialData.option_d_image || '',
    correct_answer: initialData.correct_answer || 'A',
    marks: initialData.marks || 1,
    difficulty: initialData.difficulty || 'medium',
    content_blocks: initialData.content_blocks || [],
    images: initialData.images || []
  });

  // Coding state
  const [codingForm, setCodingForm] = useState<CodingQuestionData>({
    id: initialData.id,
    title: initialData.title || '',
    description: initialData.description || '',
    language: initialData.language || 'Python',
    starter_code: initialData.starter_code || '# Write code here',
    marks: initialData.marks || 10,
    difficulty: initialData.difficulty || 'medium',
    time_limit: initialData.time_limit || 2000,
    memory_limit: initialData.memory_limit || 512000,
    images: initialData.images || []
  });

  const [codingTestCases, setCodingTestCases] = useState<Array<{ input: string; expected_output: string; isHidden: boolean }>>(
    (initialData.testCases || []).map((tc: any) => ({
      input: tc.input || '',
      expected_output: tc.expected_output || '',
      isHidden: tc.isHidden !== undefined ? tc.isHidden : (tc.is_hidden !== undefined ? tc.is_hidden : false)
    }))
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (type === 'mcq') {
        await onSave(mcqForm);
      } else {
        await onSave({ ...codingForm, testCases: codingTestCases });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-5 border-2 border-indigo-500/40 bg-indigo-950/10 dark:bg-slate-950 rounded-2xl space-y-4 my-2 shadow-lg animate-fadeIn">
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
        <h4 className="font-extrabold text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
          <Code className="h-4 w-4" /> Edit {type === 'mcq' ? 'Multiple Choice Question' : 'Coding Challenge'}
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-4 text-xs">
        {type === 'mcq' ? (
          /* MCQ Form */
          <>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Question Prompt</label>
              <textarea
                value={mcqForm.question}
                onChange={e => setMcqForm({ ...mcqForm, question: e.target.value })}
                className="w-full p-3 border rounded-xl text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium"
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {['A', 'B', 'C', 'D'].map(opt => {
                const optKey = `option_${opt.toLowerCase()}` as keyof MCQQuestionData;
                const imgKey = `option_${opt.toLowerCase()}_image` as keyof MCQQuestionData;

                return (
                  <div key={opt} className="p-3 border rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-indigo-500">Option {opt}</span>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        <input
                          type="radio"
                          name="correctAnswerInline"
                          checked={mcqForm.correct_answer === opt}
                          onChange={() => setMcqForm({ ...mcqForm, correct_answer: opt })}
                        />
                        Correct Option
                      </label>
                    </div>
                    <input
                      type="text"
                      value={String(mcqForm[optKey] || '')}
                      onChange={e => setMcqForm({ ...mcqForm, [optKey]: e.target.value })}
                      placeholder={`Option ${opt} text`}
                      className="w-full p-2 border rounded-lg text-xs bg-transparent border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                      required
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={String(mcqForm[imgKey] || '')}
                        onChange={e => setMcqForm({ ...mcqForm, [imgKey]: e.target.value })}
                        placeholder={`Option ${opt} Image URL (Optional)`}
                        className="w-full p-1.5 border rounded-lg text-[10px] bg-transparent border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Award Marks</label>
                <input
                  type="number"
                  value={mcqForm.marks}
                  onChange={e => setMcqForm({ ...mcqForm, marks: parseInt(e.target.value) || 1 })}
                  className="w-full p-2 border rounded-xl text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  min={1}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Difficulty</label>
                <select
                  value={mcqForm.difficulty}
                  onChange={e => setMcqForm({ ...mcqForm, difficulty: e.target.value })}
                  className="w-full p-2 border rounded-xl text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
          </>
        ) : (
          /* Coding Form */
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Challenge Title</label>
                <input
                  type="text"
                  value={codingForm.title}
                  onChange={e => setCodingForm({ ...codingForm, title: e.target.value })}
                  className="w-full p-2.5 border rounded-xl text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Programming Language</label>
                <select
                  value={codingForm.language}
                  onChange={e => setCodingForm({ ...codingForm, language: e.target.value })}
                  className="w-full p-2.5 border rounded-xl text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="Python">Python</option>
                  <option value="C++">C++</option>
                  <option value="Java">Java</option>
                  <option value="JavaScript">JavaScript</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Problem Description</label>
              <textarea
                value={codingForm.description}
                onChange={e => setCodingForm({ ...codingForm, description: e.target.value })}
                className="w-full p-3 border rounded-xl text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                rows={4}
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Starter Code Skeleton</label>
              <textarea
                value={codingForm.starter_code}
                onChange={e => setCodingForm({ ...codingForm, starter_code: e.target.value })}
                className="w-full p-3 border rounded-xl text-xs font-mono bg-slate-900 text-emerald-400 border-slate-800"
                rows={4}
              />
            </div>

            {/* Test Cases Editor */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-center">
                <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200">Standard Multiline I/O Test Cases</h5>
                <button
                  type="button"
                  onClick={() => setCodingTestCases(prev => [...prev, { input: '', expected_output: '', isHidden: false }])}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add Test Case
                </button>
              </div>

              {codingTestCases.map((tc, tcIdx) => (
                <div key={tcIdx} className="p-3 border rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[10px] text-indigo-500">Test Case #{tcIdx + 1}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer text-[10px] font-bold">
                        <input
                          type="checkbox"
                          checked={tc.isHidden}
                          onChange={e => {
                            const next = [...codingTestCases];
                            next[tcIdx].isHidden = e.target.checked;
                            setCodingTestCases(next);
                          }}
                        />
                        Hidden Test Case
                      </label>
                      <button
                        type="button"
                        onClick={() => setCodingTestCases(prev => prev.filter((_, i) => i !== tcIdx))}
                        className="text-rose-500 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] uppercase font-bold text-muted-foreground">STDIN Input</label>
                      <textarea
                        value={tc.input}
                        onChange={e => {
                          const next = [...codingTestCases];
                          next[tcIdx].input = e.target.value;
                          setCodingTestCases(next);
                        }}
                        className="w-full p-2 border rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-muted-foreground">Expected STDOUT</label>
                      <textarea
                        value={tc.expected_output}
                        onChange={e => {
                          const next = [...codingTestCases];
                          next[tcIdx].expected_output = e.target.value;
                          setCodingTestCases(next);
                        }}
                        className="w-full p-2 border rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                        rows={2}
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};
