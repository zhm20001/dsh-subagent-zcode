import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Terminal,
  Cpu,
  ChevronRight,
  Ban,
  ArrowUpRight,
  ShieldCheck,
  FileCode2,
} from 'lucide-react';
import type { Task, TaskStatus } from '../types.ts';
import { translations, type Language } from '../i18n.ts';

interface KanbanBoardProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  lang: Language;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tasks,
  selectedTaskId,
  onSelectTask,
  lang,
}) => {
  const t = translations[lang];

  // Tick for live duration display on running tasks
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const runningTasks = tasks.filter((task) => task.status === 'RUNNING');
  const completedTasks = tasks.filter((task) => task.status === 'COMPLETED');
  const terminatedTasks = tasks.filter(
    (task) => task.status === 'FAILED' || task.status === 'KILLED' || task.status === 'TIMEOUT_KILLED'
  );

  const formatDuration = (startTime: number, endTime?: number) => {
    const end = endTime || Date.now();
    const diffSec = Math.max(0, Math.round((end - startTime) / 1000));
    if (diffSec < 60) return `${diffSec}s`;
    const min = Math.floor(diffSec / 60);
    const sec = diffSec % 60;
    return `${min}m ${sec}s`;
  };

  const renderCard = (task: Task) => {
    const isSelected = task.taskId === selectedTaskId;
    const isRunning = task.status === 'RUNNING';

    return (
      <div
        key={task.taskId}
        onClick={() => onSelectTask(task.taskId)}
        className={`group relative rounded-xl p-4 transition-all duration-200 cursor-pointer border text-left ${
          isRunning
            ? 'bg-gradient-to-br from-zinc-900 to-indigo-950/40 border-indigo-500/50 shadow-lg shadow-indigo-500/10 hover:border-indigo-400 hover:scale-[1.01]'
            : task.status === 'COMPLETED'
            ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 hover:scale-[1.01]'
            : 'bg-zinc-900/70 border-zinc-800 hover:border-rose-900/50 hover:bg-zinc-850'
        } ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : ''}`}
      >
        {/* Running Active Glow Banner */}
        {isRunning && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 rounded-t-xl animate-pulse" />
        )}

        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {task.ticket ? (
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-[11px] font-bold border border-indigo-500/30">
                {task.ticket}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]">
                NO-TICKET
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-mono border border-zinc-700/60">
              {task.adapter}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {isRunning ? (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                {t.runningBadge}
              </span>
            ) : task.status === 'COMPLETED' ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <ShieldCheck className="h-3 w-3" />
                exit 0
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="h-3 w-3" />
                {task.status}
              </span>
            )}
          </div>
        </div>

        {/* Task Title & Prompt */}
        <h4 className="font-semibold text-xs text-zinc-200 line-clamp-1 mb-1 group-hover:text-white transition-colors">
          {task.label || task.taskId}
        </h4>
        <p className="text-[11px] text-zinc-400 font-mono line-clamp-2 leading-relaxed mb-3">
          {task.prompt}
        </p>

        {/* Card Footer: Metadata and Inspector Action */}
        <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="flex items-center gap-1 text-zinc-400">
              <Clock className="h-3 w-3" />
              <span>{formatDuration(task.startTime, task.endTime)}</span>
            </span>
            {task.pid && <span className="text-zinc-500">PID: {task.pid}</span>}
          </div>

          <div className="flex items-center gap-1 text-indigo-400 group-hover:translate-x-0.5 transition-transform text-[11px] font-medium">
            <span>{t.clickToInspect}</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 overflow-hidden bg-zinc-950">
      {/* Kanban Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="font-bold text-base text-zinc-100 flex items-center gap-2">
            {t.kanbanTitle}
            <span className="text-xs font-normal text-zinc-500">
              ({tasks.length} total tasks in `.swarm-runs`)
            </span>
          </h2>
          <p className="text-xs text-zinc-400">{t.kanbanSubtitle}</p>
        </div>
      </div>

      {/* 3 Columns Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0 overflow-hidden">
        {/* Column 1: Running */}
        <div className="flex flex-col bg-zinc-900/40 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-3.5 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse" />
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">{t.colRunning}</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 font-mono">
              {runningTasks.length}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3">
            {runningTasks.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-zinc-600 text-xs">
                <Activity className="h-6 w-6 mb-2 stroke-[1.5] text-zinc-700" />
                <span>{t.emptyColumn}</span>
              </div>
            ) : (
              runningTasks.map(renderCard)
            )}
          </div>
        </div>

        {/* Column 2: Completed */}
        <div className="flex flex-col bg-zinc-900/40 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-3.5 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">{t.colCompleted}</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold border border-blue-500/20 font-mono">
              {completedTasks.length}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3">
            {completedTasks.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-zinc-600 text-xs">
                <CheckCircle2 className="h-6 w-6 mb-2 stroke-[1.5] text-zinc-700" />
                <span>{t.emptyColumn}</span>
              </div>
            ) : (
              completedTasks.map(renderCard)
            )}
          </div>
        </div>

        {/* Column 3: Terminated / Failed */}
        <div className="flex flex-col bg-zinc-900/40 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-3.5 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">{t.colTerminated}</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs font-bold border border-zinc-700 font-mono">
              {terminatedTasks.length}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3">
            {terminatedTasks.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-zinc-600 text-xs">
                <Ban className="h-6 w-6 mb-2 stroke-[1.5] text-zinc-700" />
                <span>{t.emptyColumn}</span>
              </div>
            ) : (
              terminatedTasks.map(renderCard)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
