import React, { useState } from 'react';
import { X, Play, Cpu, AlertCircle } from 'lucide-react';

interface DispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDispatched: (newTaskId: string) => void;
}

export const DispatchModal: React.FC<DispatchModalProps> = ({
  isOpen,
  onClose,
  onDispatched,
}) => {
  const [prompt, setPrompt] = useState('');
  const [ticket, setTicket] = useState('');
  const [label, setLabel] = useState('');
  const [adapter, setAdapter] = useState('zcode');
  const [mode, setMode] = useState('edit');
  const [timeout, setTimeoutVal] = useState('1800');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError('Task prompt cannot be empty');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/tasks/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          ticket: ticket.trim() || undefined,
          label: label.trim() || undefined,
          adapter,
          mode,
          timeout: parseInt(timeout, 10) || 1800,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to dispatch task');
      }

      const data = await res.json();
      onDispatched(data.taskId);
      onClose();
      setPrompt('');
      setTicket('');
      setLabel('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-zinc-100">Dispatch Swarm Subagent</h2>
              <p className="text-xs text-zinc-400">Launch autonomous detached worker into .swarm-runs/</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/50 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Ticket Identifier (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. T1, SWARM-101"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Short Label / Title
              </label>
              <input
                type="text"
                placeholder="e.g. Refactor auth module"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Worker Adapter
              </label>
              <select
                value={adapter}
                onChange={(e) => setAdapter(e.target.value)}
                className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="zcode">ZCode CLI (Subagent)</option>
                <option value="bash">POSIX Bash (Shell)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Permission Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="edit">edit (Default)</option>
                <option value="build">build</option>
                <option value="plan">plan</option>
                <option value="yolo">yolo (Full autonomous)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                TTL Timeout (Seconds)
              </label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeoutVal(e.target.value)}
                className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Task Prompt (Instruction) <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={6}
              placeholder="Describe the complete autonomous task for the worker..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-lg p-3 text-xs text-zinc-200 placeholder-zinc-500 font-mono leading-relaxed focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>{isSubmitting ? 'Spawning...' : 'Spawn Detached Run'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
