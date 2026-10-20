import path from 'node:path';
import { readTextIfExists } from '../util/fsx.ts';
import type { EnvVarInfo } from '../core/types.ts';
import type { ScanResult } from '../core/scan.ts';

const ENV_FILE_CANDIDATES = [
  '.env.example',
  '.env.sample',
  '.env.template',
  '.env.defaults',
  '.env.dist',
  '.env.local.example',
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
];

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.java',
  '.kt',
  '.cs',
  '.sh',
  '.yml',
  '.yaml',
]);

const ENV_PATTERNS: RegExp[] = [
  /process\.env\.([A-Z][A-Z0-9_]{2,})/g,
  /process\.env\[['"`]([A-Z][A-Z0-9_]{2,})['"`]\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]{2,})/g,
  /os\.environ(?:\.get)?[[(]\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /os\.Getenv\(\s*"([A-Z][A-Z0-9_]{2,})"\s*\)/g,
  /Deno\.env\.get\(\s*"([A-Z][A-Z0-9_]{2,})"\s*\)/g,
  /ENV\[['"`]([A-Z][A-Z0-9_]{2,})['"`]\]/g,
  /System\.getenv\("([A-Z][A-Z0-9_]{2,})"\)/g,
];

function parseEnvFile(text: string): { name: string; description?: string; required: boolean }[] {
  const result: { name: string; description?: string; required: boolean }[] = [];
  let pendingComment: string | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      pendingComment = line.replace(/^#+\s*/, '').trim() || undefined;
      continue;
    }
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const name = match[1] as string;
    let rawValue = (match[2] ?? '').trim();
    // Strip trailing inline comments outside of quotes.
    if (!rawValue.startsWith('"') && !rawValue.startsWith("'")) {
      const hashIndex = rawValue.indexOf(' #');
      if (hashIndex !== -1) rawValue = rawValue.slice(0, hashIndex).trim();
    }
    rawValue = rawValue.replace(/^["']|["']$/g, '');
    const empty = rawValue === '';
    const placeholder = /^(changeme|your[_-]?.*|xxx+|<.*>|\.\.\.)$/i.test(rawValue);
    result.push({
      name,
      description: pendingComment,
      required: empty || placeholder,
    });
    pendingComment = undefined;
  }

  return result;
}

export async function detectEnvVars(root: string, scan: ScanResult): Promise<EnvVarInfo[]> {
  const byName = new Map<string, EnvVarInfo>();

  for (const file of ENV_FILE_CANDIDATES) {
    const text = await readTextIfExists(path.join(root, file));
    if (!text) continue;
    for (const entry of parseEnvFile(text)) {
      const existing = byName.get(entry.name);
      if (existing) {
        existing.description = existing.description ?? entry.description;
        existing.required = existing.required && entry.required;
        if (!existing.source.endsWith('.example')) existing.source = existing.source;
        continue;
      }
      byName.set(entry.name, {
        name: entry.name,
        source: file,
        description: entry.description,
        required: entry.required,
      });
    }
  }

  // Variables referenced from source code but not documented anywhere.
  const sourceFiles = scan.files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  for (const file of sourceFiles.slice(0, 800)) {
    const text = await readTextIfExists(path.join(root, file));
    if (!text) continue;
    for (const pattern of ENV_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1];
        if (!name) continue;
        if (byName.has(name)) continue;
        byName.set(name, { name, source: file, required: true });
      }
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
}
