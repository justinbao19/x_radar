'use client';

interface ProgressBarProps {
  total: number;
  reviewed: number;
  remaining: number;
}

export function ProgressBar({ total, reviewed, remaining }: ProgressBarProps) {
  const progress = total > 0 ? (reviewed / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-stone-600 whitespace-nowrap">
        {remaining}/{total} 剩余
      </span>
      <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
