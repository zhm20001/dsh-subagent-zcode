import React, { useState, useEffect } from 'react';
import type { Task } from './types.ts';
import { translations, type Language } from './i18n.ts';
import { Header } from './components/Header.tsx';
import { TaskTimeline } from './components/TaskTimeline.tsx';
import { TaskDetail } from './components/TaskDetail.tsx';
import { DispatchModal } from './components/DispatchModal.tsx';
import { QuickDispatchBar } from './components/QuickDispatchBar.tsx';
import { KanbanBoard } from './components/KanbanBoard.tsx';
import { Cpu, Play, X } from 'lucide-react';

export const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('dsh_swarm_lang');
    return saved === 'en' || saved === 'zh' ? saved : 'zh';
  });

  const [viewMode, setViewMode] = useState<'kanban' | 'timeline'>('kanban');

  const toggleLang = () => {
    setLang((prev) => {
      const next = prev === 'zh' ? 'en' : 'zh';
      localStorage.setItem('dsh_swarm_lang', next);
      return next;
    });
  };

  const t = translations[lang];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDispatchOpen, setIsDispatchOpen] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data: Task[] = await res.json();
        setTasks(data);
        if (data.length > 0 && !selectedTaskId) {
          setSelectedTaskId(data[0].taskId);
        }
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    // Fast polling if any task is actively running
    const hasRunningTasks = tasks.some((t) => t.status === 'RUNNING');
    const intervalTime = hasRunningTasks ? 1500 : 3500;
    const interval = setInterval(fetchTasks, intervalTime);
    return () => clearInterval(interval);
  }, [tasks]);

  const handleTaskDispatched = (newTaskId: string) => {
    fetchTasks();
    setSelectedTaskId(newTaskId);
  };

  const handleSelectFromKanban = (taskId: string) => {
    setSelectedTaskId(taskId);
    setIsDrawerOpen(true);
  };

  const selectedTask = tasks.find((t) => t.taskId === selectedTaskId) || null;

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      <Header
        tasks={tasks}
        onOpenDispatch={() => setIsDispatchOpen(true)}
        onRefresh={fetchTasks}
        isLoading={loading}
        lang={lang}
        onToggleLang={toggleLang}
        viewMode={viewMode}
        onSelectViewMode={setViewMode}
      />

      {viewMode === 'kanban' ? (
        /* Kanban Board View with Human Quick Creator Bar */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          <div className="p-4 md:p-6 pb-0 shrink-0">
            <QuickDispatchBar onDispatched={handleTaskDispatched} lang={lang} />
          </div>

          <div className="flex-1 min-h-0">
            <KanbanBoard
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectFromKanban}
              lang={lang}
            />
          </div>

          {/* Drawer / Inspector Slide-over for Kanban View */}
          {isDrawerOpen && selectedTask && (
            <div className="fixed inset-y-0 right-0 w-full sm:w-2/3 lg:w-1/2 z-40 bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
              <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300 font-mono flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                    {selectedTask.ticket || 'TASK'}
                  </span>
                  <span>{selectedTask.label || selectedTask.taskId}</span>
                </span>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 min-h-0">
                <TaskDetail task={selectedTask} onRefresh={fetchTasks} lang={lang} />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Split-Pane Timeline & Inspector View */
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Task Timeline & Roster */}
          <div className="w-80 md:w-96 shrink-0 h-full">
            <TaskTimeline
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              lang={lang}
            />
          </div>

          {/* Right Main Panel: Task Detail Inspector */}
          <div className="flex-1 h-full overflow-hidden bg-zinc-950">
            {selectedTask ? (
              <TaskDetail task={selectedTask} onRefresh={fetchTasks} lang={lang} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-zinc-950">
                <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
                  <Cpu className="h-8 w-8" />
                </div>
                <h3 className="font-bold text-lg text-zinc-200 mb-1">{t.noTaskSelectedTitle}</h3>
                <p className="text-xs text-zinc-500 max-w-sm mb-6 leading-relaxed">
                  {t.noTaskSelectedDesc}
                </p>
                <button
                  onClick={() => setIsDispatchOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/30 transition-all hover:scale-105"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>{t.launchFirstTask}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <DispatchModal
        isOpen={isDispatchOpen}
        onClose={() => setIsDispatchOpen(false)}
        onDispatched={handleTaskDispatched}
        lang={lang}
      />
    </div>
  );
};
