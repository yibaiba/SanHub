import React from 'react';

type VideoEngine = 'sora' | 'veo';
type CreationMode = 'normal' | 'remix' | 'storyboard';
type Veo3Mode = 't2v' | 'i2v' | 'r2v';

interface ModeSelectorProps {
  engine: VideoEngine;
  mode: CreationMode | Veo3Mode;
  onChange: (mode: CreationMode | Veo3Mode) => void;
}

interface ModeOption {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const soraModes: ModeOption[] = [
  {
    value: 'normal',
    label: '普通生成',
    description: 'Text to video generation',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  {
    value: 'remix',
    label: 'Remix',
    description: 'Remix existing video',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    value: 'storyboard',
    label: '分镜',
    description: 'Storyboard generation',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
];

const veoModes: ModeOption[] = [
  {
    value: 't2v',
    label: '文生视频',
    description: 'Text to video',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    value: 'i2v',
    label: '图生视频',
    description: 'Image to video',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    value: 'r2v',
    label: '图片融合',
    description: 'Reference image fusion',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export default function ModeSelector({ engine, mode, onChange }: ModeSelectorProps) {
  const modes = engine === 'sora' ? soraModes : veoModes;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        生成模式
      </label>
      <div className="grid grid-cols-3 gap-2">
        {modes.map((modeOption) => (
          <button
            key={modeOption.value}
            onClick={() => onChange(modeOption.value as CreationMode | Veo3Mode)}
            className={`
              flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all duration-300 ease-out
              ${
                mode === modeOption.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-md shadow-blue-500/20 scale-[1.02]'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400 hover:scale-[1.01] hover:shadow-sm'
              }
            `}
          >
            <div className="flex items-center justify-center transition-transform duration-300">
              {modeOption.icon}
            </div>
            <div className="text-center">
              <div className="text-sm font-medium">{modeOption.label}</div>
              <div className="text-xs opacity-75 mt-0.5">{modeOption.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
