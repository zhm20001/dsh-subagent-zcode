import React, { useEffect, useState } from 'react';
import { GitCommit, RefreshCw, FileText } from 'lucide-react';
import type { DiffData } from '../types.ts';
import { translations, type Language } from '../i18n.ts';

interface DiffViewProps {
  taskId: string;
  lang: Language;
}

export const DiffView: React.FC<DiffViewProps> = ({ taskId, lang }) => {
  const t = translations[lang];
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchDiff = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/diff`);
      const data = await res.json();
      setDiffData(data);
    } catch {
      setDiffData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiff();
  }, [taskId]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 font-mono text-xs">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/60 text-zinc-400">
        <div className="flex items-center gap-2">
          <GitCommit className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-zinc-300">{t.gitDiffTitle}</span>
        </div>
        <button
          onClick={fetchDiff}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          <span>{t.refreshDiff}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {diffData?.status && (
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
            <div className="text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-indigo-400" />
              <span>{t.statusSummary}</span>
            </div>
            <pre className="text-zinc-300 text-xs">{diffData.status}</pre>
          </div>
        )}

        <div className="p-4 rounded-lg bg-zinc-900/80 border border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 mb-2 border-b border-zinc-800 pb-1.5">
            {t.diffOutput}
          </div>
          <pre className="overflow-x-auto text-xs leading-relaxed">
            {(diffData?.diff || t.noChangesFound).split('\n').map((line, idx) => {
              let lineStyle = 'text-zinc-300';
              if (line.startsWith('+') && !line.startsWith('+++')) {
                lineStyle = 'text-emerald-400 bg-emerald-950/30 -mx-4 px-4 block';
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                lineStyle = 'text-rose-400 bg-rose-950/30 -mx-4 px-4 block';
              } else if (line.startsWith('@@')) {
                lineStyle = 'text-cyan-400 font-semibold';
              } else if (line.startsWith('diff --git')) {
                lineStyle = 'text-indigo-300 font-bold mt-2 pt-2 border-t border-zinc-800 block';
              }
              return (
                <span key={idx} className={lineStyle}>
                  {line}
                  {'\n'}
                </span>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
};
