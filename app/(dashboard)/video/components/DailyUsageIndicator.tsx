import React from 'react';

interface DailyUsageIndicatorProps {
  usage: number;
  limit: number;
  isLimitReached: boolean;
}

export default function DailyUsageIndicator({ usage, limit, isLimitReached }: DailyUsageIndicatorProps) {
  const percentage = limit > 0 ? (usage / limit) * 100 : 0;
  
  // Determine color based on usage percentage
  const getColorClasses = () => {
    if (isLimitReached || percentage >= 100) {
      return 'bg-red-500 text-white';
    } else if (percentage >= 80) {
      return 'bg-orange-500 text-white';
    } else if (percentage >= 60) {
      return 'bg-yellow-500 text-white';
    } else {
      return 'bg-green-500 text-white';
    }
  };

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm
        transition-all duration-300 shadow-sm
        ${getColorClasses()}
      `}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <span>
        今日使用: {usage} / {limit}
      </span>
      {isLimitReached && (
        <span className="ml-1 text-xs font-bold animate-pulse">
          已达上限
        </span>
      )}
    </div>
  );
}
