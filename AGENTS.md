<!-- devtools-agents:begin -->
# devtools-agents

> 生成工具 `devtools-agents` · 2026-10-20 08:00:43 UTC · env `ec6cc5b841f8`

## 快速开始

可直接复制执行的命令，按常用顺序排列。

| 用途 | 命令 | 来源 |
| --- | --- | --- |
| 安装依赖 | `npm ci` | lockfile package-lock.json |
| 构建 | `npm run build` | package.json script "build" |
| 测试 | `npm run test` | package.json script "test" |
| 类型检查 | `npm run typecheck` | package.json script "typecheck" |


## 技术栈

- 运行时: **node** 22.18.0 (package.json (engines.node), package.json (module type))
- 包管理器: **npm** — `package-lock.json`
- 框架与库: **TypeScript** `^5.8.3` (type system)
- 语言构成: TypeScript (30 files, 97%) · JavaScript (1 files, 3%)
- Manifests: `package.json` (devtools-agents)


## 项目结构

| 目录 | 用途 | 文件数 |
| --- | --- | --- |
| `bin/` | 脚本与工具 | 1 |
| `src/` | 源码 | 26 |
| `test/` | 测试代码 | 4 |

```
bin/
  devtools.mjs
src/
  commands/
    check.ts
    init.ts
    install.ts
    print.ts
    watch.ts
  core/
    args.ts
    env.ts
    scan.ts
    types.ts
  detect/
    commands.ts
    configs.ts
    envvars.ts
    frameworks.ts
    git.ts
    manifests.ts
    runtimes.ts
    structure.ts
  install/
    deps.ts
  render/
    agents-md.ts
    write.ts
  util/
    exec.ts
    fsx.ts
    hash.ts
    toml.ts
  cli.ts
  i18n.ts
test/
  detect.test.ts
  e2e.test.ts
  toml.test.ts
  writer.test.ts
.gitignore
package-lock.json
package.json
README.md
tsconfig.build.json
tsconfig.json
```

_自动生成目录与依赖目录已省略。_


## 程序入口

- `src/cli.ts`


## 命令速查

| 用途 | 命令 | 来源 |  |
| --- | --- | --- | --- |
| 安装依赖 | `npm ci` | inferred | lockfile package-lock.json |
| 构建 | `npm run build` | script | package.json script "build" |
| 测试 | `npm run test` | script | package.json script "test" |
| 类型检查 | `npm run typecheck` | script | package.json script "typecheck" |


## 全部 package scripts

| 脚本 | 执行内容 |
| --- | --- |
| `devtools` | `node src/cli.ts` |
| `agents` | `node src/cli.ts agents` |
| `build` | `tsc -p tsconfig.build.json` |
| `typecheck` | `tsc -p tsconfig.json --noEmit` |
| `test` | `node --test "test/*.test.ts"` |
| `prepublishOnly` | `npm run typecheck && npm test` |


## 配置与约定

- `tsconfig.json` — TypeScript — strict mode on, target ES2023, module NodeNext, moduleResolution NodeNext, noUncheckedIndexedAccess
- `.gitignore` — git ignore rules


## Git

- branch: `main`
- remote: `https://github.com/reboot87/devtools.git`


## 给 Agent 的硬性规则

- 所有依赖相关命令一律使用 `npm`，不要混用 pnpm/yarn/bun。
- 开始工作前先执行 `npm ci` 安装依赖。
- 改动代码后必须执行 `npm run test` 并确保通过。
- 提交前依次执行 `npm run typecheck`。
- Node 版本固定为 22.18.0（来源：package.json (engines.node), package.json (module type)）。
- 理解项目时先从入口文件读起：`src/cli.ts`。
- 修改 `package.json`、脚本或工具链后运行 `devtools agents init` 刷新本文件。


## 如何保持本文件有效

- 重新生成: `devtools agents init`
- 校验内容是否仍然准确: `devtools agents check`
- 本文件由工具生成，标记块之外的内容不会被覆盖。
<!-- devtools-agents:end -->

## 项目补充说明（自由编写，重新生成时保留）

_本节内容在执行 `devtools agents init` 后依然保留。_
