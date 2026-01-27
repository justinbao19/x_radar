'use client';

import { formatDateTime } from '@/lib/data';

interface AuthAlertProps {
  status: {
    valid: boolean;
    lastCheck: string;
    reason?: string;
  };
}

export function AuthAlert({ status }: AuthAlertProps) {
  if (status.valid) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-emerald-800">系统运行正常</p>
          <p className="text-xs text-emerald-600">最后检查: {formatDateTime(status.lastCheck)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-800">X 登录状态已失效</p>
          {status.reason && (
            <p className="text-xs text-red-600 mt-1">{status.reason}</p>
          )}
          <div className="mt-3 p-3 bg-white rounded-lg border border-red-100">
            <p className="text-xs font-medium text-slate-700 mb-2">修复步骤:</p>
            <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
              <li>本地运行 <code className="bg-slate-100 px-1 py-0.5 rounded">npm run login</code></li>
              <li>在浏览器中登录 X 账号</li>
              <li>运行 <code className="bg-slate-100 px-1 py-0.5 rounded">base64 -i auth/state.json | tr -d &apos;\n&apos; | gh secret set X_STORAGE_STATE_B64</code></li>
              <li>手动触发 <code className="bg-slate-100 px-1 py-0.5 rounded">gh workflow run &quot;X Radar Pipeline&quot;</code></li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
