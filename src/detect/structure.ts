import path from 'node:path';
import type { DirInfo, DirPurpose, LanguageInfo } from '../core/types.ts';
import type { ScanResult } from '../core/scan.ts';

export type { DirPurpose };

const DIR_PURPOSES: Record<string, DirPurpose> = {
  src: 'source',
  lib: 'source',
  app: 'source',
  source: 'source',
  server: 'services',
  client: 'source',
  api: 'api',
  routes: 'api',
  controllers: 'api',
  handlers: 'api',
  models: 'source',
  domain: 'source',
  core: 'source',
  common: 'source',
  shared: 'source',
  utils: 'source',
  helpers: 'source',
  services: 'services',
  workers: 'workers',
  jobs: 'workers',
  tasks: 'workers',
  queue: 'workers',
  components: 'components',
  widgets: 'components',
  views: 'components',
  pages: 'components',
  templates: 'components',
  layouts: 'components',
  styles: 'styles',
  assets: 'assets',
  static: 'assets',
  public: 'public',
  images: 'assets',
  icons: 'assets',
  fonts: 'assets',
  tests: 'tests',
  test: 'tests',
  __tests__: 'tests',
  spec: 'tests',
  e2e: 'tests',
  cypress: 'tests',
  playwright: 'tests',
  fixtures: 'tests',
  __mocks__: 'tests',
  docs: 'docs',
  doc: 'docs',
  documentation: 'docs',
  examples: 'examples',
  example: 'examples',
  samples: 'examples',
  demo: 'examples',
  scripts: 'scripts',
  tools: 'scripts',
  bin: 'scripts',
  config: 'config',
  configs: 'config',
  db: 'database',
  database: 'database',
  prisma: 'database',
  models_db: 'database',
  migrations: 'migrations',
  seeds: 'database',
  seeders: 'database',
  build: 'build',
  dist: 'build',
  out: 'build',
  release: 'build',
  target: 'build',
  ci: 'ci',
  workflows: 'ci',
  infra: 'infra',
  deploy: 'infra',
  deployment: 'infra',
  k8s: 'infra',
  helm: 'infra',
  terraform: 'infra',
  docker: 'infra',
  packages: 'packages',
  apps: 'packages',
  modules: 'packages',
  plugins: 'packages',
  extensions: 'packages',
  vendors: 'packages',
  generated: 'generated',
  __generated__: 'generated',
  '.github': 'ci',
};

const ENTRY_POINT_FILES = [
  'main.ts',
  'main.js',
  'main.py',
  'main.go',
  'main.rs',
  'index.ts',
  'index.js',
  'index.mjs',
  'app.ts',
  'app.py',
  'app.js',
  'server.ts',
  'server.js',
  'cli.ts',
  'cli.js',
  'manage.py',
  '__main__.py',
  'Program.cs',
  'main.cjs',
  'src/main.rs',
  'src/main.ts',
  'src/index.ts',
  'src/index.js',
  'src/app.ts',
  'src/app.py',
  'src/server.ts',
  'src/cli.ts',
  'src/cli.js',
  'app/main.go',
  'cmd/main.go',
  'app.py',
  'wsgi.py',
  'asgi.py',
];

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (React)',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (React)',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.pyi': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.c': 'C',
  '.h': 'C/C++ header',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.hpp': 'C++ header',
  '.swift': 'Swift',
  '.m': 'Objective-C',
  '.mm': 'Objective-C++',
  '.dart': 'Dart',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.scala': 'Scala',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.ps1': 'PowerShell',
  '.sql': 'SQL',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.astro': 'Astro',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.less': 'Less',
  '.html': 'HTML',
  '.md': 'Markdown',
  '.json': 'JSON',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.toml': 'TOML',
  '.xml': 'XML',
};

const IGNORED_LANGUAGE_EXTENSIONS = new Set([
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.xml',
  '.md',
  '.css',
  '.html',
  '.lock',
]);

export function detectLanguages(scan: ScanResult): LanguageInfo[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const [ext, count] of scan.extensionCounts) {
    if (IGNORED_LANGUAGE_EXTENSIONS.has(ext)) continue;
    const language = LANGUAGE_BY_EXTENSION[ext];
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + count);
    total += count;
  }
  return [...counts.entries()]
    .map(([name, files]) => ({ name, files, share: total === 0 ? 0 : files / total }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 8);
}

export function detectDirs(scan: ScanResult, root: string): DirInfo[] {
  const topLevel = new Set<string>();
  for (const dir of scan.dirs) {
    const first = dir.split('/')[0];
    if (first) topLevel.add(first);
  }

  const dirs: DirInfo[] = [];
  for (const name of [...topLevel].sort()) {
    let files = 0;
    for (const [dir, count] of scan.dirFileCounts) {
      if (dir === name || dir.startsWith(`${name}/`)) files += count;
    }
    const purpose = DIR_PURPOSES[name] ?? 'other';
    dirs.push({ path: name, purpose, files });
  }
  void root;
  return dirs;
}

export function detectEntryPoints(scan: ScanResult): string[] {
  const found = new Set<string>();
  const candidates = new Set([...scan.files, ...ENTRY_POINT_FILES.filter((f) => scan.files.includes(f))]);

  // Explicit well known entry points.
  for (const candidate of ENTRY_POINT_FILES) {
    if (scan.files.includes(candidate)) found.add(candidate);
  }

  // Common entry point names anywhere near the root or in src/.
  for (const file of scan.files) {
    const depth = file.split('/').length;
    if (depth > 3) continue;
    const base = path.posix.basename(file);
    if (/^(index|main|server|app|cli|entry|program)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs)$/i.test(base)) {
      if (!found.has(file)) found.add(file);
    }
    if (base === 'manage.py' || base === 'wsgi.py' || base === 'asgi.py') found.add(file);
    if (file === 'src/main.rs') found.add(file);
  }

  void candidates;
  return [...found].sort().slice(0, 12);
}
