import type { WorkerAdapter, AdapterCommandSpec, AdapterCommandResult } from './base.ts';

export class BashAdapter implements WorkerAdapter {
  readonly name = 'bash';
  readonly description = 'Standard POSIX Bash shell subagent for autonomous CLI routines';

  buildCommand(spec: AdapterCommandSpec): AdapterCommandResult {
    return {
      cmd: 'bash',
      args: ['-c', spec.prompt],
      env: { ...process.env },
    };
  }
}
