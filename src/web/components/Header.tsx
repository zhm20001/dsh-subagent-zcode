import React from 'react';
import { Play, Activity, CheckCircle2, ShieldAlert, RefreshCw, Terminal, Layers } from 'lucide-react';
import type { Task } from '../types.ts';

interface HeaderProps {
  tasks: Task[];
  onOpenDispatch: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ tasks, onOpenDispatch, onRefresh, isLoading }) => {
  const runningCount = tasks.filter((t) => t.status === 'RUNNING').length;
  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const failedCount = tasks.filter((t) => t.status === 'FAILED' || t.status === 'TIMEOUT_KILLED').length;

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md px-6 py-3.5 sticky top-0 z-30 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center text-white">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                DSH Agent Swarm
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  DispatchDock
                </span>
              </h1>
            </div>
            <p className="text-xs text-zinc-400">Detached subagent runners & live execution workspace</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 ml-6 pl-6 border-l border-zinc-800">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs">
            <Activity className={`h-3.5 w-3.5 ${runningCount > 0 ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="text-zinc-400">Running:</span>
            <span className="font-semibold text-zinc-200">{runningCount}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-zinc-400">Done:</span>
            <span className="font-semibold text-zinc-200">{completedCount}</span>
          </div>

          {failedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/40 border border-red-800/40 text-xs">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-rose-300">Errors:</span>
              <span className="font-semibold text-rose-200">{failedCount}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh task roster"
          className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={onOpenDispatch}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs shadow-md shadow-indigo-600/25 transition-all hover:scale-[1.02]"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Dispatch Subagent</span>
        </button>
      </div>
    </header>
  );
};
