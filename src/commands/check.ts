import path from 'node:path';
import { readTextIfExists } from '../util/fsx.ts';
import { collectEnvironment } from '../core/env.ts';
import { renderAgentsMd, normalizeForComparison, BEGIN_MARKER, END_MARKER } from '../render/agents-md.ts';
import { resolveLang, type Lang } from '../i18n.ts';
import { flagBoolean, flagString, type ParsedArgs } from '../core/args.ts';

export interface CheckOptions {
  root?: string;
  lang: Lang;
  outFile: string;
  json: boolean;
  quiet: boolean;
}

export function parseCheckOptions(args: ParsedArgs): CheckOptions {
  return {
    root: flagString(args.flags, 'root'),
    lang: resolveLang(flagString(args.flags, 'lang')),
    outFile: flagString(args.flags, 'out') ?? 'AGENTS.md',
    json: flagBoolean(args.flags, 'json', false),
    quiet: flagBoolean(args.flags, 'quiet', false),
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
}

export async function runCheck(options: CheckOptions): Promise<number> {
  const snapshot = await collectEnvironment({ root: options.root, exclude: [options.outFile] });
  const file = path.join(snapshot.root, options.outFile);
  const existing = await readTextIfExists(file);

  const report: CheckReport = {
    ok: true,
    file,
    exists: existing !== undefined,
    stale: false,
    fingerprint: snapshot.fingerprint,
  };

  if (existing === undefined) {
    report.ok = false;
    report.stale = true;
    report.reason = 'AGENTS.md does not exist';
  } else {
    const begin = existing.indexOf(BEGIN_MARKER);
    const end = existing.indexOf(END_MARKER);
    if (begin === -1 || end === -1) {
      report.ok = false;
      report.stale = true;
      report.reason = 'no managed block found in AGENTS.md';
    } else {
      const current = normalizeForComparison(existing.slice(begin + BEGIN_MARKER.length, end));
      const expected = normalizeForComparison(
        renderAgentsMd(snapshot, { lang: options.lang, generator: 'devtools-agents' }),
      );
      if (current !== expected) {
        report.ok = false;
        report.stale = true;
        report.reason = 'the generated block is out of date';
      }
    }
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!options.quiet) {
    if (report.ok) {
      console.log(`✓ ${options.outFile} is up to date (env ${report.fingerprint})`);
    } else {
      console.log(`✗ ${report.reason} - run \`devtools agents init\` to refresh it`);
    }
  }

  return report.ok ? 0 : 1;
}
