import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'node:http';
import { readdirSync, existsSync, readFileSync, statSync, createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { exec } from 'node:child_process';
import {
  SWARM_RUNS_DIR,
  ensureRunsDir,
  spawnDetachedTask,
  readTaskMeta,
  updateTaskMeta,
  killTaskProcess,
  generateReport,
  getTaskDir,
  type TaskMeta,
} from './runner/detached.ts';
import { TtlWatchdog } from './runner/ttl.ts';
import { defaultWatcher } from './watcher.ts';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// Initialize background watchdog and file watcher
const watchdog = new TtlWatchdog(10_000);
watchdog.start();
defaultWatcher.start();

// API Routes

/**
 * GET /api/tasks - list all tasks
 */
app.get('/api/tasks', (_req: Request, res: Response) => {
  ensureRunsDir();
  try {
    const entries = readdirSync(SWARM_RUNS_DIR, { withFileTypes: true });
    const tasks: TaskMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const meta = readTaskMeta(entry.name);
      if (meta) tasks.push(meta);
    }
    tasks.sort((a, b) => b.startTime - a.startTime);
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/dispatch - spawn a new detached task
 */
app.post('/api/tasks/dispatch', (req: Request, res: Response) => {
  try {
    const { prompt, ticket, label, adapter, mode, cwd, timeout } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const meta = spawnDetachedTask({
      prompt,
      ticket,
      label,
      adapter: adapter || 'zcode',
      mode: mode || 'edit',
      cwd: cwd || process.cwd(),
      timeout: timeout ? parseInt(timeout, 10) : 1800,
    });

    res.status(201).json(meta);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tasks/:id - get task details, meta and report
 */
app.get('/api/tasks/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const meta = readTaskMeta(id);
  if (!meta) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const reportPath = join(getTaskDir(id), 'report.md');
  let report = '';
  if (existsSync(reportPath)) {
    try {
      report = readFileSync(reportPath, 'utf8');
    } catch {}
  }

  const rawLogPath = join(getTaskDir(id), 'raw.log');
  let rawLog = '';
  if (existsSync(rawLogPath)) {
    try {
      rawLog = readFileSync(rawLogPath, 'utf8');
    } catch {}
  }

  res.json({
    ...meta,
    report,
    rawLogTail: rawLog.slice(-5000),
  });
});

/**
 * POST /api/tasks/:id/kill - kill running process
 */
app.post('/api/tasks/:id/kill', (req: Request, res: Response) => {
  const { id } = req.params;
  const meta = readTaskMeta(id);
  if (!meta) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (meta.status !== 'RUNNING') {
    return res.json({ message: `Task is already ${meta.status}`, meta });
  }

  if (meta.pid) {
    killTaskProcess(meta.pid);
  }

  const updated = updateTaskMeta(id, {
    status: 'KILLED',
    endTime: Date.now(),
  });

  if (updated) {
    generateReport(id, updated, 'Terminated by operator via Web UI');
  }

  res.json({ success: true, meta: updated });
});

/**
 * GET /api/tasks/:id/stream - SSE live log stream
 */
app.get('/api/tasks/:id/stream', (req: Request, res: Response) => {
  const { id } = req.params;
  const taskDir = getTaskDir(id);
  const logPath = join(taskDir, 'raw.log');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let sentBytes = 0;

  const sendNewChunk = () => {
    if (!existsSync(logPath)) return;
    try {
      const stats = statSync(logPath);
      if (stats.size > sentBytes) {
        const stream = createReadStream(logPath, { start: sentBytes, end: stats.size });
        sentBytes = stats.size;
        stream.on('data', (chunk) => {
          const text = chunk.toString('utf8');
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        });
      }
    } catch {}
  };

  // Send initial chunk
  sendNewChunk();

  const interval = setInterval(() => {
    sendNewChunk();
    const currentMeta = readTaskMeta(id);
    if (currentMeta && currentMeta.status !== 'RUNNING') {
      sendNewChunk();
      res.write(`data: ${JSON.stringify({ status: currentMeta.status, done: true })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 500);

  req.on('close', () => {
    clearInterval(interval);
  });
});

/**
 * GET /api/tasks/:id/diff - Git diff view
 */
app.get('/api/tasks/:id/diff', (req: Request, res: Response) => {
  const { id } = req.params;
  const meta = readTaskMeta(id);
  const targetCwd = meta?.cwd || process.cwd();

  exec('git diff HEAD', { cwd: targetCwd, maxBuffer: 1024 * 1024 * 5 }, (err, stdout) => {
    exec('git status --short', { cwd: targetCwd }, (err2, statusOut) => {
      res.json({
        diff: stdout || '(No modified files found in working directory)',
        status: statusOut || '',
        cwd: targetCwd,
      });
    });
  });
});

/**
 * GET /api/health - Swarm system status
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    runsDir: SWARM_RUNS_DIR,
  });
});

// Setup Vite middleware or static file serving
export async function startServer(port: number = PORT): Promise<any> {
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = resolve(process.cwd(), 'dist');

  if (isProd && existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(join(distDir, 'index.html'));
    });
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn('Vite middleware could not be loaded in this mode, falling back to static/API');
    }
  }

  const httpServer = createHttpServer(app);
  httpServer.listen(port, HOST, () => {
    console.log(`[DSH Swarm] 🚀 Web workspace running at http://${HOST}:${port}`);
  });

  return httpServer;
}

// Start immediately when executed directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app };
