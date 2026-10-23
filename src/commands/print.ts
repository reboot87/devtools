import { collectEnvironment } from '../core/env.ts';
import { renderAgentsMd } from '../render/agents-md.ts';
import { resolveLang, type Lang } from '../i18n.ts';
import { flagBoolean, flagString, type ParsedArgs } from '../core/args.ts';

export interface PrintOptions {
  root?: string;
  lang: Lang;
  json: boolean;
  treeDepth: number;
}

export function parsePrintOptions(args: ParsedArgs): PrintOptions {
  const depth = flagString(args.flags, 'depth');
  return {
    root: flagString(args.flags, 'root'),
    lang: resolveLang(flagString(args.flags, 'lang')),
    json: flagBoolean(args.flags, 'json', false),
    treeDepth: depth ? Number(depth) : 2,
  };
}

export async function runPrint(options: PrintOptions): Promise<number> {
  const snapshot = await collectEnvironment({
    root: options.root,
    treeDepth: options.treeDepth,
    // `print` must not write anything, so the toolchain cache is read only.
    noToolchainCache: true,
  });

  if (options.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return 0;
  }

  console.log(renderAgentsMd(snapshot, { lang: options.lang, generator: 'devtools-agents' }));
  return 0;
}
