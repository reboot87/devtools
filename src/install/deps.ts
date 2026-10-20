import path from 'node:path';
import { runCommand } from '../util/exec.ts';
import type { EnvSnapshot } from '../core/types.ts';

export interface InstallPlan {
  manager: string;
  command: string;
  reason: string;
  /** When true the command may modify the lockfile. */
  mutatesLockfile: boolean;
}

/** Builds the list of install commands for the detected project. */
export function planInstall(snapshot: EnvSnapshot): InstallPlan[] {
  const plans: InstallPlan[] = [];

  for (const manager of snapshot.packageManagers) {
    if (!manager.installCommand) continue;
    const mutatesLockfile =
      manager.installCommand.includes('install') && !manager.installCommand.includes('--frozen-lockfile');
    plans.push({
      manager: manager.name,
      command: manager.installCommand,
      reason: manager.lockfile ? `lockfile ${manager.lockfile}` : `detected ${manager.name} project`,
      mutatesLockfile,
    });
  }

  return plans;
}

export interface InstallResult {
  plan: InstallPlan;
  code: number;
  durationMs: number;
  timedOut: boolean;
  output: string;
  error?: string;
}

export interface InstallOptions {
  cwd: string;
  timeoutMs?: number;
  /** When true nothing is executed, the plan is only printed. */
  dryRun?: boolean;
  /** Called with streamed output while the install runs. */
  onOutput?: (chunk: string) => void;
}

export async function runInstall(plan: InstallPlan, options: InstallOptions): Promise<InstallResult> {
  const started = Date.now();
  if (options.dryRun) {
    return {
      plan,
      code: 0,
      durationMs: 0,
      timedOut: false,
      output: `(dry run) ${plan.command}`,
    };
  }

  const result = await runCommand(plan.command, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs ?? 15 * 60 * 1000,
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  options.onOutput?.(output);

  return {
    plan,
    code: result.code,
    durationMs: Date.now() - started,
    timedOut: result.timedOut,
    output,
    error: result.error,
  };
}

/**
 * Installs the tool itself into a project (as a dev dependency) or globally.
 * Kept separate from the dependency install so it can be opted into explicitly.
 */
export async function installSelf(
  target: string,
  options: { global?: boolean; root: string; timeoutMs?: number },
): Promise<InstallResult> {
  const command = options.global ? 'npm install -g devtools-agents' : 'npm install --save-dev devtools-agents';
  const plan: InstallPlan = {
    manager: 'npm',
    command,
    reason: options.global ? 'global CLI install' : 'project dev dependency',
    mutatesLockfile: true,
  };
  return runInstall(plan, { cwd: options.root, timeoutMs: options.timeoutMs });
}

export function resolveInstallCwd(snapshot: EnvSnapshot): string {
  return path.resolve(snapshot.root);
}
