import React, { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Copy, Edit, Layers, AlertCircle } from 'lucide-react';

export interface SectionItem {
  id: string;
  name: string;
  description?: string;
  section_type: 'mcq' | 'coding' | 'descriptive';
  duration_minutes?: number | string | null;
  randomize_questions?: boolean;
  is_mandatory?: boolean;
  enable_cutoff?: boolean;
  cutoff_mode?: 'percentage' | 'marks';
  cutoff_percentage?: number | string | null;
  cutoff_marks?: number | string | null;
  question_count?: number;
}

interface SectionBuilderProps {
  sections: SectionItem[];
  onSaveSection: (section: SectionItem) => void;
  onDeleteSection: (sectionId: string) => void;
  onDuplicateSection: (sectionId: string) => void;
  onReorderSections: (newSections: SectionItem[]) => void;
}

export const SectionBuilder: React.FC<SectionBuilderProps> = ({
  sections,
  onSaveSection,
  onDeleteSection,
  onDuplicateSection,
  onReorderSections
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState<SectionItem>({
    id: '',
    name: '',
    description: '',
    section_type: 'mcq',
    duration_minutes: '',
    randomize_questions: false,
    is_mandatory: true,
    enable_cutoff: false,
    cutoff_mode: 'percentage',
    cutoff_percentage: '',
    cutoff_marks: ''
  });

  const openCreateForm = () => {
    setForm({
      id: `sec-${Date.now()}`,
      name: '',
      description: '',
      section_type: 'mcq',
      duration_minutes: '',
      randomize_questions: false,
      is_mandatory: true,
      enable_cutoff: false,
      cutoff_mode: 'percentage',
      cutoff_percentage: '',
      cutoff_marks: ''
    });
    setEditingSectionId(null);
    setIsModalOpen(true);
  };

  const openEditForm = (sec: SectionItem) => {
    setForm({ ...sec });
    setEditingSectionId(sec.id);
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSection(form);
    setIsModalOpen(false);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const next = [...sections];
    const temp = next[idx];
    next[idx] = next[idx - 1];
    next[idx - 1] = temp;
    onReorderSections(next);
  };

  const moveDown = (idx: number) => {
    if (idx >= sections.length - 1) return;
    const next = [...sections];
    const temp = next[idx];
    next[idx] = next[idx + 1];
    next[idx + 1] = temp;
    onReorderSections(next);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center bg-white dark:bg-slate-950 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Assessment Sections ({sections.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Organize questions into structured sections (MCQ, Coding, Descriptive). Configure per-section durations & cutoffs.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-md transition-all hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" /> Add Section
        </button>
      </div>

      {/* Inline Creation / Edit Form Modal */}
      {isModalOpen && (
        <form
          onSubmit={handleFormSubmit}
          className="p-6 border-2 border-indigo-500/30 bg-white dark:bg-slate-950 rounded-2xl shadow-xl space-y-4 animate-in fade-in duration-200"
        >
          <h4 className="font-extrabold text-sm text-indigo-600 dark:text-indigo-400 border-b border-slate-200 dark:border-slate-800 pb-3">
            {editingSectionId ? 'Edit Section Properties' : 'Create New Section'}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400">
                Section Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full p-3 border rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                placeholder="e.g. Technical Aptitude"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400">
                Question Type Allowed *
              </label>
              <select
                value={form.section_type}
                onChange={e => setForm({ ...form, section_type: e.target.value as any })}
                className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
              >
                <option value="mcq">MCQ (Multiple Choice)</option>
                <option value="coding">Coding Challenge</option>
                <option value="descriptive">Descriptive Answer</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400">
                Manual Duration (Mins, Optional)
              </label>
              <input
                type="number"
                value={form.duration_minutes || ''}
                onChange={e => setForm({ ...form, duration_minutes: e.target.value })}
                className="w-full p-3 border rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                placeholder="Blank for Auto-Allocation"
                min={1}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400">
              Section Instructions / Guidelines
            </label>
            <textarea
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
              placeholder="Provide candidate instructions for this section..."
            />
          </div>

          <div className="flex flex-wrap gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200 select-none">
              <input
                type="checkbox"
                checked={form.randomize_questions || false}
                onChange={e => setForm({ ...form, randomize_questions: e.target.checked })}
                className="h-4 w-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700 bg-transparent"
              />
              Randomize question order
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200 select-none">
              <input
                type="checkbox"
                checked={form.is_mandatory !== false}
                onChange={e => setForm({ ...form, is_mandatory: e.target.checked })}
                className="h-4 w-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700 bg-transparent"
              />
              Mandatory section
            </label>
          </div>

          {/* Section Cutoff Settings */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-100 select-none">
              <input
                type="checkbox"
                checked={form.enable_cutoff || false}
                onChange={e => setForm({ ...form, enable_cutoff: e.target.checked })}
                className="h-4 w-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700 bg-transparent"
              />
              Enable Section Cutoff Threshold
            </label>

            {form.enable_cutoff && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Cutoff Percentage (%)</label>
                  <input
                    type="number"
                    value={form.cutoff_percentage || ''}
                    onChange={e => setForm({ ...form, cutoff_percentage: e.target.value })}
                    placeholder="e.g. 40"
                    className="w-full p-2.5 border rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800 mt-1"
                    min={0}
                    max={100}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Or Cutoff Marks</label>
                  <input
                    type="number"
                    value={form.cutoff_marks || ''}
                    onChange={e => setForm({ ...form, cutoff_marks: e.target.value })}
                    placeholder="e.g. 10"
                    className="w-full p-2.5 border rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800 mt-1"
                    min={0}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-bold border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl shadow-md transition-all"
            >
              {editingSectionId ? 'Save Changes' : 'Create Section'}
            </button>
          </div>
        </form>
      )}

      {/* Sections List */}
      <div className="space-y-4">
        {sections.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-3">
            <Layers className="h-10 w-10 text-slate-400 mx-auto" />
            <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200">No sections created yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Define logical sections (e.g. Aptitude, Technical MCQ, Core Coding) to organize your assessment questions.
            </p>
            <button
              type="button"
              onClick={openCreateForm}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Create First Section
            </button>
          </div>
        ) : (
          sections.map((sec, idx) => {
            const isCollapsed = collapsedSections[sec.id] || false;
            return (
              <div
                key={sec.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden transition-all"
              >
                <div className="p-5 flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-900">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(sec.id)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title={isCollapsed ? 'Expand Section' : 'Collapse Section'}
                    >
                      {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </button>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">{sec.name}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          sec.section_type === 'mcq' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800' :
                          sec.section_type === 'coding' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' :
                          'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                        }`}>
                          {sec.section_type}
                        </span>
                        {sec.is_mandatory !== false && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 font-bold">
                            Mandatory
                          </span>
                        )}
                        {sec.duration_minutes && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono font-bold">
                            {sec.duration_minutes} Mins
                          </span>
                        )}
                      </div>
                      {sec.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{sec.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions & Controls */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveUp(idx)}
                      className="p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-30 text-slate-700 dark:text-slate-300 transition-colors"
                      title="Move Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sections.length - 1}
                      onClick={() => moveDown(idx)}
                      className="p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-30 text-slate-700 dark:text-slate-300 transition-colors"
                      title="Move Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateSection(sec.id)}
                      className="p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 transition-colors"
                      title="Duplicate Section"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditForm(sec)}
                      className="p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-indigo-600 dark:text-indigo-400 transition-colors"
                      title="Edit Section"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSection(sec.id)}
                      className="p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-500 transition-colors"
                      title="Delete Section"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="p-4 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap justify-between items-center gap-2">
                    <div>
                      <span>Timing: {sec.duration_minutes ? `${sec.duration_minutes} Mins (Fixed)` : 'Auto-Allocated from Remaining Time'}</span>
                    </div>
                    {sec.enable_cutoff && (
                      <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Cutoff: {sec.cutoff_marks ? `${sec.cutoff_marks} Marks` : `${sec.cutoff_percentage || 40}%`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
