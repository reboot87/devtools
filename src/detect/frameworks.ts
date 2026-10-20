import type { FrameworkInfo } from '../core/types.ts';

interface FrameworkDef {
  name: string;
  role: string;
  /** Ecosystem the dependency belongs to. */
  ecosystem: 'node' | 'python' | 'rust' | 'go' | 'php';
}

const NODE_FRAMEWORKS: Record<string, FrameworkDef> = {
  next: { name: 'Next.js', role: 'web framework', ecosystem: 'node' },
  nuxt: { name: 'Nuxt', role: 'web framework', ecosystem: 'node' },
  remix: { name: 'Remix', role: 'web framework', ecosystem: 'node' },
  astro: { name: 'Astro', role: 'web framework', ecosystem: 'node' },
  '@angular/core': { name: 'Angular', role: 'web framework', ecosystem: 'node' },
  '@nestjs/core': { name: 'NestJS', role: 'backend framework', ecosystem: 'node' },
  express: { name: 'Express', role: 'backend framework', ecosystem: 'node' },
  fastify: { name: 'Fastify', role: 'backend framework', ecosystem: 'node' },
  hono: { name: 'Hono', role: 'backend framework', ecosystem: 'node' },
  koa: { name: 'Koa', role: 'backend framework', ecosystem: 'node' },
  '@trpc/server': { name: 'tRPC', role: 'api layer', ecosystem: 'node' },
  graphql: { name: 'GraphQL', role: 'api layer', ecosystem: 'node' },
  '@apollo/server': { name: 'Apollo Server', role: 'api layer', ecosystem: 'node' },
  react: { name: 'React', role: 'ui library', ecosystem: 'node' },
  'react-dom': { name: 'React DOM', role: 'ui renderer', ecosystem: 'node' },
  vue: { name: 'Vue', role: 'ui library', ecosystem: 'node' },
  svelte: { name: 'Svelte', role: 'ui library', ecosystem: 'node' },
  '@sveltejs/kit': { name: 'SvelteKit', role: 'web framework', ecosystem: 'node' },
  solid: { name: 'SolidJS', role: 'ui library', ecosystem: 'node' },
  preact: { name: 'Preact', role: 'ui library', ecosystem: 'node' },
  vite: { name: 'Vite', role: 'bundler / dev server', ecosystem: 'node' },
  webpack: { name: 'webpack', role: 'bundler', ecosystem: 'node' },
  esbuild: { name: 'esbuild', role: 'bundler', ecosystem: 'node' },
  rollup: { name: 'Rollup', role: 'bundler', ecosystem: 'node' },
  parcel: { name: 'Parcel', role: 'bundler', ecosystem: 'node' },
  '@vercel/next': { name: 'Vercel adapter', role: 'deployment', ecosystem: 'node' },
  turbo: { name: 'Turborepo', role: 'build orchestrator', ecosystem: 'node' },
  nx: { name: 'Nx', role: 'build orchestrator', ecosystem: 'node' },
  lerna: { name: 'Lerna', role: 'monorepo tooling', ecosystem: 'node' },
  typescript: { name: 'TypeScript', role: 'type system', ecosystem: 'node' },
  jest: { name: 'Jest', role: 'test runner', ecosystem: 'node' },
  vitest: { name: 'Vitest', role: 'test runner', ecosystem: 'node' },
  mocha: { name: 'Mocha', role: 'test runner', ecosystem: 'node' },
  jasmine: { name: 'Jasmine', role: 'test runner', ecosystem: 'node' },
  '@playwright/test': { name: 'Playwright', role: 'end-to-end testing', ecosystem: 'node' },
  playwright: { name: 'Playwright', role: 'end-to-end testing', ecosystem: 'node' },
  cypress: { name: 'Cypress', role: 'end-to-end testing', ecosystem: 'node' },
  '@testing-library/react': { name: 'Testing Library', role: 'testing utilities', ecosystem: 'node' },
  eslint: { name: 'ESLint', role: 'linter', ecosystem: 'node' },
  '@typescript-eslint/parser': { name: 'typescript-eslint', role: 'linter', ecosystem: 'node' },
  prettier: { name: 'Prettier', role: 'formatter', ecosystem: 'node' },
  '@biomejs/biome': { name: 'Biome', role: 'linter + formatter', ecosystem: 'node' },
  '@commitlint/cli': { name: 'commitlint', role: 'commit linting', ecosystem: 'node' },
  husky: { name: 'Husky', role: 'git hooks', ecosystem: 'node' },
  'lint-staged': { name: 'lint-staged', role: 'pre-commit checks', ecosystem: 'node' },
  tailwindcss: { name: 'Tailwind CSS', role: 'styling', ecosystem: 'node' },
  '@mui/material': { name: 'MUI', role: 'ui library', ecosystem: 'node' },
  antd: { name: 'Ant Design', role: 'ui library', ecosystem: 'node' },
  '@radix-ui/react-dialog': { name: 'Radix UI', role: 'ui library', ecosystem: 'node' },
  prisma: { name: 'Prisma', role: 'orm', ecosystem: 'node' },
  '@prisma/client': { name: 'Prisma', role: 'orm', ecosystem: 'node' },
  'drizzle-orm': { name: 'Drizzle ORM', role: 'orm', ecosystem: 'node' },
  typeorm: { name: 'TypeORM', role: 'orm', ecosystem: 'node' },
  mongoose: { name: 'Mongoose', role: 'odm', ecosystem: 'node' },
  sequelize: { name: 'Sequelize', role: 'orm', ecosystem: 'node' },
  pg: { name: 'PostgreSQL client', role: 'database driver', ecosystem: 'node' },
  mysql2: { name: 'MySQL client', role: 'database driver', ecosystem: 'node' },
  'better-sqlite3': { name: 'SQLite client', role: 'database driver', ecosystem: 'node' },
  ioredis: { name: 'ioredis', role: 'cache / queue client', ecosystem: 'node' },
  redis: { name: 'redis client', role: 'cache client', ecosystem: 'node' },
  bullmq: { name: 'BullMQ', role: 'job queue', ecosystem: 'node' },
  electron: { name: 'Electron', role: 'desktop shell', ecosystem: 'node' },
  '@tauri-apps/api': { name: 'Tauri', role: 'desktop shell', ecosystem: 'node' },
  wrangler: { name: 'Wrangler', role: 'edge runtime tooling', ecosystem: 'node' },
  '@sentry/node': { name: 'Sentry', role: 'error monitoring', ecosystem: 'node' },
  '@opentelemetry/api': { name: 'OpenTelemetry', role: 'observability', ecosystem: 'node' },
  openai: { name: 'OpenAI SDK', role: 'ai sdk', ecosystem: 'node' },
  '@anthropic-ai/sdk': { name: 'Anthropic SDK', role: 'ai sdk', ecosystem: 'node' },
  ai: { name: 'Vercel AI SDK', role: 'ai sdk', ecosystem: 'node' },
  zod: { name: 'Zod', role: 'schema validation', ecosystem: 'node' },
  '@trpc/client': { name: 'tRPC client', role: 'api client', ecosystem: 'node' },
  '@clerk/nextjs': { name: 'Clerk', role: 'auth', ecosystem: 'node' },
  'next-auth': { name: 'NextAuth', role: 'auth', ecosystem: 'node' },
  '@auth/core': { name: 'Auth.js', role: 'auth', ecosystem: 'node' },
  stripe: { name: 'Stripe', role: 'payments', ecosystem: 'node' },
  '@playwright/test-ui': { name: 'Playwright', role: 'end-to-end testing', ecosystem: 'node' },
};

