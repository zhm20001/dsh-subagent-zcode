import React, { useState } from 'react';
import { Search, Clock, Cpu, CheckCircle, XCircle, AlertTriangle, Radio, Ban } from 'lucide-react';
import type { Task, TaskStatus } from '../types.ts';

interface TaskTimelineProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

export const TaskTimeline: React.FC<TaskTimelineProps> = ({
  tasks,
  selectedTaskId,
  onSelectTask,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.taskId.toLowerCase().includes(search.toLowerCase()) ||
      task.label.toLowerCase().includes(search.toLowerCase()) ||
      task.prompt.toLowerCase().includes(search.toLowerCase()) ||
      (task.ticket && task.ticket.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'RUNNING') return task.status === 'RUNNING';
    if (statusFilter === 'COMPLETED') return task.status === 'COMPLETED';
    if (statusFilter === 'FAILED') return task.status === 'FAILED' || task.status === 'TIMEOUT_KILLED';
    if (statusFilter === 'KILLED') return task.status === 'KILLED';
    return true;
  });

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            RUNNING
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <CheckCircle className="h-3 w-3" />
            COMPLETED
          </span>
        );
      case 'TIMEOUT_KILLED':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-3 w-3" />
            TIMEOUT
          </span>
        );
      case 'KILLED':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-700/50">
            <Ban className="h-3 w-3" />
            KILLED
          </span>
        );
      case 'FAILED':
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="h-3 w-3" />
            FAILED
          </span>
        );
    }
  };

  const formatDuration = (startTime: number, endTime?: number) => {
    const end = endTime || Date.now();
    const diffSec = Math.max(0, Math.round((end - startTime) / 1000));
    if (diffSec < 60) return `${diffSec}s`;
    const min = Math.floor(diffSec / 60);
    const sec = diffSec % 60;
    return `${min}m ${sec}s`;
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/50 border-r border-zinc-800">
      <div className="p-3.5 border-b border-zinc-800 space-y-2.5">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Filter tasks, tickets, prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto text-[11px] no-scrollbar">
          {(['ALL', 'RUNNING', 'COMPLETED', 'FAILED'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                statusFilter === filter
                  ? 'bg-zinc-700 text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
        {filteredTasks.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs">
            <Cpu className="h-8 w-8 mx-auto mb-2 text-zinc-600 stroke-[1.5]" />
            No tasks found. Click "Dispatch Subagent" to start one.
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isSelected = task.taskId === selectedTaskId;
            return (
              <div
                key={task.taskId}
                onClick={() => onSelectTask(task.taskId)}
                className={`p-3.5 cursor-pointer transition-all border-l-2 ${
                  isSelected
                    ? 'bg-indigo-950/20 border-indigo-500'
                    : 'border-transparent hover:bg-zinc-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {task.ticket && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold border border-indigo-500/30">
                        {task.ticket}
                      </span>
                    )}
                    <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
                      {task.label || task.taskId}
                    </span>
                  </div>
                  <div>{getStatusBadge(task.status)}</div>
                </div>

                <p className="text-xs text-zinc-400 line-clamp-2 mb-2 leading-relaxed font-mono">
                  {task.prompt}
                </p>

                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[10px]">
                      {task.adapter}
                    </span>
                    {task.pid && (
                      <span className="text-zinc-500">PID: {task.pid}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(task.startTime, task.endTime)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
