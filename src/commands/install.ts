import { collectEnvironment } from '../core/env.ts';
import { planInstall, runInstall } from '../install/deps.ts';
import { flagBoolean, flagString, type ParsedArgs } from '../core/args.ts';

export interface InstallOptions {
  root?: string;
  dryRun: boolean;
  timeoutMs?: number;
}

export function parseInstallOptions(args: ParsedArgs): InstallOptions {
  const timeout = flagString(args.flags, 'timeout');
  return {
    root: flagString(args.flags, 'root'),
    dryRun: flagBoolean(args.flags, 'dry-run', false),
    timeoutMs: timeout ? Number(timeout) * 1000 : undefined,
  };
}

export async function runInstallCommand(options: InstallOptions): Promise<number> {
  const snapshot = await collectEnvironment({ root: options.root });
  const plans = planInstall(snapshot);

  if (plans.length === 0) {
    console.log('· no dependency install command detected');
    return 0;
  }

  for (const plan of plans) {
    console.log(`→ ${plan.command} (${plan.reason})`);
    const result = await runInstall(plan, {
      cwd: snapshot.root,
      dryRun: options.dryRun,
      timeoutMs: options.timeoutMs,
    });
    if (result.code !== 0) {
      console.log(`✗ ${plan.command} failed with exit code ${result.code}`);
      if (result.output) console.log(result.output.slice(-2000));
      return result.code;
    }
    console.log(`✓ ${plan.command} finished in ${(result.durationMs / 1000).toFixed(1)}s`);
  }

  return 0;
}
