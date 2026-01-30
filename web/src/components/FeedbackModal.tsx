'use client';

import { useState } from 'react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: string | null) => void;
  tweetText?: string;
}

const FEEDBACK_OPTIONS = [
  { id: 'irrelevant', label: '与我的业务无关' },
  { id: 'spam', label: '垃圾/广告内容' },
  { id: 'duplicate', label: '重复内容' },
  { id: 'low_quality', label: '质量太低' },
  { id: 'wrong_category', label: '分类错误' },
  { id: 'other', label: '其他原因' },
];

export function FeedbackModal({ isOpen, onClose, onSubmit, tweetText }: FeedbackModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    let feedback: string | null = null;
    if (selectedReason === 'other' && customReason.trim()) {
      feedback = customReason.trim();
    } else if (selectedReason) {
      feedback = selectedReason;
    }
    onSubmit(feedback);
    // Reset state
    setSelectedReason(null);
    setCustomReason('');
  };

  const handleSkip = () => {
    onSubmit(null);
    // Reset state
    setSelectedReason(null);
    setCustomReason('');
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleSkip();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-stone-800">移除这条推文</h3>
              <p className="text-sm text-stone-500">帮助我们改进推荐质量</p>
            </div>
          </div>
        </div>

        {/* Tweet Preview */}
        {tweetText && (
          <div className="px-6 py-3 bg-stone-50 border-b border-stone-100">
            <p className="text-sm text-stone-600 line-clamp-2">
              {tweetText}
            </p>
          </div>
        )}

        {/* Feedback Options */}
        <div className="px-6 py-4">
          <p className="text-sm font-medium text-stone-600 mb-3">为什么不符合预期？（可选）</p>
          <div className="space-y-2">
            {FEEDBACK_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => setSelectedReason(option.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                  selectedReason === option.id
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedReason === option.id
                      ? 'border-red-500 bg-red-500'
                      : 'border-stone-300'
                  }`}>
                    {selectedReason === option.id && (
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm font-medium">{option.label}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Custom reason input */}
          {selectedReason === 'other' && (
            <div className="mt-3">
              <textarea
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="请简单描述原因..."
                className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 resize-none"
                rows={2}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-stone-100 flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-colors"
          >
            跳过
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl shadow-lg shadow-red-500/25 transition-all"
          >
            确认移除
          </button>
        </div>
      </div>
    </div>
  );
}
