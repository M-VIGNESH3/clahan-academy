import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { RichContentRenderer } from '../RichContentRenderer';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class QuestionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[QuestionErrorBoundary Caught Error]:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-slate-200 space-y-3 font-sans my-4">
          <div className="flex items-center gap-3 text-rose-400 font-extrabold text-sm">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>Question Render Notice</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            This question could not be displayed completely due to a content formatting issue. You can safely continue to the next question.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 bg-slate-900 border border-white/10 hover:bg-slate-800 rounded-lg text-xs font-bold text-slate-300 flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
            Retry Rendering
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface SafeOptionRendererProps {
  label: 'A' | 'B' | 'C' | 'D';
  optionText?: string | null;
  optionImage?: string | null;
  isSelected: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
  onImageClick?: (url: string, alt: string) => void;
}

export const SafeOptionRenderer: React.FC<SafeOptionRendererProps> = ({
  label,
  optionText,
  optionImage,
  isSelected,
  isDisabled = false,
  onSelect,
  onImageClick
}) => {
  const [imageError, setImageError] = React.useState(false);

  const hasText = optionText !== undefined && optionText !== null && String(optionText).trim().length > 0;
  const hasImage = optionImage !== undefined && optionImage !== null && String(optionImage).trim().length > 0 && !imageError;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isDisabled}
      className={`w-full text-left p-4 rounded-xl text-xs md:text-sm font-medium transition-all border flex items-start md:items-center gap-4 ${
        isSelected
          ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-lg shadow-indigo-600/15 ring-2 ring-indigo-500/40 font-bold'
          : 'bg-slate-950 border-white/5 text-slate-300 hover:border-white/20 hover:bg-slate-800'
      } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`h-7 w-7 rounded-lg flex items-center justify-center border font-mono font-black text-xs transition-colors flex-shrink-0 mt-0.5 md:mt-0 ${
        isSelected ? 'bg-indigo-500 text-white border-transparent' : 'bg-slate-900 border-white/10 text-slate-400'
      }`}>
        {label}
      </span>

      <div className="flex-1 space-y-2 overflow-hidden">
        {hasText && (
          <span className="block leading-relaxed break-words font-sans">
            {String(optionText)}
          </span>
        )}

        {hasImage && (
          <div className="relative group inline-block max-w-full">
            <img
              src={String(optionImage)}
              alt={`Option ${label} Diagram`}
              loading="lazy"
              onError={() => setImageError(true)}
              onClick={(e) => {
                e.stopPropagation();
                if (onImageClick && optionImage) {
                  onImageClick(String(optionImage), `Option ${label} Diagram`);
                }
              }}
              className="max-h-40 object-contain rounded-lg border border-white/10 hover:scale-[1.02] transition-transform bg-slate-900"
            />
            <div className="absolute inset-0 bg-indigo-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-[10px] font-bold text-white rounded-lg pointer-events-none">
              <ImageIcon className="h-3.5 w-3.5 text-indigo-400" />
              Zoom Image
            </div>
          </div>
        )}

        {imageError && (
          <div className="p-2 bg-slate-900 border border-white/5 rounded-lg text-[10px] text-amber-400 font-mono flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Option {label} Image could not be loaded</span>
          </div>
        )}

        {!hasText && !hasImage && !imageError && (
          <span className="italic text-slate-500 text-xs">
            Option {label}
          </span>
        )}
      </div>
    </button>
  );
};
