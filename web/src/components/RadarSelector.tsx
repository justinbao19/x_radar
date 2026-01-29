'use client';

import { RadarCategory } from '@/lib/types';

interface RadarSelectorProps {
  selected: RadarCategory;
  onChange: (category: RadarCategory) => void;
  counts?: {
    pain_radar: number;
    filo_sentiment: number;
    user_insight: number;
  };
}

const RADAR_OPTIONS: { id: RadarCategory; label: string; labelEn: string; icon: string; description: string }[] = [
  {
    id: 'pain_radar',
    label: '痛点雷达',
    labelEn: 'Pain Radar',
    icon: '🎯',
    description: '用户痛点与传播内容'
  },
  {
    id: 'filo_sentiment',
    label: 'Filo舆情',
    labelEn: 'Filo Sentiment',
    icon: '📢',
    description: '品牌提及与用户反馈'
  },
  {
    id: 'user_insight',
    label: '用户洞察',
    labelEn: 'User Insight',
    icon: '💡',
    description: '功能需求与竞品动态'
  }
];

export function RadarSelector({ selected, onChange, counts }: RadarSelectorProps) {
  return (
    <div className="w-full bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 border-b border-stone-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <nav className="flex" role="tablist">
          {RADAR_OPTIONS.map((option) => {
            const isActive = selected === option.id;
            const count = counts?.[option.id] ?? 0;
            
            return (
              <button
                key={option.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(option.id)}
                className={`
                  relative flex-1 py-2.5 px-1.5 sm:py-4 sm:px-6 text-center transition-all duration-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900
                  ${isActive 
                    ? 'text-amber-400' 
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
                  }
                `}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute bottom-0 left-2 right-2 sm:left-4 sm:right-4 h-0.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 rounded-full" />
                )}
                
                <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                  {/* Icon - 移动端单独一行 */}
                  <span className="text-xl sm:hidden">{option.icon}</span>
                  
                  {/* Icon + Label - 桌面端水平排列 */}
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-xl">{option.icon}</span>
                    <span className={`font-semibold text-base ${isActive ? 'text-amber-400' : ''}`}>
                      {option.label}
                    </span>
                    {/* Count badge - 桌面端 */}
                    {count > 0 && (
                      <span className={`
                        ml-1 px-1.5 py-0.5 text-xs rounded-full
                        ${isActive 
                          ? 'bg-amber-500/20 text-amber-300' 
                          : 'bg-stone-700 text-stone-400'
                        }
                      `}>
                        {count}
                      </span>
                    )}
                  </div>
                  
                  {/* Label - 移动端单独一行 */}
                  <span className={`sm:hidden font-semibold text-xs ${isActive ? 'text-amber-400' : ''}`}>
                    {option.label}
                  </span>
                  
                  {/* Count badge - 移动端单独一行 */}
                  {count > 0 && (
                    <span className={`
                      sm:hidden px-1.5 py-0.5 text-[10px] rounded-full
                      ${isActive 
                        ? 'bg-amber-500/20 text-amber-300' 
                        : 'bg-stone-700 text-stone-400'
                      }
                    `}>
                      {count}
                    </span>
                  )}
                  
                  {/* Description - 仅桌面端 */}
                  <span className={`
                    hidden sm:block text-xs
                    ${isActive ? 'text-amber-500/70' : 'text-stone-500'}
                  `}>
                    {option.description}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
