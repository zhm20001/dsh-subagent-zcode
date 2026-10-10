import React, { useEffect, useState, useRef } from 'react';
import { Terminal as TerminalIcon, Copy, Check, ArrowDown, Download } from 'lucide-react';
import { translations, type Language } from '../i18n.ts';

interface TerminalViewProps {
  taskId: string;
  isLive: boolean;
  lang: Language;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ taskId, isLive, lang }) => {
  const t = translations[lang];
  const [logs, setLogs] = useState<string>(t.connectingStream);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [streamActive, setStreamActive] = useState<boolean>(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs('');
    setStreamActive(true);

    const eventSource = new EventSource(`/api/tasks/${taskId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          setLogs((prev) => prev + data.text);
        }
        if (data.done) {
          setStreamActive(false);
          eventSource.close();
        }
      } catch {
        setLogs((prev) => prev + event.data + '\n');
      }
    };

    eventSource.onerror = () => {
      setStreamActive(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [taskId]);

  useEffect(() => {
    if (autoScroll) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${taskId}-raw.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 font-mono text-xs">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/60 text-zinc-400">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-indigo-400" />
          <span className="font-semibold text-zinc-300">raw.log</span>
          {streamActive ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t.liveSseStream}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
              {t.streamClosed}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
              autoScroll ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <ArrowDown className="h-3 w-3" />
            <span>{t.autoScroll}</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? t.copied : t.copy}</span>
          </button>

          <button
            onClick={handleDownload}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title={t.downloadLog}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto leading-relaxed whitespace-pre-wrap select-text text-zinc-300">
        {logs || <span className="text-zinc-600">{t.waitingStdout}</span>}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
