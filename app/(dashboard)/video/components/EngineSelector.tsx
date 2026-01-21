import React from 'react';

type VideoEngine = 'sora' | 'veo';

interface EngineSelectorProps {
  engine: VideoEngine;
  onChange: (engine: VideoEngine) => void;
}

export default function EngineSelector({ engine, onChange }: EngineSelectorProps) {
  return (
    <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <button
        onClick={() => onChange('sora')}
        className={`
          flex-1 px-6 py-2.5 rounded-md font-medium transition-all duration-300 ease-out
          ${
            engine === 'sora'
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30 scale-[1.02]'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-[1.01]'
          }
        `}
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="w-5 h-5 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Sora
        </span>
      </button>
      
      <button
        onClick={() => onChange('veo')}
        className={`
          flex-1 px-6 py-2.5 rounded-md font-medium transition-all duration-300 ease-out
          ${
            engine === 'veo'
              ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30 scale-[1.02]'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-[1.01]'
          }
        `}
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="w-5 h-5 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          Veo
        </span>
      </button>
    </div>
  );
}
