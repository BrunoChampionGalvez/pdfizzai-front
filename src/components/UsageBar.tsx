'use client';

interface UsageBarProps {
  label: string;
  used: number;
  limit: number;
  className?: string;
}

export default function UsageBar({ label, used, limit, className = '' }: UsageBarProps) {
  const percentage = Math.min((used / limit) * 100, 100);
  
  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-accent';
  };

  return (
    <div className={className}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-text-primary font-medium">{label}</h3>
        <span className="text-secondary text-sm">
          {used} / {limit}
        </span>
      </div>
      <div className="w-full bg-secondary rounded-full h-3">
        <div 
          className={`h-3 rounded-full transition-all duration-300 ${getUsageColor(percentage)}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <p className="text-xs text-secondary mt-1">
        {limit - used} remaining
      </p>
    </div>
  );
}
