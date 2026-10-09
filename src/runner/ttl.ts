import { readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { SWARM_RUNS_DIR, readTaskMeta, updateTaskMeta, generateReport, killTaskProcess, getTaskDir } from './detached.ts';

export class TtlWatchdog {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;

  constructor(intervalMs: number = 10_000) {
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkTimeouts();
    }, this.intervalMs);
    // unref so timer doesn't prevent graceful server shutdown
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  checkTimeouts(): void {
    if (!existsSync(SWARM_RUNS_DIR)) return;

    try {
      const entries = readdirSync(SWARM_RUNS_DIR, { withFileTypes: true });
      const now = Date.now();

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const taskId = entry.name;
        const meta = readTaskMeta(taskId);
        if (!meta || meta.status !== 'RUNNING') continue;

        const maxDurationMs = (meta.timeout || 1800) * 1000;
        const elapsedMs = now - meta.startTime;

        if (elapsedMs > maxDurationMs) {
          const timeoutWarning = `\n[WATCHDOG] Task timed out after ${Math.round(elapsedMs / 1000)}s (limit: ${meta.timeout}s). Terminating PID ${meta.pid}...\n`;
          const rawLogPath = join(getTaskDir(taskId), 'raw.log');
          try {
            appendFileSync(rawLogPath, timeoutWarning, 'utf8');
          } catch {}

          if (meta.pid) {
            killTaskProcess(meta.pid);
          }

          const updated = updateTaskMeta(taskId, {
            status: 'TIMEOUT_KILLED',
            endTime: now,
          });

          if (updated) {
            generateReport(taskId, updated, 'Task exceeded execution TTL limit and was terminated by Watchdog');
          }
        }
      }
    } catch {}
  }
}
