import React, { useState } from 'react';
import { ContentBlock, ContentBlockType } from '../types/richQuestion';
import { 
  Type, Image as ImageIcon, Code, Table as TableIcon, Plus, Trash2, 
  ArrowUp, ArrowDown, Upload, Eye, RefreshCw, FileText
} from 'lucide-react';

interface RichTextEditorProps {
  contentBlocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  onUploadImage?: (file: File) => Promise<string>;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  contentBlocks,
  onChange,
  onUploadImage
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  const addBlock = (type: ContentBlockType) => {
    const newBlock: ContentBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type,
      content: type === 'table' ? 'Header 1 | Header 2\nValue 1 | Value 2' : '',
      caption: '',
      language: type === 'code' ? 'Python' : undefined
    };
    onChange([...contentBlocks, newBlock]);
  };

  const updateBlock = (id: string, updates: Partial<ContentBlock>) => {
    onChange(
      contentBlocks.map(b => (b.id === id ? { ...b, ...updates } : b))
    );
  };

  const removeBlock = (id: string) => {
    onChange(contentBlocks.filter(b => b.id !== id));
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...contentBlocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;
    onChange(newBlocks);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>, blockId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (onUploadImage) {
      try {
        const url = await onUploadImage(file);
        updateBlock(blockId, { content: url });
      } catch (err) {
        console.error('Upload failed:', err);
      }
    } else {
      // Fallback: Read as Data URL
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          updateBlock(blockId, { content: reader.result });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl space-y-4">
      {/* Editor Header Toolbar */}
      <div className="bg-slate-950 p-3 flex flex-wrap items-center justify-between border-b border-white/10 gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Rich Content Block Builder
          </span>
          <span className="text-[10px] text-slate-500 font-mono">({contentBlocks.length} Blocks)</span>
        </div>

        {/* Add Block Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => addBlock('text')}
            className="px-2.5 py-1 bg-slate-850 hover:bg-slate-800 border border-white/10 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
          >
            <Type className="h-3.5 w-3.5 text-indigo-400" /> Text Block
          </button>

          <button
            type="button"
            onClick={() => addBlock('image')}
            className="px-2.5 py-1 bg-slate-850 hover:bg-slate-800 border border-white/10 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
          >
            <ImageIcon className="h-3.5 w-3.5 text-emerald-400" /> Image
          </button>

          <button
            type="button"
            onClick={() => addBlock('code')}
            className="px-2.5 py-1 bg-slate-850 hover:bg-slate-800 border border-white/10 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
          >
            <Code className="h-3.5 w-3.5 text-amber-400" /> Code
          </button>

          <button
            type="button"
            onClick={() => addBlock('table')}
            className="px-2.5 py-1 bg-slate-850 hover:bg-slate-800 border border-white/10 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
          >
            <TableIcon className="h-3.5 w-3.5 text-purple-400" /> Table
          </button>
        </div>
      </div>

      {/* Blocks List */}
      <div className="p-4 space-y-4">
        {contentBlocks.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-white/10 rounded-2xl bg-slate-950/40 text-slate-500 space-y-2">
            <Plus className="h-8 w-8 mx-auto text-slate-600 animate-pulse" />
            <p className="text-xs font-semibold">No content blocks added yet.</p>
            <p className="text-[10px]">Click a button above to add Rich Text, Diagrams, Code snippets, or Tables.</p>
          </div>
        )}

        {contentBlocks.map((block, idx) => (
          <div key={block.id} className="p-4 bg-slate-950/80 border border-white/10 rounded-2xl space-y-3 shadow-inner">
            {/* Block Controls Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-white flex items-center justify-center text-[10px]">
                  {idx + 1}
                </span>
                {block.type} Block
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveBlock(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded disabled:opacity-30"
                  title="Move Block Up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(idx, 'down')}
                  disabled={idx === contentBlocks.length - 1}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded disabled:opacity-30"
                  title="Move Block Down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(block.id)}
                  className="p-1 hover:bg-rose-500/20 text-rose-400 rounded transition-colors ml-2"
                  title="Delete Block"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Block Content Editing Fields */}
            {block.type === 'text' && (
              <textarea
                value={block.content}
                onChange={e => updateBlock(block.id, { content: e.target.value })}
                placeholder="Enter rich question text or markdown content..."
                rows={3}
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
              />
            )}

            {block.type === 'image' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={block.content}
                    onChange={e => updateBlock(block.id, { content: e.target.value })}
                    placeholder="Enter Image URL or Upload below..."
                    className="flex-1 bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white font-mono placeholder-slate-500"
                  />
                  <label className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-extrabold cursor-pointer transition-colors flex items-center gap-1.5 shrink-0">
                    <Upload className="h-3.5 w-3.5" /> Upload File
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                      onChange={e => handleImageFileChange(e, block.id)}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={block.caption || ''}
                    onChange={e => updateBlock(block.id, { caption: e.target.value })}
                    placeholder="Figure caption (optional)"
                    className="bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-slate-300"
                  />
                  <input
                    type="text"
                    value={block.altText || ''}
                    onChange={e => updateBlock(block.id, { altText: e.target.value })}
                    placeholder="Alt description for screen readers"
                    className="bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-slate-300"
                  />
                </div>

                {block.content && (
                  <div className="p-2 bg-slate-900 rounded-xl border border-white/5 inline-block">
                    <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Image Preview</span>
                    <img src={block.content} alt={block.caption || 'Preview'} className="max-h-32 object-contain rounded-lg" />
                  </div>
                )}
              </div>
            )}

            {block.type === 'code' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-mono uppercase font-bold">Language:</span>
                  <select
                    value={block.language || 'Python'}
                    onChange={e => updateBlock(block.id, { language: e.target.value })}
                    className="bg-slate-900 border border-white/10 text-xs font-bold text-indigo-400 rounded-lg p-1.5"
                  >
                    <option value="Python">Python</option>
                    <option value="Java">Java</option>
                    <option value="C++">C++</option>
                    <option value="JavaScript">JavaScript</option>
                    <option value="SQL">SQL</option>
                  </select>
                </div>
                <textarea
                  value={block.content}
                  onChange={e => updateBlock(block.id, { content: e.target.value })}
                  placeholder="Paste code snippet here..."
                  rows={4}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs font-mono text-emerald-400 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {block.type === 'table' && (
              <textarea
                value={block.content}
                onChange={e => updateBlock(block.id, { content: e.target.value })}
                placeholder="Header 1 | Header 2&#10;Row 1 Col 1 | Row 1 Col 2"
                rows={3}
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
