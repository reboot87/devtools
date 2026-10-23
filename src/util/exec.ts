import { spawn } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Set when the command could not be spawned at all. */
  error?: string;
}

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** Maximum characters kept from stdout/stderr. */
  maxOutput?: number;
}

const DEFAULT_TIMEOUT = 10 * 60 * 1000;
const DEFAULT_MAX_OUTPUT = 20_000;

export function runCommand(command: string, opts: RunOptions): Promise<RunResult> {
  return spawnProcess(command, null, opts);
}

/**
 * Runs an executable directly, without a shell.
 *
 * Resolution through the shell costs a full `cmd.exe` / `sh` start on every
 * call, which dominates probing two dozen tools; a direct spawn is orders of
 * magnitude cheaper and reports a missing binary as ENOENT immediately.
 */
export function runBinary(file: string, args: string[], opts: RunOptions): Promise<RunResult> {
  return spawnProcess(file, args, opts);
}

function spawnProcess(command: string, args: string[] | null, opts: RunOptions): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxOutput = opts.maxOutput ?? DEFAULT_MAX_OUTPUT;

  return new Promise<RunResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = args
      ? spawn(command, args, {
          cwd: opts.cwd,
          env: opts.env ?? process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
      : spawn(command, {
          cwd: opts.cwd,
          env: opts.env ?? process.env,
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Escalate if the process ignores SIGTERM.
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref?.();
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > maxOutput) stdout = stdout.slice(-maxOutput);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > maxOutput) stderr = stderr.slice(-maxOutput);
    });

    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.on('error', (err) => {
      finish({ code: 127, stdout, stderr, timedOut, error: err.message });
    });
    child.on('close', (code) => {
      finish({ code: code ?? 0, stdout, stderr, timedOut });
    });
  });
}
