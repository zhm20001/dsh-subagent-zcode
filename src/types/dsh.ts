/**
 * Compatibility types for DeepSeek Harness (DSH) and Cordis microkernel.
 * Allows dsh-agent-swarm to operate both inside DSH and as a standalone web workspace.
 */

export interface DshContext {
  tools?: {
    register: (tool: any) => void;
    get?: (name: string) => any;
  };
  jobs?: {
    attachController?: (name: string) => void;
    start?: (options: any) => string;
  };
  subagents?: {
    registerProvider?: (provider: any) => void;
  };
  logger?: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
  plugin?: (plugin: any, config?: any) => any;
  on?: (event: string, callback: (...args: any[]) => void) => () => void;
  emit?: (event: string, ...args: any[]) => void;
}

export interface DshAgent {
  id: string;
  session: {
    id: string;
    header: {
      cwd: string;
      createdAt: number;
    };
  };
  inject?: (message: any) => void;
  followup?: (message: any) => void;
  status?: 'idle' | 'running';
}
