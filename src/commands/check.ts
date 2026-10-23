import path from 'node:path';
import { readTextIfExists } from '../util/fsx.ts';
import { collectEnvironment } from '../core/env.ts';
import { renderAgentsMd, normalizeForComparison, BEGIN_MARKER, END_MARKER } from '../render/agents-md.ts';
import { readManagedBlock, writeAgentsMd } from '../render/write.ts';
import { resolveLang, type Lang } from '../i18n.ts';
import { flagBoolean, flagString, type ParsedArgs } from '../core/args.ts';

export interface CheckOptions {
  root?: string;
  lang: Lang;
  outFile: string;
  json: boolean;
  quiet: boolean;
  /** Repair the document in place instead of reporting failure. */
  fix: boolean;
  /** Skip the machine toolchain entirely; used by tests. */
  noToolchain?: boolean;
}

export function parseCheckOptions(args: ParsedArgs): CheckOptions {
  return {
    root: flagString(args.flags, 'root'),
    lang: resolveLang(flagString(args.flags, 'lang')),
    outFile: flagString(args.flags, 'out') ?? 'AGENTS.md',
    json: flagBoolean(args.flags, 'json', false),
    quiet: flagBoolean(args.flags, 'quiet', false),
    fix: flagBoolean(args.flags, 'fix', false),
  };
}

export interface CheckReport {
  ok: boolean;
  file: string;
  exists: boolean;
  stale: boolean;
  fingerprint: string;
  storedFingerprint?: string;
  reason?: string;
  /** True when `--fix` rewrote the document during this run. */
  fixed?: boolean;
  /** Reason that was repaired, kept for machine readable output. */
  repairedReason?: string;
}

interface Evaluation {
  exists: boolean;
  ok: boolean;
  reason?: string;
}

function evaluate(existing: string | undefined, expected: string): Evaluation {
  if (existing === undefined) {
    return { exists: false, ok: false, reason: 'AGENTS.md does not exist' };
  }

  const begin = existing.indexOf(BEGIN_MARKER);
  const end = existing.indexOf(END_MARKER);
  if (begin === -1 || end === -1) {
    return { exists: true, ok: false, reason: 'no managed block found in AGENTS.md' };
  }

  const managed = readManagedBlock(existing);
  if (!managed) {
    return { exists: true, ok: false, reason: 'malformed or missing managed block in AGENTS.md' };
  }

  if (normalizeForComparison(managed.block) !== normalizeForComparison(expected)) {
    return { exists: true, ok: false, reason: 'the generated block is out of date' };
  }

  return { exists: true, ok: true };
}

export async function runCheck(options: CheckOptions): Promise<number> {
  const snapshot = await collectEnvironment({
    root: options.root,
    exclude: [options.outFile],
    noToolchain: options.noToolchain,
  });
  const file = path.join(snapshot.root, options.outFile);
  const expected = renderAgentsMd(snapshot, { lang: options.lang, generator: 'devtools-agents' });

  let existing = await readTextIfExists(file);
  let state = evaluate(existing, expected);

  const report: CheckReport = {
    ok: state.ok,
    file,
    exists: state.exists,
    stale: !state.ok,
    fingerprint: snapshot.fingerprint,
  };
  if (state.reason) report.reason = state.reason;

  if (!state.ok && options.fix) {
    // Repair through the same writer `init` uses, so unmanaged text around the
    // block is preserved and a stale file is patched rather than replaced.
    const repairedReason = state.reason;
    const written = await writeAgentsMd(file, expected, { lang: options.lang });
    existing = await readTextIfExists(file);
    state = evaluate(existing, expected);
    report.ok = state.ok;
    report.stale = !state.ok;
    report.exists = state.exists;
    report.reason = state.reason;
    report.fixed = written.action !== 'unchanged';
    if (repairedReason) report.repairedReason = repairedReason;
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!options.quiet) {
    if (report.ok && report.fixed) {
      console.log(`✓ ${options.outFile} refreshed (env ${report.fingerprint})`);
    } else if (report.ok) {
      console.log(`✓ ${options.outFile} is up to date (env ${report.fingerprint})`);
    } else {
      console.log(`✗ ${report.reason}`);
      if (!options.fix) console.log('  run `devtools agents init` or `devtools agents check --fix` to refresh it');
    }
  }

  return report.ok ? 0 : 1;
}
