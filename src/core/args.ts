export interface ParsedArgs {
  /** Positional arguments, e.g. `['agents', 'init']`. */
  positionals: string[];
  /** Flags: `--lang zh` becomes `{ lang: 'zh' }`, `--no-install` becomes `{ install: false }`. */
  flags: Record<string, string | boolean>;
}

/** Flags that consume the following argument as their value. */
const VALUE_FLAGS = new Set([
  'root',
  'lang',
  'mirror',
  'timeout',
  'out',
  'depth',
  'package',
  'name',
  'interval',
  'structure-interval',
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const withoutDashes = arg.slice(2);
    if (withoutDashes.startsWith('no-')) {
      flags[withoutDashes.slice(3)] = false;
      continue;
    }

    const eq = withoutDashes.indexOf('=');
    if (eq !== -1) {
      flags[withoutDashes.slice(0, eq)] = withoutDashes.slice(eq + 1);
      continue;
    }

    if (VALUE_FLAGS.has(withoutDashes) && i + 1 < argv.length) {
      flags[withoutDashes] = argv[i + 1] as string;
      i++;
      continue;
    }

    flags[withoutDashes] = true;
  }

  return { positionals, flags };
}

export function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

export function flagBoolean(flags: Record<string, string | boolean>, name: string, fallback = false): boolean {
  const value = flags[name];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value !== 'false' && value !== '0';
  return fallback;
}
