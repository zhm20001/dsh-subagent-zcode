import React, { useState, useEffect } from 'react';
import type { Task } from './types.ts';
import { Header } from './components/Header.tsx';
import { TaskTimeline } from './components/TaskTimeline.tsx';
import { TaskDetail } from './components/TaskDetail.tsx';
import { DispatchModal } from './components/DispatchModal.tsx';
import { Cpu, Play, Terminal } from 'lucide-react';

export const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDispatchOpen, setIsDispatchOpen] = useState<boolean>(false);
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
    const interval = setInterval(fetchTasks, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleTaskDispatched = (newTaskId: string) => {
    fetchTasks();
    setSelectedTaskId(newTaskId);
  };

  const selectedTask = tasks.find((t) => t.taskId === selectedTaskId) || null;

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      <Header
        tasks={tasks}
        onOpenDispatch={() => setIsDispatchOpen(true)}
        onRefresh={fetchTasks}
        isLoading={loading}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Task Timeline & Roster */}
        <div className="w-80 md:w-96 shrink-0 h-full">
          <TaskTimeline
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        </div>

        {/* Right Main Panel: Task Detail Inspector */}
        <div className="flex-1 h-full overflow-hidden bg-zinc-950">
          {selectedTask ? (
            <TaskDetail task={selectedTask} onRefresh={fetchTasks} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-zinc-950">
              <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
                <Cpu className="h-8 w-8" />
              </div>
              <h3 className="font-bold text-lg text-zinc-200 mb-1">No Task Selected</h3>
              <p className="text-xs text-zinc-500 max-w-sm mb-6 leading-relaxed">
                Select an existing subagent execution from the timeline, or launch a new detached task into the swarm.
              </p>
              <button
                onClick={() => setIsDispatchOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/30 transition-all hover:scale-105"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Launch First Task</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <DispatchModal
        isOpen={isDispatchOpen}
        onClose={() => setIsDispatchOpen(false)}
        onDispatched={handleTaskDispatched}
      />
    </div>
  );
};
