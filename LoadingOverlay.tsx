import React from 'react';

interface LoadingOverlayProps {
  isLoading: boolean;
  status: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isLoading, status }) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-1000">
      <div className="w-16 h-16 border-4 border-t-transparent border-yellow-600 rounded-full animate-spin mb-8 shadow-[0_0_15px_rgba(212,175,55,0.5)]"></div>
      <h2 className="text-3xl font-cinzel text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-500 to-yellow-200 animate-pulse tracking-widest">
        LOADING
      </h2>
      <p className="mt-4 text-gray-400 font-serif italic text-sm">{status}</p>
    </div>
  );
};

export default LoadingOverlay;
