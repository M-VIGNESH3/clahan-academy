import React, { useState } from 'react';
import { GenericQuestion } from '../types/richQuestion';
import { RichContentRenderer } from './RichContentRenderer';
import { Eye, Monitor, Smartphone, CheckCircle, AlertTriangle } from 'lucide-react';

interface QuestionPreviewProps {
  question: GenericQuestion;
  type: 'mcq' | 'coding';
  onImageClick?: (url: string, alt?: string) => void;
}

export const QuestionPreview: React.FC<QuestionPreviewProps> = ({
  question,
  type,
  onImageClick
}) => {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  // Pre-save Validation checks
  const validationErrors: string[] = [];
  if (type === 'mcq') {
    if (!question.question?.trim() && (!question.content_blocks || question.content_blocks.length === 0)) {
      validationErrors.push('Question statement text or content block is required.');
    }
    if (!question.option_a?.trim() && !question.option_a_image) validationErrors.push('Option A text or image is missing.');
    if (!question.option_b?.trim() && !question.option_b_image) validationErrors.push('Option B text or image is missing.');
    if (!question.option_c?.trim() && !question.option_c_image) validationErrors.push('Option C text or image is missing.');
    if (!question.option_d?.trim() && !question.option_d_image) validationErrors.push('Option D text or image is missing.');
    if (!question.correct_answer) validationErrors.push('Correct answer choice is not selected.');
  } else {
    if (!question.title?.trim()) validationErrors.push('Coding question title is required.');
    if (!question.description?.trim() && (!question.content_blocks || question.content_blocks.length === 0)) {
      validationErrors.push('Problem description or content block is required.');
    }
  }

  return (
    <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl space-y-4">
      {/* Top Preview Header */}
      <div className="bg-slate-950 p-3.5 flex flex-wrap items-center justify-between border-b border-white/10 gap-3">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-extrabold text-white uppercase tracking-wider">Candidate Live Preview</span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => setViewMode('desktop')}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'desktop' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" /> Desktop Mode
          </button>
          <button
            type="button"
            onClick={() => setViewMode('mobile')}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'mobile' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Student Mobile
          </button>
        </div>
      </div>

      {/* Validation Status Banner */}
      <div className="px-4">
        {validationErrors.length === 0 ? (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <CheckCircle className="h-4 w-4" /> Ready to Save • All question validation criteria satisfied.
          </div>
        ) : (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1 text-xs text-rose-400">
            <div className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Validation Warnings ({validationErrors.length})
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Render Frame Container */}
      <div className="p-4 md:p-6 flex justify-center bg-slate-950/40">
        <div className={`w-full transition-all duration-300 ${viewMode === 'mobile' ? 'max-w-sm' : 'max-w-3xl'}`}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6">
            
            {/* Format Tags Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-extrabold rounded-lg border border-indigo-500/20 uppercase tracking-wider">
                Question Preview
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {question.marks || 1} Pt(s)
              </span>
            </div>

            {/* Question Body */}
            {type === 'coding' && question.title && (
              <h3 className="text-base font-extrabold text-white">{question.title}</h3>
            )}

            <RichContentRenderer
              blocks={question.content_blocks}
              rawText={type === 'mcq' ? question.question : question.description}
              legacyImages={question.images}
              onImageClick={onImageClick}
            />

            {/* Options list for MCQ */}
            {type === 'mcq' && (
              <div className="grid grid-cols-1 gap-2.5 pt-2">
                {(['A', 'B', 'C', 'D'] as const).map(optKey => {
                  const txt = question[`option_${optKey.toLowerCase()}` as keyof GenericQuestion] as string;
                  const img = question[`option_${optKey.toLowerCase()}_image` as keyof GenericQuestion] as string;
                  const isCorrect = question.correct_answer === optKey;

                  return (
                    <div
                      key={optKey}
                      className={`p-3.5 rounded-xl border text-xs flex items-center gap-3 transition-all ${
                        isCorrect
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-bold'
                          : 'bg-slate-950 border-white/5 text-slate-300'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs border ${
                        isCorrect ? 'bg-emerald-500 text-white border-transparent' : 'bg-slate-800 border-white/10 text-slate-400'
                      }`}>
                        {optKey}
                      </span>
                      
                      <div className="flex-1 space-y-1">
                        {txt && <span className="block font-medium">{txt}</span>}
                        {img && (
                          <img 
                            src={img} 
                            alt={`Option ${optKey}`} 
                            onClick={() => onImageClick && onImageClick(img, `Option ${optKey}`)}
                            className="max-h-24 object-contain rounded-lg border border-white/10 cursor-pointer hover:scale-105 transition-transform" 
                          />
                        )}
                      </div>

                      {isCorrect && (
                        <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">
                          Correct Choice
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
