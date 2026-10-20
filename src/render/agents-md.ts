import type { EnvSnapshot } from '../core/types.ts';
import { translator, type Lang, type StringId } from '../i18n.ts';
import type { DirPurpose } from '../detect/structure.ts';

export const BEGIN_MARKER = '<!-- devtools-agents:begin -->';
export const END_MARKER = '<!-- devtools-agents:end -->';

const DIR_TEXT: Record<Lang, Record<DirPurpose, string>> = {
  zh: {
    source: '源码',
    tests: '测试代码',
    docs: '文档',
    scripts: '脚本与工具',
    config: '配置',
    assets: '静态资源',
    api: '接口层',
    database: '数据层',
    components: '界面组件',
    styles: '样式',
    build: '构建产物',
    ci: '持续集成配置',
    infra: '基础设施',
    examples: '示例',
    generated: '自动生成代码（不要手工修改）',
    packages: '工作区子包',
    services: '服务层',
    workers: '后台任务',
    migrations: '数据库迁移',
    public: '对外静态资源',
    other: '目录',
  },
  en: {
    source: 'source code',
    tests: 'tests',
    docs: 'documentation',
    scripts: 'scripts and tooling',
    config: 'configuration',
    assets: 'static assets',
    api: 'API layer',
    database: 'data layer',
    components: 'UI components',
    styles: 'styles',
    build: 'build output',
    ci: 'CI configuration',
    infra: 'infrastructure',
    examples: 'examples',
    generated: 'generated code (do not edit by hand)',
    packages: 'workspace packages',
    services: 'service layer',
    workers: 'background workers',
    migrations: 'database migrations',
    public: 'public static files',
    other: 'directory',
  },
};

const COMMAND_PURPOSE_LABEL: Record<Lang, Record<string, string>> = {
  zh: {
    install: '安装依赖',
    dev: '本地开发',
    build: '构建',
    start: '启动',
    test: '测试',
    lint: '代码检查',
    typecheck: '类型检查',
    format: '格式化',
    release: '发布',
    clean: '清理',
  },
  en: {
    install: 'Install dependencies',
    dev: 'Dev server',
    build: 'Build',
    start: 'Start',
    test: 'Test',
    lint: 'Lint',
    typecheck: 'Type check',
    format: 'Format',
    release: 'Release',
    clean: 'Clean',
  },
};

const PURPOSE_ORDER = ['install', 'dev', 'build', 'start', 'test', 'lint', 'typecheck', 'format', 'release', 'clean'];

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

function section(title: string, body: string): string {
  if (!body.trim()) return '';
  return `## ${title}\n\n${body.trim()}\n`;
}

function findCommand(snapshot: EnvSnapshot, purpose: string) {
  return snapshot.commands.find((command) => command.purpose === purpose);
}

