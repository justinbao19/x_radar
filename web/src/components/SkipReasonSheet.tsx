'use client';

import { useState } from 'react';
import { SkipReason } from '@/lib/types';
import { SKIP_REASON_OPTIONS } from '@/lib/skipReasons';

interface SkipReasonSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: SkipReason, note?: string) => void;
}

export function SkipReasonSheet({ open, onClose, onSubmit }: SkipReasonSheetProps) {
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [note, setNote] = useState('');

  if (!open) return null;

  function handleReasonClick(reason: SkipReason) {
    if (reason === 'other') {
      setShowOtherInput(true);
      return;
    }
    onSubmit(reason);
    setShowOtherInput(false);
    setNote('');
  }

  function handleOtherSubmit() {
    onSubmit('other', note);
    setShowOtherInput(false);
    setNote('');
  }

  function handleClose() {
    setShowOtherInput(false);
    setNote('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
      <div
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-2xl shadow-2xl animate-slide-up max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-300" />
        </div>

        <div className="px-5 pb-3 pt-1">
          <h3 className="text-base font-semibold text-stone-800">为什么跳过？</h3>
        </div>

        <div className="px-4 pb-6 overflow-y-auto flex-1 space-y-2">
          {SKIP_REASON_OPTIONS.map((reason) => (
            <button
              key={reason.value}
              onClick={() => handleReasonClick(reason.value)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                showOtherInput && reason.value === 'other'
                  ? 'bg-blue-50 border-2 border-blue-400 text-blue-700'
                  : 'bg-stone-50 border-2 border-transparent hover:bg-stone-100 active:bg-stone-200 text-stone-700'
              }`}
            >
              <span className="text-lg">{reason.icon}</span>
              <span className="text-sm font-medium">{reason.label}</span>
            </button>
          ))}

          {/* "other" expanded input */}
          {showOtherInput && (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="补充说明..."
                className="w-full mt-2 px-4 py-3 rounded-xl border-2 border-stone-200 focus:border-blue-400 focus:outline-none text-sm text-stone-700 resize-none"
                rows={2}
                autoFocus
              />
              <button
                onClick={handleOtherSubmit}
                className="w-full mt-1 py-3 rounded-xl font-medium text-sm bg-stone-800 text-white hover:bg-stone-900 active:scale-[0.98] transition-colors"
              >
                确认跳过
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
