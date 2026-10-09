export type TaskStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'KILLED' | 'TIMEOUT_KILLED';

export interface Task {
  taskId: string;
  ticket?: string;
  label: string;
  prompt: string;
  pid?: number;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  timeout: number;
  adapter: string;
  cwd: string;
  exitCode?: number | null;
  error?: string;
}

export interface TaskDetailData extends Task {
  report?: string;
  rawLogTail?: string;
}

export interface DiffData {
  diff: string;
  status: string;
  cwd: string;
}