const PYTHON_FRAMEWORKS: Record<string, FrameworkDef> = {
  django: { name: 'Django', role: 'web framework', ecosystem: 'python' },
  flask: { name: 'Flask', role: 'web framework', ecosystem: 'python' },
  fastapi: { name: 'FastAPI', role: 'web framework', ecosystem: 'python' },
  starlette: { name: 'Starlette', role: 'web framework', ecosystem: 'python' },
  celery: { name: 'Celery', role: 'task queue', ecosystem: 'python' },
  pytest: { name: 'pytest', role: 'test runner', ecosystem: 'python' },
  sqlalchemy: { name: 'SQLAlchemy', role: 'orm', ecosystem: 'python' },
  alembic: { name: 'Alembic', role: 'migrations', ecosystem: 'python' },
  pandas: { name: 'pandas', role: 'data analysis', ecosystem: 'python' },
  numpy: { name: 'NumPy', role: 'numerics', ecosystem: 'python' },
  torch: { name: 'PyTorch', role: 'machine learning', ecosystem: 'python' },
  tensorflow: { name: 'TensorFlow', role: 'machine learning', ecosystem: 'python' },
  pydantic: { name: 'Pydantic', role: 'schema validation', ecosystem: 'python' },
  httpx: { name: 'HTTPX', role: 'http client', ecosystem: 'python' },
  requests: { name: 'requests', role: 'http client', ecosystem: 'python' },
  boto3: { name: 'boto3', role: 'aws sdk', ecosystem: 'python' },
  openai: { name: 'OpenAI SDK', role: 'ai sdk', ecosystem: 'python' },
  anthropic: { name: 'Anthropic SDK', role: 'ai sdk', ecosystem: 'python' },
  langchain: { name: 'LangChain', role: 'ai orchestration', ecosystem: 'python' },
  poetry: { name: 'Poetry', role: 'dependency manager', ecosystem: 'python' },
  uv: { name: 'uv', role: 'dependency manager', ecosystem: 'python' },
  ruff: { name: 'Ruff', role: 'linter', ecosystem: 'python' },
  black: { name: 'Black', role: 'formatter', ecosystem: 'python' },
  mypy: { name: 'mypy', role: 'type checker', ecosystem: 'python' },
  pylint: { name: 'Pylint', role: 'linter', ecosystem: 'python' },
  flake8: { name: 'flake8', role: 'linter', ecosystem: 'python' },
  isort: { name: 'isort', role: 'import formatter', ecosystem: 'python' },
};

