# devtools-agents

读取**当前项目的真实开发环境**，生成一份精确的 `AGENTS.md`，让 coding agent 不再靠猜：
用什么包管理器、怎么装依赖、怎么跑测试、代码放在哪、哪些目录不能改、环境变量有哪些——全部写进文件里。

零运行时依赖（只用 Node 内置模块），Node ≥ 22.18。

---

## 为什么

Agent 进入一个陌生仓库时最常见的失败方式：

| 常见问题 | 本工具的处理 |
| --- | --- |
| 用了 `npm`，项目其实是 `pnpm` | 从 lockfile / `packageManager` 字段推断唯一包管理器 |
| 跑错了测试命令 | 从 `package.json` scripts 和框架默认值推导 test / lint / typecheck / build |
| 找不到入口文件 | 扫描入口文件（`src/index.ts`、`main.py`、`cmd/`、`manage.py` …） |
| 不知道哪些目录是自动生成的 | 标记 `generated/` 目录并在规则里写明"不要手改" |
| 改完 `package.json` 后文档过期 | `check` 检测漂移，`watch` 自动刷新 |
| 项目没有 `AGENTS.md` | `init` 自动创建并写入环境快照 |

---

## 安装

```bash
# 全局安装 CLI
npm install -g devtools-agents

# 或直接用 npx
npx devtools-agents agents init
```

也可以在项目里装成 devDependency，让项目成员随时刷新文档：

```bash
devtools agents init --self-install
```

## 使用

```bash
devtools agents init      # 生成 / 刷新 AGENTS.md，并自动安装依赖
devtools agents check     # 校验 AGENTS.md 是否仍与当前环境一致（CI 可用）
devtools agents print     # 只打印，不写文件
devtools agents install   # 只安装依赖
devtools agents watch     # 监听项目变化，自动刷新 AGENTS.md
```

### 常用选项

| 选项 | 说明 |
| --- | --- |
| `--root <path>` | 指定项目根目录（默认自动向上查找） |
| `--lang <zh\|en>` | 文档语言，默认 `zh` |
| `--out <file>` | 输出文件名，默认 `AGENTS.md` |
| `--no-install` | 生成文档但不安装依赖 |
| `--dry-run` | 只打印将要执行的动作 |
| `--force` | 完全覆盖 `AGENTS.md`（丢弃标记块外的内容） |
| `--mirror <list>` | 同时写入其他 agent 约定：`claude`、`gemini`、`copilot`、`cursor` |
| `--self-install` | 把 `devtools-agents` 装进当前项目的 devDependencies |
| `--json` | 机器可读输出（`print` / `check`） |
| `--timeout <秒>` | 单条安装命令的超时时间 |

---

## 自动安装

`init` 默认会在生成文档后**自动安装项目依赖**，使用检测到的包管理器：

| 检测到的项目 | 执行的安装命令 |
| --- | --- |
| `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| `yarn.lock` | `yarn install` |
| `bun.lock` | `bun install` |
| `package-lock.json` | `npm ci` |
| `uv.lock` | `uv sync` |
| `poetry.lock` | `poetry install` |
| `Cargo.lock` | `cargo fetch` |
| `go.sum` | `go mod download` |
| `composer.lock` | `composer install` |

安装失败会返回非零退出码并打印最后 2000 字符输出，不会吞掉错误。
不需要时用 `--no-install` 关闭。

---

## 生成的内容

`AGENTS.md` 由一个受管理的标记块包裹：

```markdown
<!-- devtools-agents:begin -->
...自动生成的环境事实...
<!-- devtools-agents:end -->
```

- 标记块**之外**的内容永远不会被覆盖，可以放心写项目专属说明
- 重新生成是幂等的：环境没变就不会动文件
- `check` 会比较当前环境与文档内容，漂移时返回退出码 `1`（适合放进 CI）

文档包含的章节：

1. **快速开始** — 按用途排序的可复制命令（安装 / 开发 / 构建 / 测试 / lint / 类型检查）
2. **技术栈** — 运行时与版本、包管理器、框架、语言构成
3. **项目结构** — 目录用途表 + 目录树（自动跳过 `node_modules`、`dist` 等）
4. **程序入口** — 建议 agent 先读的文件
5. **命令速查 + 全部 package scripts** — 不遗漏任何脚本
6. **配置与约定** — tsconfig strict、Prettier、EditorConfig 等关键设置
7. **环境变量** — 只写变量名、来源与是否必填，**绝不写入真实值**
8. **CI 流水线** — GitHub Actions / GitLab CI 等
9. **给 Agent 的硬性规则** — 包管理器、必跑命令、禁改目录、缺变量时先问
10. **维护方式** — 何时重新生成、如何校验

---

## 支持识别的技术栈

- **Node / TypeScript** — npm、pnpm、yarn、bun、deno；Next.js、React、Vue、Svelte、NestJS、Express、Fastify、Vite、Vitest、Jest、Playwright、ESLint、Prettier、Biome、Prisma、Drizzle…
- **Python** — uv、poetry、pipenv、pip；Django、Flask、FastAPI、pytest、Ruff、Black、mypy、SQLAlchemy、Celery…
- **Go** — `go.mod`、Gin、Echo、Fiber、GORM、Cobra、testify
- **Rust** — `Cargo.toml`、Actix、Axum、Tokio、Serde、Clap
- **Java / Kotlin / C# / C++** — Maven、Gradle、`.sln` / `.csproj` / `.vcxproj`、CMake、Makefile
- **PHP / Ruby / Elixir** — Composer、Bundler、Mix

---

## 开发

```bash
npm ci
npm run typecheck     # tsc --noEmit
npm test              # node --test
npm run build         # 编译到 dist/
```

源码是 TypeScript，通过 Node 原生类型擦除直接运行（`node src/cli.ts`），
编译产物在 `dist/`，`bin/devtools.mjs` 会优先使用编译结果。

### 项目结构

```
bin/devtools.mjs        CLI 入口（优先 dist，回退 src）
src/cli.ts              参数解析与命令分发
src/core/               环境聚合、目录扫描、参数解析
src/detect/             清单 / 运行时 / 框架 / 命令 / 配置 / 环境变量 / git 检测
src/render/             AGENTS.md 渲染与写入（保留人工内容）
src/install/            依赖安装计划与执行
src/commands/           init / check / print / install / watch
test/                   node:test 用例
```

## License

MIT
