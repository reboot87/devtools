<!-- devtools-agents:begin -->
# devtools-agents

> 生成工具 `devtools-agents` · 2026-10-23 09:27:57 UTC · env `83e2a5171bd7`

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
- 语言构成: TypeScript (34 files, 97%) · JavaScript (1 files, 3%)
- Manifests: `package.json` (devtools-agents)


## 本机已安装的工具链

这些工具在本机已经装好，直接使用。不要执行安装命令，也不要再去找另外一份。

| 工具 | 版本 | 位置 | 说明 |
| --- | --- | --- | --- |
| 编译器 `MSVC` | `14.16.27023` | `C:\Program Files (x86)\Microsoft Visual Studio\2017\Community\VC\Tools\MSVC\14.16.27023\bin\Hostx64\x64` | Visual Studio Community 2017 · toolset 14.16.27023 |
| SDK `Windows SDK` | `10.0.17763.0` | `C:\Program Files (x86)\Windows Kits\10\Include` | 2 versions installed |
| 构建工具 `CMake` | `3.31.5` | `C:\Program Files\CMake\bin\cmake.exe` |  |
| 构建工具 `Ninja` | — | `C:\Program Files (x86)\Microsoft Visual Studio\2017\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe` | bundled with Visual Studio |
| 运行时 `bun` | `1.4.2` | `C:\Users\Administrator\AppData\Roaming\npm\bun.exe` |  |
| 运行时 `node` | `24.18.0` | `D:\Program Files\nodejs\node.exe` |  |
| 运行时 `python` | `3.12.0` | `C:\Python312\python.exe` |  |
| 包 / 依赖管理 `Conan` | `2.33.0` | `C:\Python312\Scripts\conan.exe` |  |
| 包 / 依赖管理 `npm` | `11.16.0` | `D:\Program Files\nodejs\npm.cmd` |  |
| 包 / 依赖管理 `pnpm` | `10.32.1` | `C:\Users\Administrator\AppData\Roaming\npm\pnpm.cmd` |  |
| 开发工具 `git` | `2.56.0` | `C:\Users\Administrator\AppData\Local\Programs\@codebufffreebuff-desktop\resources\git\ucrt64\bin\git.exe` |  |


## 项目结构

| 目录 | 用途 | 文件数 |
| --- | --- | --- |
| `bin/` | 脚本与工具 | 1 |
| `src/` | 源码 | 28 |
| `test/` | 测试代码 | 6 |

```
bin/
  devtools.mjs
src/
  commands/
    check.ts
    hook.ts
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
    toolchain.ts
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
  hook.test.ts
  toml.test.ts
  toolchain.test.ts
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
- 本机已安装 MSVC、Windows SDK、CMake、Ninja、bun、node、python、Conan、npm、pnpm 等，直接使用，不要执行安装命令，也不要满盘搜索它们的安装位置。
- 理解项目时先从入口文件读起：`src/cli.ts`。
- 修改 `package.json`、脚本或工具链后运行 `devtools agents init` 刷新本文件。


## 备注

- 工具链探测于 2026-10-23 09:27:57 UTC，缓存 .devtools/toolchain.json，需要重新探测时运行 `devtools agents init --refresh`。


## 如何保持本文件有效

- 重新生成: `devtools agents init`
- 校验内容是否仍然准确: `devtools agents check`
- 本文件由工具生成，标记块之外的内容不会被覆盖。
<!-- devtools-agents:end -->

## 项目补充说明（自由编写，重新生成时保留）

_本节内容在执行 `devtools agents init` 后依然保留。_
