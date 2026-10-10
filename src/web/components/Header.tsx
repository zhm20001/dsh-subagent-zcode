import React from 'react';
import { Play, Activity, CheckCircle2, ShieldAlert, RefreshCw, Layers, Languages, LayoutGrid, SplitSquareVertical } from 'lucide-react';
import type { Task } from '../types.ts';
import { translations, type Language } from '../i18n.ts';

interface HeaderProps {
  tasks: Task[];
  onOpenDispatch: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  lang: Language;
  onToggleLang: () => void;
  viewMode: 'kanban' | 'timeline';
  onSelectViewMode: (mode: 'kanban' | 'timeline') => void;
}

export const Header: React.FC<HeaderProps> = ({
  tasks,
  onOpenDispatch,
  onRefresh,
  isLoading,
  lang,
  onToggleLang,
  viewMode,
  onSelectViewMode,
}) => {
  const t = translations[lang];
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
                {t.appName}
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {t.badgeDispatchDock}
                </span>
              </h1>
            </div>
            <p className="text-xs text-zinc-400">{t.subtitle}</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 ml-6 pl-6 border-l border-zinc-800">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs">
            <Activity className={`h-3.5 w-3.5 ${runningCount > 0 ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="text-zinc-400">{t.running}:</span>
            <span className="font-semibold text-zinc-200">{runningCount}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-zinc-400">{t.done}:</span>
            <span className="font-semibold text-zinc-200">{completedCount}</span>
          </div>

          {failedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/40 border border-red-800/40 text-xs">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-rose-300">{t.errors}:</span>
              <span className="font-semibold text-rose-200">{failedCount}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* View Mode Toggle: Kanban vs Timeline */}
        <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => onSelectViewMode('kanban')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'kanban'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>{t.viewKanban}</span>
          </button>
          <button
            onClick={() => onSelectViewMode('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'timeline'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <SplitSquareVertical className="h-3.5 w-3.5" />
            <span>{t.viewTimeline}</span>
          </button>
        </div>

        {/* Bilingual switch button */}
        <button
          onClick={onToggleLang}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 hover:text-white text-xs font-medium transition-all"
          title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
        >
          <Languages className="h-3.5 w-3.5 text-indigo-400" />
          <span className="font-mono">{t.langToggle}</span>
        </button>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          title={t.refreshRoster}
          className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={onOpenDispatch}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs shadow-md shadow-indigo-600/25 transition-all hover:scale-[1.02]"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>{t.dispatchSubagent}</span>
        </button>
      </div>
    </header>
  );
};

