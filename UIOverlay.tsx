import React, { useRef, ChangeEvent } from 'react';
import { Upload, Camera, HelpCircle } from 'lucide-react';

interface UIOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  onFileUpload: (files: FileList | null) => void;
  gesture: string;
  hasImages: boolean;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ videoRef, onFileUpload, gesture, hasImages }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
      
      {/* Header */}
      <header className="flex flex-col items-center justify-center mt-4">
        <h1 className="font-cinzel text-4xl md:text-6xl text-gold-gradient text-glow tracking-widest text-center">
          Merry Christmas
        </h1>
        <div className="h-[1px] w-32 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mt-4 opacity-70"></div>
      </header>

      {/* Center - Instructions or Status */}
      <div className="flex-1 flex items-center justify-center">
        {!hasImages && (
          <div className="pointer-events-auto bg-black/90 border border-yellow-800/60 p-10 rounded-xl backdrop-blur-md text-center max-w-md shadow-[0_0_50px_rgba(212,175,55,0.15)] transform transition-all hover:scale-105">
            <h3 className="text-yellow-400 font-cinzel text-2xl mb-4 tracking-wider">The Golden Collection</h3>
            <p className="text-gray-400 font-serif mb-8 italic text-lg">Curate your memories in gold and light. Upload photos to craft your masterpiece.</p>
            <button 
              onClick={() => inputRef.current?.click()}
              className="px-10 py-4 bg-gradient-to-r from-yellow-800 to-yellow-600 text-yellow-100 font-cinzel tracking-widest text-sm rounded-sm border border-yellow-400/30 hover:shadow-[0_0_30px_rgba(212,175,55,0.5)] transition-all"
            >
              <span className="flex items-center gap-2 uppercase">Begin Experience</span>
            </button>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              ref={inputRef} 
              className="hidden" 
              onChange={(e) => onFileUpload(e.target.files)}
            />
          </div>
        )}
      </div>

      {/* Footer Controls & Webcam */}
      <div className="flex items-end justify-between w-full">
        
        {/* Webcam Preview & Gesture Indicator */}
        <div className="relative pointer-events-auto group">
          <div className="w-32 h-24 md:w-48 md:h-36 rounded-lg overflow-hidden border-2 border-yellow-800/30 shadow-2xl relative bg-black transition-all group-hover:border-yellow-600/80">
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" 
              autoPlay 
              playsInline 
              muted 
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
               <span className="text-[10px] text-yellow-500 font-cinzel tracking-widest">{gesture}</span>
               <div className={`w-1.5 h-1.5 rounded-full ${gesture !== 'NONE' ? 'bg-yellow-400 shadow-[0_0_10px_gold]' : 'bg-red-900'}`}></div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="hidden md:block bg-black/80 backdrop-blur-xl border-l border-yellow-700/40 p-6 rounded-l-lg max-w-xs shadow-2xl">
          <h4 className="text-yellow-500 font-cinzel text-xs uppercase tracking-[0.2em] border-b border-yellow-800/30 pb-3 mb-4">Master Controls</h4>
          <ul className="space-y-4 text-xs font-serif text-gray-400">
            <li className="flex items-center gap-3">
              <span className="text-lg">✊</span>
              <span><strong className="text-yellow-200 font-cinzel">Aggregate</strong> <br/>Form the Golden Tree</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-lg">🖐</span>
              <span><strong className="text-yellow-200 font-cinzel">Scatter</strong> <br/>Release into Stardust</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-lg">👋</span>
              <span><strong className="text-yellow-200 font-cinzel">Tilt Hand</strong> <br/>Rotate View</span>
            </li>
             <li className="flex items-center gap-3">
              <span className="text-lg">👌</span>
              <span><strong className="text-yellow-200 font-cinzel">Pinch</strong> <br/>Focus Memory</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UIOverlay;