const RUST_FRAMEWORKS: Record<string, FrameworkDef> = {
  actix_web: { name: 'Actix Web', role: 'web framework', ecosystem: 'rust' },
  axum: { name: 'Axum', role: 'web framework', ecosystem: 'rust' },
  rocket: { name: 'Rocket', role: 'web framework', ecosystem: 'rust' },
  tokio: { name: 'Tokio', role: 'async runtime', ecosystem: 'rust' },
  serde: { name: 'Serde', role: 'serialization', ecosystem: 'rust' },
  clap: { name: 'clap', role: 'cli parsing', ecosystem: 'rust' },
  diesel: { name: 'Diesel', role: 'orm', ecosystem: 'rust' },
  sqlx: { name: 'SQLx', role: 'database access', ecosystem: 'rust' },
};

const GO_FRAMEWORKS: Record<string, FrameworkDef> = {
  'github.com/gin-gonic/gin': { name: 'Gin', role: 'web framework', ecosystem: 'go' },
  'github.com/labstack/echo': { name: 'Echo', role: 'web framework', ecosystem: 'go' },
  'github.com/gofiber/fiber': { name: 'Fiber', role: 'web framework', ecosystem: 'go' },
  'github.com/spf13/cobra': { name: 'Cobra', role: 'cli framework', ecosystem: 'go' },
  'github.com/stretchr/testify': { name: 'testify', role: 'testing', ecosystem: 'go' },
  'gorm.io/gorm': { name: 'GORM', role: 'orm', ecosystem: 'go' },
};

const PHP_FRAMEWORKS: Record<string, FrameworkDef> = {
  'laravel/framework': { name: 'Laravel', role: 'web framework', ecosystem: 'php' },
  'symfony/framework-bundle': { name: 'Symfony', role: 'web framework', ecosystem: 'php' },
};

const BY_ECOSYSTEM: Record<string, Record<string, FrameworkDef>> = {
  node: NODE_FRAMEWORKS,
  python: PYTHON_FRAMEWORKS,
  rust: RUST_FRAMEWORKS,
  go: GO_FRAMEWORKS,
  php: PHP_FRAMEWORKS,
};

export interface FrameworkDetectionInput {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  otherDependencies: { ecosystem: string; name: string; version?: string }[];
}

export function detectFrameworks(input: FrameworkDetectionInput): FrameworkInfo[] {
  const found: FrameworkInfo[] = [];
  const seen = new Set<string>();

  const push = (def: FrameworkDef, version?: string, source = def.name) => {
    const key = `${def.name}::${def.role}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ name: def.name, role: def.role, version, source });
  };

  for (const [dep, version] of Object.entries({ ...input.dependencies, ...input.devDependencies })) {
    const def = NODE_FRAMEWORKS[dep];
    if (def) push(def, version, dep);
  }

  for (const dep of input.otherDependencies) {
    const table = BY_ECOSYSTEM[dep.ecosystem];
    const def = table?.[dep.name];
    if (def) push(def, dep.version, dep.name);
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}
