/**
 * WorkerAdapter interface for DSH Agent Swarm.
 * Allows pluggable subagent execution backends (ZCode CLI, Shell/Bash, Codex, etc.).
 */

export interface AdapterCommandSpec {
  prompt: string;
  cwd: string;
  mode?: 'build' | 'edit' | 'plan' | 'yolo' | string;
  disallowedTools?: string[];
  resumeSessionId?: string;
  timeout?: number;
}

export interface AdapterCommandResult {
  cmd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export interface WorkerAdapter {
  readonly name: string;
  readonly description: string;
  buildCommand(spec: AdapterCommandSpec): AdapterCommandResult;
}
