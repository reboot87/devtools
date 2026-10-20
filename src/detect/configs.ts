import path from 'node:path';
import { readTextIfExists } from '../util/fsx.ts';
import { listDir } from '../util/fsx.ts';
import { parseToml, tomlGet } from '../util/toml.ts';
import type { CiInfo, ConfigInfo } from '../core/types.ts';

function stripJsonComments(text: string): string {
  return text
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (match, comment) => (comment ? '' : match))
    .replace(/,(\s*[}\]])/g, '$1');
}

function parseJsonLoose(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(stripJsonComments(text)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function parseIni(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('[')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim().toLowerCase()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

interface ConfigCandidate {
  file: string;
  label: string;
  extract?: (text: string) => string[];
}

const CANDIDATES: ConfigCandidate[] = [
  {
    file: 'tsconfig.json',
    label: 'TypeScript',
    extract: (text) => {
      const json = parseJsonLoose(text);
      const options = (json?.['compilerOptions'] ?? {}) as Record<string, unknown>;
      const details: string[] = [];
      if (options['strict'] === true) details.push('strict mode on');
      else if (options['strict'] === false) details.push('strict mode off');
      if (typeof options['target'] === 'string') details.push(`target ${options['target']}`);
      if (typeof options['module'] === 'string') details.push(`module ${options['module']}`);
      if (typeof options['moduleResolution'] === 'string') details.push(`moduleResolution ${options['moduleResolution']}`);
      if (options['noUncheckedIndexedAccess'] === true) details.push('noUncheckedIndexedAccess');
      if (options['paths'] && typeof options['paths'] === 'object') {
        const aliases = Object.keys(options['paths'] as Record<string, unknown>);
        if (aliases.length) details.push(`path aliases: ${aliases.slice(0, 5).join(', ')}`);
      }
      return details;
    },
  },
  { file: 'jsconfig.json', label: 'JavaScript (JSDoc types)' },
  { file: 'eslint.config.js', label: 'ESLint (flat config)' },
  { file: 'eslint.config.mjs', label: 'ESLint (flat config)' },
  { file: 'eslint.config.ts', label: 'ESLint (flat config)' },
  { file: '.eslintrc.json', label: 'ESLint' },
  { file: '.eslintrc.js', label: 'ESLint' },
  { file: '.eslintrc.cjs', label: 'ESLint' },
  { file: '.eslintrc.yml', label: 'ESLint' },
  { file: 'biome.json', label: 'Biome' },
  {
    file: '.prettierrc',
    label: 'Prettier',
    extract: (text) => {
      const json = parseJsonLoose(text);
      if (!json) return [];
      const details: string[] = [];
      if (typeof json['printWidth'] === 'number') details.push(`printWidth ${json['printWidth']}`);
      if (typeof json['tabWidth'] === 'number') details.push(`tabWidth ${json['tabWidth']}`);
      if (json['semi'] === false) details.push('no semicolons');
      if (json['singleQuote'] === true) details.push('single quotes');
      if (typeof json['trailingComma'] === 'string') details.push(`trailingComma ${json['trailingComma']}`);
      return details;
    },
  },
  { file: '.prettierrc.json', label: 'Prettier' },
  { file: '.prettierrc.js', label: 'Prettier' },
  { file: 'prettier.config.js', label: 'Prettier' },
  {
    file: '.editorconfig',
    label: 'EditorConfig',
    extract: (text) => {
      const ini = parseIni(text);
      const details: string[] = [];
      if (ini['indent_style']) details.push(`indent ${ini['indent_style']}`);
      if (ini['indent_size']) details.push(`indent size ${ini['indent_size']}`);
      if (ini['end_of_line']) details.push(`line ending ${ini['end_of_line']}`);
      if (ini['charset']) details.push(`charset ${ini['charset']}`);
      return details;
    },
  },
  { file: 'jest.config.js', label: 'Jest config' },
  { file: 'jest.config.ts', label: 'Jest config' },
  { file: 'vitest.config.ts', label: 'Vitest config' },
  { file: 'vitest.config.js', label: 'Vitest config' },
  { file: 'playwright.config.ts', label: 'Playwright config' },
  { file: 'cypress.config.ts', label: 'Cypress config' },
  { file: 'tailwind.config.js', label: 'Tailwind config' },
  { file: 'tailwind.config.ts', label: 'Tailwind config' },
  { file: 'postcss.config.js', label: 'PostCSS config' },
  { file: 'vite.config.ts', label: 'Vite config' },
  { file: 'vite.config.js', label: 'Vite config' },
  { file: 'next.config.js', label: 'Next.js config' },
  { file: 'next.config.mjs', label: 'Next.js config' },
  { file: 'next.config.ts', label: 'Next.js config' },
  { file: 'nuxt.config.ts', label: 'Nuxt config' },
  { file: 'svelte.config.js', label: 'Svelte config' },
  { file: 'astro.config.mjs', label: 'Astro config' },
  { file: 'turbo.json', label: 'Turborepo config' },
  { file: 'nx.json', label: 'Nx config' },
  { file: 'pnpm-workspace.yaml', label: 'pnpm workspace' },
  { file: 'lerna.json', label: 'Lerna config' },
  { file: 'Dockerfile', label: 'Docker' },
  { file: 'docker-compose.yml', label: 'Docker Compose' },
  { file: 'docker-compose.yaml', label: 'Docker Compose' },
  { file: 'Makefile', label: 'Makefile' },
  { file: 'justfile', label: 'justfile' },
  { file: 'CMakeLists.txt', label: 'CMake' },
  { file: 'commitlint.config.js', label: 'commitlint' },
  { file: '.commitlintrc.json', label: 'commitlint' },
  { file: 'ruff.toml', label: 'Ruff' },
  { file: 'mypy.ini', label: 'mypy' },
  { file: 'setup.cfg', label: 'setup.cfg' },
  { file: '.npmrc', label: 'npm config' },
  { file: '.yarnrc.yml', label: 'Yarn config' },
  { file: '.goreleaser.yml', label: 'GoReleaser' },
  { file: '.releaserc', label: 'release config' },
  { file: '.gitignore', label: 'git ignore rules' },
  { file: '.gitattributes', label: 'git attributes' },
  { file: '.nvmrc', label: 'Node version pin' },
  { file: '.node-version', label: 'Node version pin' },
  { file: 'rust-toolchain.toml', label: 'Rust toolchain' },
  { file: 'codecov.yml', label: 'Codecov' },
  { file: '.dockerignore', label: 'Docker ignore rules' },
];

export async function detectConfigs(root: string): Promise<ConfigInfo[]> {
  const configs: ConfigInfo[] = [];

  for (const candidate of CANDIDATES) {
    const text = await readTextIfExists(path.join(root, candidate.file));
    if (text === undefined) continue;
    let details: string[] = [];
    try {
      details = candidate.extract?.(text) ?? [];
    } catch {
      details = [];
    }
    configs.push({ path: candidate.file, label: candidate.label, details });
  }

  // Prettier configs also live in package.json.
  const pkgText = await readTextIfExists(path.join(root, 'package.json'));
  if (pkgText) {
    const json = parseJsonLoose(pkgText);
    if (json && typeof json['prettier'] === 'object') {
      configs.push({ path: 'package.json (prettier)', label: 'Prettier', details: [] });
    }
  }

  // Tool specific sections inside pyproject.toml.
  const pyprojectText = await readTextIfExists(path.join(root, 'pyproject.toml'));
  if (pyprojectText) {
    const doc = parseToml(pyprojectText);
    const toolLabels: Record<string, string> = {
      ruff: 'Ruff',
      black: 'Black',
      mypy: 'mypy',
      pytest: 'pytest',
      isort: 'isort',
      coverage: 'coverage',
      poetry: 'Poetry',
      uv: 'uv',
    };
    for (const [tool, label] of Object.entries(toolLabels)) {
      if (tomlGet(doc, `tool.${tool}`) === undefined) continue;
      const details: string[] = [];
      if (tool === 'pytest') {
        const testPaths = tomlGet(doc, 'tool.pytest.ini_options.testpaths');
        if (Array.isArray(testPaths)) details.push(`testpaths: ${testPaths.join(', ')}`);
      }
      configs.push({ path: `pyproject.toml (tool.${tool})`, label, details });
    }
  }

  // Husky / git hooks.
  const huskyEntries = await listDir(path.join(root, '.husky'));
  if (huskyEntries.some((e) => e.isFile())) {
    const hooks = huskyEntries.filter((e) => e.isFile() && e.name !== '.gitignore').map((e) => e.name);
    configs.push({
      path: '.husky/',
      label: 'Git hooks (husky)',
      details: hooks.length ? [`hooks: ${hooks.join(', ')}`] : [],
    });
  }

  return configs;
}

/** Detects CI pipelines defined in the repository. */
export async function detectCi(root: string): Promise<CiInfo[]> {
  const ci: CiInfo[] = [];

  const workflowsDir = path.join(root, '.github', 'workflows');
  for (const entry of await listDir(workflowsDir)) {
    if (!entry.isFile()) continue;
    if (!/\.(ya?ml)$/i.test(entry.name)) continue;
    const text = await readTextIfExists(path.join(workflowsDir, entry.name));
    const name = text?.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? entry.name.replace(/\.(ya?ml)$/i, '');
    ci.push({ provider: 'GitHub Actions', name, path: `.github/workflows/${entry.name}` });
  }

  const others: { file: string; provider: string }[] = [
    { file: '.gitlab-ci.yml', provider: 'GitLab CI' },
    { file: '.circleci/config.yml', provider: 'CircleCI' },
    { file: 'azure-pipelines.yml', provider: 'Azure Pipelines' },
    { file: 'Jenkinsfile', provider: 'Jenkins' },
    { file: '.drone.yml', provider: 'Drone' },
    { file: 'bitbucket-pipelines.yml', provider: 'Bitbucket Pipelines' },
  ];
  for (const other of others) {
    if (await readTextIfExists(path.join(root, other.file))) {
      ci.push({ provider: other.provider, name: other.file, path: other.file });
    }
  }

  return ci;
}
