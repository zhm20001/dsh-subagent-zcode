import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkerAdapter, AdapterCommandSpec, AdapterCommandResult } from './base.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_ZCODE = resolve(__dirname, '../../tests/fixtures/fake-zcode.cjs');

export class ZCodeAdapter implements WorkerAdapter {
  readonly name = 'zcode';
  readonly description = 'ZCode headless CLI subagent with structured json and resume rounds';

  private cliPath: string;

  constructor(cliPath?: string) {
    if (cliPath && existsSync(cliPath)) {
      this.cliPath = cliPath;
    } else if (process.env.ZCODE_CLI_PATH && existsSync(process.env.ZCODE_CLI_PATH)) {
      this.cliPath = process.env.ZCODE_CLI_PATH;
    } else if (existsSync(FIXTURE_ZCODE)) {
      this.cliPath = FIXTURE_ZCODE;
    } else {
      this.cliPath = 'zcode';
    }
  }

  buildCommand(spec: AdapterCommandSpec): AdapterCommandResult {
    const isNodeScript = this.cliPath.endsWith('.cjs') || this.cliPath.endsWith('.js');
    const cmd = isNodeScript ? 'node' : this.cliPath;
    const baseArgs: string[] = isNodeScript ? [this.cliPath] : [];

    const args: string[] = [...baseArgs];

    if (spec.resumeSessionId) {
      args.push('--resume', spec.resumeSessionId);
    }

    args.push('-p', spec.prompt);
    args.push('--json');
    args.push('--cwd', spec.cwd);
    args.push('--mode', spec.mode || 'edit');

    if (spec.disallowedTools && spec.disallowedTools.length > 0) {
      args.push('--disallowed-tools', spec.disallowedTools.join(','));
    }

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (this.cliPath === FIXTURE_ZCODE) {
      env.FAKE_ZCODE_BEHAVIOR = 'ok';
      env.FAKE_ZCODE_RESPONSE = `ZCode task processed: "${spec.prompt.slice(0, 50)}..."`;
    }

    return { cmd, args, env };
  }
}