/** Generates the "rules for agents" list, the part that keeps an agent on track. */
export function buildRules(snapshot: EnvSnapshot, lang: Lang): string[] {
  const rules: string[] = [];
  const zh = lang === 'zh';
  const primary = snapshot.packageManagers[0];

  if (primary) {
    const others = ['npm', 'pnpm', 'yarn', 'bun'].filter((name) => name !== primary.name);
    rules.push(
      zh
        ? `所有依赖相关命令一律使用 \`${primary.name}\`${primary.version ? ` ${primary.version}` : ''}${others.length ? `，不要混用 ${others.join('/')}` : ''}。`
        : `Use \`${primary.name}\`${primary.version ? ` ${primary.version}` : ''} for every dependency command${others.length ? `; do not mix it with ${others.join('/')}` : ''}.`,
    );
  }

  const install = findCommand(snapshot, 'install');
  if (install) {
    rules.push(
      zh
        ? `开始工作前先执行 \`${install.command}\` 安装依赖。`
        : `Run \`${install.command}\` first to install dependencies before doing anything else.`,
    );
  }

  const test = findCommand(snapshot, 'test');
  if (test) {
    rules.push(
      zh
        ? `改动代码后必须执行 \`${test.command}\` 并确保通过。`
        : `After changing code, run \`${test.command}\` and make sure it passes.`,
    );
  }

  const lint = findCommand(snapshot, 'lint');
  const typecheck = findCommand(snapshot, 'typecheck');
  const checks = [lint?.command, typecheck?.command].filter(Boolean);
  if (checks.length) {
    rules.push(
      zh
        ? `提交前依次执行 ${checks.map((c) => `\`${c}\``).join(' 和 ')}。`
        : `Before finishing, run ${checks.map((c) => `\`${c}\``).join(' and ')}.`,
    );
  }

  const node = snapshot.runtimes.find((runtime) => runtime.name === 'node');
  if (node?.version) {
    rules.push(
      zh
        ? `Node 版本固定为 ${node.version}${node.files.length ? `（来源：${node.files.join(', ')}）` : ''}。`
        : `Node is pinned to ${node.version}${node.files.length ? ` (see ${node.files.join(', ')})` : ''}.`,
    );
  }

  if (snapshot.monorepo) {
    rules.push(
      zh
        ? `这是一个 monorepo（${snapshot.monorepo}），除非明确指定子包，否则在仓库根目录执行命令。`
        : `This is a monorepo (${snapshot.monorepo}); run commands from the repository root unless a specific package is named.`,
    );
  }

  const generated = snapshot.dirs.filter((dir) => dir.purpose === 'generated');
  if (generated.length) {
    rules.push(
      zh
        ? `不要手工修改 ${generated.map((d) => `\`${d.path}/\``).join('、')}，它们是自动生成的。`
        : `Do not edit ${generated.map((d) => `\`${d.path}/\``).join(', ')} by hand; they are generated.`,
    );
  }

  if (snapshot.envVars.some((v) => v.required)) {
    rules.push(
      zh
        ? '缺少必填环境变量时先向用户确认，不要写死默认值或伪造凭据。'
        : 'Ask the user for missing required environment variables; never hardcode fallbacks or fake credentials.',
    );
  }

  if (snapshot.entryPoints.length) {
    rules.push(
      zh
        ? `理解项目时先从入口文件读起：${snapshot.entryPoints.slice(0, 5).map((e) => `\`${e}\``).join('、')}。`
        : `Start reading the codebase from the entry points: ${snapshot.entryPoints.slice(0, 5).map((e) => `\`${e}\``).join(', ')}.`,
    );
  }

  rules.push(
    zh
      ? '修改 `package.json`、脚本或工具链后运行 `devtools agents init` 刷新本文件。'
      : 'After changing `package.json`, scripts or tooling, run `devtools agents init` to refresh this file.',
  );

  return rules;
}

export interface RenderOptions {
  lang: Lang;
  /** Name and version of the generator, shown in the header. */
  generator?: string;
}

export function renderAgentsMd(snapshot: EnvSnapshot, options: RenderOptions): string {
  const t = translator(options.lang);
  const zh = options.lang === 'zh';
  const generator = options.generator ?? 'devtools-agents';
  const parts: string[] = [];

  parts.push(`# ${snapshot.name}`);
  parts.push(
    `> ${t('generatedBy')} \`${generator}\` · ${snapshot.generatedAt.slice(0, 19).replace('T', ' ')} UTC · env \`${snapshot.fingerprint}\``,
  );

  // ---- quick start --------------------------------------------------------
  const quickRows = PURPOSE_ORDER.map((purpose) => {
    const command = findCommand(snapshot, purpose);
    if (!command) return null;
    return [
      COMMAND_PURPOSE_LABEL[options.lang][purpose] ?? purpose,
      `\`${command.command}\``,
      command.note ?? '',
    ];
  }).filter((row): row is string[] => row !== null);

  parts.push(
    section(
      t('quickStart'),
      `${t('quickStartHint')}\n\n${table([t('purpose'), t('command'), t('source')], quickRows)}`,
    ),
  );

  // ---- stack --------------------------------------------------------------
  const stackLines: string[] = [];
  if (snapshot.runtimes.length) {
    const runtimeText = snapshot.runtimes
      .map((runtime) => {
        const version = runtime.version ? ` ${runtime.version}` : '';
        const files = runtime.files.length ? ` (${runtime.files.join(', ')})` : '';
        return `**${runtime.name}**${version}${files}`;
      })
      .join(' · ');
    stackLines.push(`- ${t('runtime')}: ${runtimeText}`);
  }
  if (snapshot.packageManagers.length) {
    const pmText = snapshot.packageManagers
      .map((pm) => {
        const version = pm.version ? ` ${pm.version}` : '';
        const lock = pm.lockfile ? ` — \`${pm.lockfile}\`` : '';
        return `**${pm.name}**${version}${lock}`;
      })
      .join(' · ');
    stackLines.push(`- ${t('packageManager')}: ${pmText}`);
  }
  if (snapshot.frameworks.length) {
    const fwText = snapshot.frameworks
      .map((fw) => `**${fw.name}**${fw.version ? ` \`${fw.version}\`` : ''} (${fw.role})`)
      .join(' · ');
    stackLines.push(`- ${t('frameworks')}: ${fwText}`);
  }
  if (snapshot.languages.length) {
    const langText = snapshot.languages
      .map((language) => `${language.name} (${language.files} files, ${Math.round(language.share * 100)}%)`)
      .join(' · ');
    stackLines.push(`- ${t('languages')}: ${langText}`);
  }
  if (snapshot.manifests.length) {
    const manifestText = snapshot.manifests
      .map((manifest) => `\`${manifest.path}\`${manifest.name ? ` (${manifest.name})` : ''}`)
      .join(' · ');
    stackLines.push(`- Manifests: ${manifestText}`);
  }
  parts.push(section(t('stack'), stackLines.join('\n')));

  // ---- layout -------------------------------------------------------------
  const dirRows = snapshot.dirs.map((dir) => [
    `\`${dir.path}/\``,
    DIR_TEXT[options.lang][dir.purpose],
    String(dir.files),
  ]);
  const treeBlock = snapshot.tree.length
    ? '```\n' + snapshot.tree.join('\n') + '\n```'
    : '';
  const layoutBody = [
    dirRows.length ? table([t('directory'), t('purpose'), t('files')], dirRows) : '',
    treeBlock ? `${treeBlock}\n\n_${t('layoutHint')}_` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  parts.push(section(t('layout'), layoutBody));

  // ---- entry points -------------------------------------------------------
  if (snapshot.entryPoints.length) {
    parts.push(
      section(
        t('entryPoints'),
        snapshot.entryPoints.map((entry) => `- \`${entry}\``).join('\n'),
      ),
    );
  }

  // ---- command reference --------------------------------------------------
  const commandRows = snapshot.commands.map((command) => [
    COMMAND_PURPOSE_LABEL[options.lang][command.purpose] ?? command.purpose,
    `\`${command.command}\``,
    command.source,
    command.note ?? '',
  ]);
  parts.push(
    section(t('commands'), commandRows.length ? table([t('purpose'), t('command'), t('source'), ''], commandRows) : t('noCommands')),
  );

  // ---- every declared script ----------------------------------------------
  const scriptEntries = Object.entries(snapshot.scripts);
  if (scriptEntries.length) {
    const scriptRows = scriptEntries.map(([name, script]) => [`\`${name}\``, `\`${script}\``]);
    parts.push(section(t('scripts'), table([t('scriptName'), t('scriptCommand')], scriptRows)));
  }

  // ---- configs ------------------------------------------------------------
  if (snapshot.configs.length) {
    const configLines = snapshot.configs.map((config) => {
      const details = config.details.length ? ` — ${config.details.join(', ')}` : '';
      return `- \`${config.path}\` — ${config.label}${details}`;
    });
    parts.push(section(t('configs'), configLines.join('\n')));
  }

  // ---- env vars -----------------------------------------------------------
  if (snapshot.envVars.length) {
    const envRows = snapshot.envVars.map((variable) => [
      `\`${variable.name}\``,
      variable.required ? 'yes' : 'no',
      variable.description ?? '',
      `\`${variable.source}\``,
    ]);
    parts.push(
      section(
        t('envVars'),
        `${table([t('variable'), t('required'), t('description'), t('source')], envRows)}\n\n_Values are never written to this file._`,
      ),
    );
  }

  // ---- ci -----------------------------------------------------------------
  if (snapshot.ci.length) {
    const ciLines = snapshot.ci.map((pipeline) => `- **${pipeline.provider}**: ${pipeline.name} (\`${pipeline.path}\`)`);
    parts.push(section(t('ci'), ciLines.join('\n')));
  }

  // ---- git ----------------------------------------------------------------
  if (snapshot.git.isRepo) {
    const gitLines = [
      `- branch: \`${snapshot.git.branch ?? 'unknown'}\``,
      snapshot.git.remote ? `- remote: \`${snapshot.git.remote}\`` : '',
      snapshot.git.lastCommit ? `- last commit: ${snapshot.git.lastCommit}` : '',
      snapshot.git.hooks.length ? `- hooks: ${snapshot.git.hooks.join(', ')}` : '',
    ].filter(Boolean);
    parts.push(section('Git', gitLines.join('\n')));
  }

  // ---- rules --------------------------------------------------------------
  parts.push(section(t('rules'), buildRules(snapshot, options.lang).map((rule) => `- ${rule}`).join('\n')));

  // ---- notes --------------------------------------------------------------
  if (snapshot.notes.length) {
    parts.push(section(t('notes'), snapshot.notes.map((note) => `- ${note}`).join('\n')));
  }

  // ---- maintenance --------------------------------------------------------
  parts.push(
    section(
      t('maintenance'),
      [
        `- ${t('regenerate')}: \`devtools agents init\``,
        `- ${t('verify')}: \`devtools agents check\``,
        zh
          ? '- 本文件由工具生成，标记块之外的内容不会被覆盖。'
          : '- This file is generated; anything outside the managed markers is preserved.',
      ].join('\n'),
    ),
  );

  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

/**
 * Removes the volatile parts (the generation timestamp) so two renderings of the
 * same environment can be compared.
 */
export function normalizeForComparison(body: string): string {
  return body
    .split('\n')
    .filter((line) => !(line.trimStart().startsWith('>') && line.includes('UTC')))
    .join('\n')
    .trim();
}

/** The trailing, human owned section that survives regeneration. */
export function humanNotesSection(lang: Lang): string {
  const t = translator(lang);
  return `## ${t('humanNotes')}\n\n_${t('humanNotesHint')}_\n`;
}
