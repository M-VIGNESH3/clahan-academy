import React from 'react';
import { ContentBlock } from '../types/richQuestion';
import { Code, Image as ImageIcon, Table as TableIcon, Terminal, Copy, Check } from 'lucide-react';

interface RichContentRendererProps {
  blocks?: ContentBlock[];
  rawText?: string;
  legacyImages?: string[];
  onImageClick?: (imageUrl: string, altText?: string) => void;
  className?: string;
}

export const RichContentRenderer: React.FC<RichContentRendererProps> = ({
  blocks,
  rawText,
  legacyImages,
  onImageClick,
  className = ''
}) => {
  const [copiedCodeId, setCopiedCodeId] = React.useState<string | null>(null);

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  let parsedBlocks: ContentBlock[] = [];
  if (Array.isArray(blocks)) {
    parsedBlocks = blocks;
  } else if (typeof blocks === 'string' && (blocks as string).trim().length > 0) {
    try {
      const parsed = JSON.parse(blocks);
      if (Array.isArray(parsed)) parsedBlocks = parsed;
    } catch (e) {
      parsedBlocks = [];
    }
  }

  let parsedImages: string[] = [];
  if (Array.isArray(legacyImages)) {
    parsedImages = legacyImages.filter(img => typeof img === 'string' && img.trim().length > 0);
  } else if (typeof legacyImages === 'string' && (legacyImages as string).trim().length > 0) {
    try {
      const parsed = JSON.parse(legacyImages);
      if (Array.isArray(parsed)) parsedImages = parsed;
    } catch (e) {
      parsedImages = [legacyImages];
    }
  }

  // 1. If explicit content blocks exist and are non-empty
  if (parsedBlocks && parsedBlocks.length > 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        {parsedBlocks.map((block, index) => {
          if (!block || typeof block !== 'object') return null;
          const key = block.id || `block-${index}`;
          switch (block.type) {
            case 'text':
              return (
                <div 
                  key={key} 
                  className="text-sm md:text-base text-slate-100 dark:text-slate-100 leading-relaxed whitespace-pre-wrap font-sans"
                >
                  {block.content}
                </div>
              );

            case 'image':
              return (
                <div key={key} className="my-3 space-y-1">
                  <div 
                    onClick={() => onImageClick && onImageClick(block.content, block.caption || block.altText)}
                    className="relative group cursor-pointer inline-block max-w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-lg"
                  >
                    <img 
                      src={block.content} 
                      alt={block.altText || 'Question Diagram'} 
                      loading="lazy"
                      className="max-w-full h-auto max-h-[450px] object-contain rounded-xl transition-transform duration-200 group-hover:scale-[1.01]"
                    />
                    <div className="absolute inset-0 bg-indigo-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-xs font-bold text-white backdrop-blur-[2px]">
                      <ImageIcon className="h-4 w-4 text-indigo-400" />
                      Click to Zoom / Expand
                    </div>
                  </div>
                  {block.caption && (
                    <p className="text-[11px] text-slate-400 italic font-mono px-1">
                      Figure: {block.caption}
                    </p>
                  )}
                </div>
              );

            case 'code':
              return (
                <div key={key} className="my-3 bg-slate-950 border border-white/10 rounded-xl overflow-hidden shadow-md font-mono text-xs">
                  <div className="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-white/5 text-[10px] text-slate-400">
                    <span className="font-extrabold uppercase text-indigo-400 flex items-center gap-1.5">
                      <Code className="h-3.5 w-3.5" />
                      {block.language || 'Code Snippet'}
                    </span>
                    <button
                      onClick={() => handleCopyCode(block.content, key)}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors text-[9px] font-bold"
                    >
                      {copiedCodeId === key ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy Code
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 text-emerald-400 overflow-x-auto whitespace-pre leading-normal">
                    <code>{block.content}</code>
                  </pre>
                </div>
              );

            case 'table':
              return (
                <div key={key} className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-slate-900 shadow-md">
                  {block.tableData && block.tableData.length > 0 ? (
                    <table className="w-full text-xs font-sans text-left text-slate-200">
                      <thead>
                        <tr className="bg-slate-950 border-b border-white/10 text-indigo-400 font-extrabold">
                          {block.tableData[0].map((cell, cIdx) => (
                            <th key={cIdx} className="p-3 border-r last:border-r-0 border-white/5">{cell}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.tableData.slice(1).map((row, rIdx) => (
                          <tr key={rIdx} className="border-b last:border-b-0 border-white/5 hover:bg-slate-850/50">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-3 border-r last:border-r-0 border-white/5 font-mono">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-xs font-mono text-slate-300 whitespace-pre-wrap">{block.content}</div>
                  )}
                </div>
              );

            case 'math':
              return (
                <div key={key} className="my-3 p-3 bg-slate-900/80 border border-indigo-500/30 rounded-xl text-center font-mono text-indigo-300 text-sm shadow-inner">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Mathematical Formula</span>
                  <div className="text-base font-extrabold text-white tracking-wide">{block.content}</div>
                </div>
              );

            case 'video':
            case 'audio':
            case 'pdf':
            case 'interactive':
              return (
                <div key={key} className="p-4 bg-slate-900 border border-white/10 rounded-xl text-xs text-indigo-300 font-mono">
                  [{block.type.toUpperCase()} BLOCK]: {block.content}
                </div>
              );

            default:
              return (
                <div key={key} className="text-sm text-slate-200 leading-relaxed font-sans">
                  {block.content}
                </div>
              );
          }
        })}
      </div>
    );
  }

  // 2. Legacy Fallback: rawText string & attached legacyImages array
  return (
    <div className={`space-y-4 ${className}`}>
      {rawText && (
        <div className="text-sm md:text-base text-slate-100 leading-relaxed whitespace-pre-wrap font-sans">
          {rawText}
        </div>
      )}

      {parsedImages && parsedImages.length > 0 && (
        <div className="flex flex-wrap gap-4 pt-2">
          {parsedImages.map((imgUrl, i) => (
            <div 
              key={i} 
              onClick={() => onImageClick && onImageClick(imgUrl, `Question Attachment #${i + 1}`)}
              className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-md"
            >
              <img 
                src={imgUrl} 
                alt={`Question diagram ${i + 1}`} 
                loading="lazy" 
                className="max-w-full h-auto max-h-[350px] object-contain rounded-xl transition-transform duration-200 group-hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-indigo-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-xs font-bold text-white backdrop-blur-[2px]">
                <ImageIcon className="h-4 w-4 text-indigo-400" />
                Click to Zoom
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
