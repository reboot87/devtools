/**
 * Shared data model for a detected development environment.
 *
 * Everything in here is plain data so it can be serialised to JSON
 * (`.devtools/env.json`) and re-rendered without re-scanning the disk.
 */

export type CommandPurpose =
  | 'install'
  | 'dev'
  | 'build'
  | 'start'
  | 'test'
  | 'lint'
  | 'typecheck'
  | 'format'
  | 'release'
  | 'clean';

export type CommandSource = 'script' | 'inferred' | 'manifest';

export interface CommandInfo {
  purpose: CommandPurpose;
  /** Copy-pasteable shell command. */
  command: string;
  source: CommandSource;
  /** Where the command came from, e.g. `package.json script "dev"`. */
  note?: string;
}

export interface RuntimeInfo {
  /** `node`, `python`, `go`, `rust`, `java`, `ruby`, `php`, `dotnet`, `deno`, `bun` */
  name: string;
  /** Version declared by the project (not the version installed on this machine). */
  version?: string;
  /** Files that proved this runtime is part of the project. */
  files: string[];
}

export interface PackageManagerInfo {
  /** `npm`, `pnpm`, `yarn`, `bun`, `uv`, `poetry`, `pip`, `cargo`, `go`, `composer` */
  name: string;
  version?: string;
  lockfile?: string;
  /** Command that installs dependencies for this manager. */
  installCommand?: string;
  /** Command that installs the manager itself, when it is not bundled with Node. */
  selfInstallCommand?: string;
}

export interface FrameworkInfo {
  /** Display name, e.g. `Next.js`. */
  name: string;
  /** Short role, e.g. `web framework`. */
  role: string;
  version?: string;
  /** Dependency that revealed it. */
  source: string;
}

export interface ManifestInfo {
  /** Path relative to the project root. */
  path: string;
  /** `package.json`, `pyproject.toml`, ... */
  type: string;
  name?: string;
  version?: string;
  description?: string;
}

/** Purpose of a top level directory, resolved to text by the renderer. */
export type DirPurpose =
  | 'source'
  | 'tests'
  | 'docs'
  | 'scripts'
  | 'config'
  | 'assets'
  | 'api'
  | 'database'
  | 'components'
  | 'styles'
  | 'build'
  | 'ci'
  | 'infra'
  | 'examples'
  | 'generated'
  | 'packages'
  | 'services'
  | 'workers'
  | 'migrations'
  | 'public'
  | 'other';

export interface DirInfo {
  /** Path relative to the project root, posix separators. */
  path: string;
  /** What the directory is used for. */
  purpose: DirPurpose;
  /** Number of files (recursive, ignored directories excluded). */
  files: number;
}

export interface ConfigInfo {
  /** Path relative to the project root. */
  path: string;
  /** Short label. */
  label: string;
  /** Notable settings extracted from the file. */
  details: string[];
}

export interface EnvVarInfo {
  name: string;
  /** File the variable was found in. */
  source: string;
  description?: string;
  required: boolean;
}

export interface GitInfo {
  isRepo: boolean;
  branch?: string;
  remote?: string;
  dirty?: boolean;
  lastCommit?: string;
  /** Installed git hooks, e.g. `pre-commit`. */
  hooks: string[];
}

export interface CiInfo {
  provider: string;
  name: string;
  path: string;
}

export interface LanguageInfo {
  name: string;
  files: number;
  /** 0-1 share of detected source files. */
  share: number;
}

export interface EnvSnapshot {
  root: string;
  name: string;
  generatedAt: string;
  /** Hash of the detected environment; changes when the environment changes. */
  fingerprint: string;
  monorepo?: string;
  runtimes: RuntimeInfo[];
  packageManagers: PackageManagerInfo[];
  manifests: ManifestInfo[];
  frameworks: FrameworkInfo[];
  commands: CommandInfo[];
  /** Every script declared in package.json, name to shell command. */
  scripts: Record<string, string>;
  dirs: DirInfo[];
  /** Tree lines, already formatted. */
  tree: string[];
  entryPoints: string[];
  configs: ConfigInfo[];
  envVars: EnvVarInfo[];
  ci: CiInfo[];
  git: GitInfo;
  languages: LanguageInfo[];
  /** Free-form observations worth telling an agent about. */
  notes: string[];
}
