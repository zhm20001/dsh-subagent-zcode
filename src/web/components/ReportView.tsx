import React from 'react';
import { FileCheck, AlertCircle, Info } from 'lucide-react';
import type { TaskDetailData } from '../types.ts';
import { translations, type Language } from '../i18n.ts';

interface ReportViewProps {
  task: TaskDetailData;
  lang: Language;
}

export const ReportView: React.FC<ReportViewProps> = ({ task, lang }) => {
  const t = translations[lang];

  return (
    <div className="flex flex-col h-full bg-zinc-950 font-mono text-xs">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/60 text-zinc-400">
        <FileCheck className="h-4 w-4 text-indigo-400" />
        <span className="font-semibold text-zinc-300">{t.reportTitle}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <span className="text-[11px] text-zinc-500 block mb-0.5">{t.statStatus}</span>
            <span className="font-bold text-sm text-zinc-200">{task.status}</span>
          </div>
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <span className="text-[11px] text-zinc-500 block mb-0.5">{t.statAdapter}</span>
            <span className="font-bold text-sm text-indigo-400">{task.adapter}</span>
          </div>
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <span className="text-[11px] text-zinc-500 block mb-0.5">{t.statTicket}</span>
            <span className="font-bold text-sm text-zinc-200">{task.ticket || '—'}</span>
          </div>
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <span className="text-[11px] text-zinc-500 block mb-0.5">{t.statExitCode}</span>
            <span className="font-bold text-sm text-zinc-200">{task.exitCode ?? '—'}</span>
          </div>
        </div>

        {task.error && (
          <div className="p-4 rounded-lg bg-red-950/30 border border-red-800/40 text-rose-300 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold mb-1">{t.executionError}</div>
              <pre className="text-xs">{task.error}</pre>
            </div>
          </div>
        )}

        {task.report ? (
          <div className="p-5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {task.report}
          </div>
        ) : (
          <div className="p-8 text-center text-zinc-500 bg-zinc-900/40 rounded-lg border border-zinc-800/60">
            <Info className="h-6 w-6 mx-auto mb-2 text-zinc-600" />
            {t.generatingReport}
          </div>
        )}
      </div>
    </div>
  );
};
