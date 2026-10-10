import React, { useState, useEffect } from 'react';
import { Terminal, FileCheck, GitCommit, Code2, Ban, RefreshCw, Folder } from 'lucide-react';
import type { Task, TaskDetailData } from '../types.ts';
import { translations, type Language } from '../i18n.ts';
import { TerminalView } from './TerminalView.tsx';
import { ReportView } from './ReportView.tsx';
import { DiffView } from './DiffView.tsx';

interface TaskDetailProps {
  task: Task;
  onRefresh: () => void;
  lang: Language;
}

type TabType = 'terminal' | 'report' | 'diff' | 'json';

export const TaskDetail: React.FC<TaskDetailProps> = ({ task, onRefresh, lang }) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<TabType>('terminal');
  const [detailData, setDetailData] = useState<TaskDetailData | null>(null);
  const [isKilling, setIsKilling] = useState<boolean>(false);

  const fetchDetail = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.taskId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      }
    } catch {}
  };

  useEffect(() => {
    fetchDetail();
    const interval = setInterval(fetchDetail, 3000);
    return () => clearInterval(interval);
  }, [task.taskId]);

  const handleKill = async () => {
    const confirmMsg = t.confirmKill.replace('{taskId}', task.taskId).replace('{pid}', String(task.pid || ''));
    if (!confirm(confirmMsg)) return;
    setIsKilling(true);
    try {
      await fetch(`/api/tasks/${task.taskId}/kill`, { method: 'POST' });
      fetchDetail();
      onRefresh();
    } catch {}
    setIsKilling(false);
  };

  const currentTask = detailData || task;

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden">
      {/* Top Banner / Toolbar */}
      <div className="px-6 py-3.5 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {currentTask.ticket && (
            <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
              {currentTask.ticket}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-zinc-100 truncate flex items-center gap-2">
              <span>{currentTask.label || currentTask.taskId}</span>
              <span className="text-xs font-mono text-zinc-500 font-normal">({currentTask.taskId})</span>
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono mt-0.5">
              <span className="flex items-center gap-1">
                <Folder className="h-3 w-3 text-zinc-500" />
                <span className="truncate max-w-xs">{currentTask.cwd}</span>
              </span>
              {currentTask.pid && <span>• {t.pid} {currentTask.pid}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentTask.status === 'RUNNING' && (
            <button
              onClick={handleKill}
              disabled={isKilling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-all"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>{isKilling ? t.killing : t.killProcess}</span>
            </button>
          )}

          <button
            onClick={() => {
              fetchDetail();
              onRefresh();
            }}
            title={t.refreshDetail}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-zinc-800 bg-zinc-900/20">
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'terminal'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>{t.tabTerminal}</span>
        </button>

        <button
          onClick={() => setActiveTab('report')}
          className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'report'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileCheck className="h-3.5 w-3.5" />
          <span>{t.tabReport}</span>
        </button>

        <button
          onClick={() => setActiveTab('diff')}
          className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'diff'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <GitCommit className="h-3.5 w-3.5" />
          <span>{t.tabDiff}</span>
        </button>

        <button
          onClick={() => setActiveTab('json')}
          className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'json'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>{t.tabJson}</span>
        </button>
      </div>

      {/* Active Tab View */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'terminal' && (
          <TerminalView taskId={currentTask.taskId} isLive={currentTask.status === 'RUNNING'} lang={lang} />
        )}
        {activeTab === 'report' && <ReportView task={currentTask} lang={lang} />}
        {activeTab === 'diff' && <DiffView taskId={currentTask.taskId} lang={lang} />}
        {activeTab === 'json' && (
          <div className="h-full p-4 overflow-y-auto bg-zinc-950 font-mono text-xs">
            <pre className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-indigo-300">
              {JSON.stringify(currentTask, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
