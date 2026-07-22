import React, { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2, X, Download } from 'lucide-react';

interface ImageViewerModalProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ src, alt = 'Question Diagram', onClose }) => {
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '=' || e.key === '+') {
        setScale(s => Math.min(5, s + 0.25));
      } else if (e.key === '-') {
        setScale(s => Math.max(0.5, s - 0.25));
      } else if (e.key === '0') {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!src) return null;

  const handleZoomIn = () => setScale(s => Math.min(5, s + 0.25));
  const handleZoomOut = () => setScale(s => Math.max(0.5, s - 0.25));
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const toggleFullscreen = () => setIsFullscreen(prev => !prev);

  return (
    <div 
      className="fixed inset-0 z-[99999] bg-slate-950/90 backdrop-blur-md flex flex-col justify-between p-4 md:p-6 animate-fadeIn select-none"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div 
        className="flex items-center justify-between z-10 bg-slate-900/80 p-3 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md max-w-4xl w-full mx-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-xs font-bold text-white truncate max-w-md">
          <span className="bg-indigo-600/30 text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-500/30 uppercase tracking-wider text-[10px]">
            Diagram Viewer
          </span>
          <span className="truncate text-slate-300">{alt}</span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-white/5">
          <button 
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs font-mono font-bold text-indigo-400 px-2 min-w-[48px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button 
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button 
            onClick={handleReset}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors border-l border-white/10 ml-1"
            title="Reset Zoom (0)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button 
            onClick={toggleFullscreen}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/20 transition-all ml-2"
          title="Close (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Image Container */}
      <div 
        className="flex-1 flex items-center justify-center overflow-hidden my-4 relative cursor-grab active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={src}
          alt={alt}
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            maxHeight: isFullscreen ? '95vh' : '80vh',
            maxWidth: isFullscreen ? '95vw' : '85vw',
            objectFit: 'contain'
          }}
          className="rounded-2xl shadow-2xl border border-white/10 bg-slate-900 pointer-events-auto"
          loading="lazy"
        />
      </div>

      {/* Footer Info */}
      <div 
        className="z-10 text-center text-[10px] text-slate-400 font-mono bg-slate-900/60 py-1.5 px-4 rounded-full border border-white/5 max-w-sm mx-auto"
        onClick={e => e.stopPropagation()}
      >
        Click & Drag to pan when zoomed • Scroll or +/- keys to zoom • Esc to exit
      </div>
    </div>
  );
};
