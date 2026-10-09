import { spawn, execSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WorkerAdapter } from '../adapters/base.ts';
import { ZCodeAdapter } from '../adapters/zcode.ts';
import { BashAdapter } from '../adapters/bash.ts';

export type TaskStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'KILLED' | 'TIMEOUT_KILLED';

export interface TaskMeta {
  taskId: string;
  ticket?: string;
  label: string;
  prompt: string;
  pid?: number;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  timeout: number; // in seconds
  adapter: string;
  cwd: string;
  exitCode?: number | null;
  error?: string;
}

export const SWARM_RUNS_DIR = resolve(process.cwd(), '.swarm-runs');

export function getTaskDir(taskId: string): string {
  return join(SWARM_RUNS_DIR, taskId);
}

export function ensureRunsDir(): void {
  if (!existsSync(SWARM_RUNS_DIR)) {
    mkdirSync(SWARM_RUNS_DIR, { recursive: true });
  }
}

export function getAdapter(name: string): WorkerAdapter {
  if (name === 'bash' || name === 'shell') {
    return new BashAdapter();
  }
  return new ZCodeAdapter();
}

/**
 * Spawns a detached background subagent task redirecting stdio to raw.log.
 */
export function spawnDetachedTask(options: {
  taskId?: string;
  ticket?: string;
  label?: string;
  prompt: string;
  cwd?: string;
  adapter?: string;
  mode?: string;
  disallowedTools?: string[];
  resumeSessionId?: string;
  timeout?: number;
}): TaskMeta {
  ensureRunsDir();

  const taskId = options.taskId || `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const taskDir = getTaskDir(taskId);
  mkdirSync(taskDir, { recursive: true });

  const rawLogPath = join(taskDir, 'raw.log');
  const metaPath = join(taskDir, 'meta.json');
  const taskCwd = resolve(options.cwd || process.cwd());
  const adapterName = options.adapter || 'zcode';
  const adapter = getAdapter(adapterName);
  const timeout = options.timeout || 1800; // default 30 minutes

  const commandSpec = adapter.buildCommand({
    prompt: options.prompt,
    cwd: taskCwd,
    mode: options.mode,
    disallowedTools: options.disallowedTools,
    resumeSessionId: options.resumeSessionId,
    timeout,
  });

  const header = `=== Swarm Task ${taskId} [${options.ticket || 'NO-TICKET'}] ===\n`
    + `Adapter: ${adapterName} | Started: ${new Date().toISOString()}\n`
    + `Command: ${commandSpec.cmd} ${commandSpec.args.join(' ')}\n`
    + `Working Dir: ${taskCwd}\n`
    + `====================================================\n\n`;

  writeFileSync(rawLogPath, header, { flag: 'a' });

  const logFd = openSync(rawLogPath, 'a');

  let child;
  try {
    child = spawn(commandSpec.cmd, commandSpec.args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: taskCwd,
      env: commandSpec.env || process.env,
    });
  } catch (err: any) {
    closeSync(logFd);
    const meta: TaskMeta = {
      taskId,
      ticket: options.ticket,
      label: options.label || options.prompt.slice(0, 50),
      prompt: options.prompt,
      status: 'FAILED',
      startTime: Date.now(),
      endTime: Date.now(),
      timeout,
      adapter: adapterName,
      cwd: taskCwd,
      error: err.message,
    };
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    generateReport(taskId, meta, `Failed to spawn: ${err.message}`);
    return meta;
  }

  const pid = child.pid;

  const meta: TaskMeta = {
    taskId,
    ticket: options.ticket,
    label: options.label || options.prompt.slice(0, 50),
    prompt: options.prompt,
    pid,
    status: 'RUNNING',
    startTime: Date.now(),
    timeout,
    adapter: adapterName,
    cwd: taskCwd,
  };

  writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  child.on('close', (code, signal) => {
    closeSync(logFd);
    const currentMeta = readTaskMeta(taskId) || meta;
    if (currentMeta.status === 'RUNNING') {
      currentMeta.status = code === 0 ? 'COMPLETED' : 'FAILED';
      currentMeta.exitCode = code;
      currentMeta.endTime = Date.now();
      writeFileSync(metaPath, JSON.stringify(currentMeta, null, 2));
      generateReport(taskId, currentMeta);
    }
  });

  child.on('error', (err) => {
    try { closeSync(logFd); } catch {}
    const currentMeta = readTaskMeta(taskId) || meta;
    currentMeta.status = 'FAILED';
    currentMeta.error = err.message;
    currentMeta.endTime = Date.now();
    writeFileSync(metaPath, JSON.stringify(currentMeta, null, 2));
    generateReport(taskId, currentMeta, err.message);
  });

  // unref allows caller (and server/DSH) to exit or live independently
  child.unref();

  return meta;
}

export function readTaskMeta(taskId: string): TaskMeta | null {
  const metaPath = join(getTaskDir(taskId), 'meta.json');
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

export function updateTaskMeta(taskId: string, partial: Partial<TaskMeta>): TaskMeta | null {
  const current = readTaskMeta(taskId);
  if (!current) return null;
  const updated = { ...current, ...partial };
  writeFileSync(join(getTaskDir(taskId), 'meta.json'), JSON.stringify(updated, null, 2));
  return updated;
}

export function generateReport(taskId: string, meta: TaskMeta, extraNote?: string): void {
  const reportPath = join(getTaskDir(taskId), 'report.md');
  const durationSec = meta.endTime ? Math.round((meta.endTime - meta.startTime) / 1000) : 0;

  let logSnippet = '';
  const rawLogPath = join(getTaskDir(taskId), 'raw.log');
  if (existsSync(rawLogPath)) {
    try {
      const content = readFileSync(rawLogPath, 'utf8');
      const lines = content.split('\n');
      logSnippet = lines.slice(-40).join('\n');
    } catch {}
  }

  const report = `# Task Execution Summary: ${meta.taskId}

- **Ticket**: ${meta.ticket || 'N/A'}
- **Label**: ${meta.label}
- **Adapter**: \`${meta.adapter}\`
- **Status**: **${meta.status}**
- **Duration**: ${durationSec}s
- **Exit Code**: ${meta.exitCode ?? 'N/A'}
- **Working Dir**: \`${meta.cwd}\`
- **Completed At**: ${new Date(meta.endTime || Date.now()).toISOString()}

${extraNote ? `> ⚠️ **Note**: ${extraNote}\n` : ''}

### Task Prompt
\`\`\`
${meta.prompt}
\`\`\`

### Output Log Tail
\`\`\`
${logSnippet || '(No log output)'}
\`\`\`
`;

  writeFileSync(reportPath, report, 'utf8');
}

/**
 * Cross-platform process termination (POSIX SIGKILL or Windows taskkill).
 */
export function killTaskProcess(pid: number): boolean {
  if (!pid) return false;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`);
    } else {
      process.kill(-pid, 'SIGKILL'); // try kill process group
    }
    return true;
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch {
      return false;
    }
  }
}
