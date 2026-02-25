# 导出微信表情包（macOS）

[![release](https://github.com/liusheng22/export-wechat-emoji/actions/workflows/release.yml/badge.svg)](https://github.com/liusheng22/export-wechat-emoji/actions/workflows/release.yml)

> 一键导出微信收藏表情包，方便批量导入飞书、企微、钉钉等平台。

> 仅支持 macOS。

## 功能概览

- App 一键获取并预览微信收藏表情
- 默认无需手动输入 db key（App 自动处理）
- 导出支持每 50 张分组或不分组
- 支持断点续跑（跳过已存在文件）与导出统计
- 提供可选 CLI：`wxemoticon`

## 下载与安装（普通用户）

1. 打开 GitHub Releases：<https://github.com/liusheng22/export-wechat-emoji/releases>
2. 下载最新版本的 macOS 安装包（`.dmg`）
3. 按常规方式安装并打开 `导出微信表情包.app`

如果出现“应用已损坏，无法打开”，可参考：
- <https://juejin.cn/post/7597271614942134291>

## App 一键导出（推荐）

1. 打开 App
2. 点击“一键从微信获取并预览”
3. 预览确认后点击“导出”
4. 导出完成后自动打开目录

说明：
- 当本机已有可用 key 时，通常不需要关闭微信。
- 当需要重新抓取 key 时，App 会提示你先完全退出微信再继续。
- 导出目录默认在 `~/Downloads/微信表情包_导出_时间戳`。
- 导出信息会放在 `导出信息/` 子目录（如 `emoticon_urls.txt`、`使用说明.txt`）。

## CLI（可选，命令行方式）

如果你更喜欢命令行，可使用 `wxemoticon`（macOS）。

安装：

```bash
curl -fsSL https://raw.githubusercontent.com/liusheng22/export-wechat-emoji/main/scripts/install-wxemoticon.sh | bash
```

安装后验证：

```bash
wxemoticon --help
```

### CLI 能力总览

- `wxemoticon key`：获取/刷新 db key（64 位 hex）
- `wxemoticon urls`：导出 URL 列表（会自动抓 key 并离线解密查询）
- `wxemoticon export`：直接下载导出图片

### 常用流程示例

```bash
# 1) 查看可用账号
wxemoticon urls --list-accounts

# 2) 获取 db key（不传 --wxid 时，单账号自动选中；多账号交互选择）
wxemoticon key

# 3) 导出 URL 列表（默认输出“数量 + 文件路径”）
wxemoticon urls

# 4) 一键导出图片（会交互选择分组策略）
wxemoticon export
```

### 指定 `wxid` 的完整示例

```bash
# 1) 先列出账号，拿到目标 wxid（例如 wxid_p5stvq48u5mv12_57c3）
wxemoticon urls --list-accounts

# 2) 指定 wxid 抓取/刷新 db key
wxemoticon key --wxid "wxid_p5stvq48u5mv12_57c3"

# 3) 指定 wxid 导出 URL 列表（可选）
wxemoticon urls --wxid "wxid_p5stvq48u5mv12_57c3"

# 4) 指定 wxid 直接导出表情包图片
wxemoticon export --wxid "wxid_p5stvq48u5mv12_57c3"
```

如果你想做脚本化（不走交互），可以加 `--no-interactive` 与 `--json`：

```bash
wxemoticon key --wxid "wxid_xxx" --no-interactive --json
wxemoticon export --wxid "wxid_xxx" --no-interactive --flat --skip-existing --json
```

如果你的微信不是默认路径（例如官方备份）：

```bash
WECHAT_APP="/Applications/WeChat.bak.app"

# 1) 抓取/刷新 db key（会输出 key 文件路径）
wxemoticon --wechat-app "$WECHAT_APP" key

# 2) 解析并导出 URL 列表（会输出 URL 文件路径）
wxemoticon --wechat-app "$WECHAT_APP" urls

# 3) 直接下载导出图片（推荐日常使用这个命令）
wxemoticon --wechat-app "$WECHAT_APP" export
```

说明：
- `key` 适合排障或你需要单独确认 db key 是否可用。
- `urls` 适合你只想先拿链接文件，稍后再处理下载。
- `export` 适合最终导出图片，内部会自动走 key + urls 流程。

### 关键参数说明

- 全局参数：
  - `--wechat-app`：指定微信路径，默认 `/Applications/WeChat.app`
  - `--no-interactive`：关闭交互（适合脚本化）
- `key` 常用参数：
  - `--force`：忽略已有 key，强制重抓
  - `--timeout`：抓 key 超时时间（秒）
  - `--open`：在 Finder 定位 key 文件
  - `--json`：以 JSON 输出结果
- `urls` 常用参数：
  - `--list-accounts`：仅列账号并退出
  - `--print`：打印全部 URL 到终端
  - `--out`：自定义 URL 输出文件
  - `--force-key`：忽略已有 key 并重抓
  - `--open`：在 Finder 定位 URL 文件
  - `--json`：以 JSON 输出结果
- `export` 常用参数：
  - `--flat`：不分组导出
  - `--group-size`：自定义每组数量（例如 `50`）
  - `--skip-existing`：跳过已存在文件（断点续跑）
  - `--out-dir`：指定导出目录
  - `--open`：导出后自动打开目录
  - `--json`：以 JSON 输出统计结果

## 常见问题

- Q: 使用时会弹出文件权限授权，是否正常？
  - A: 正常，按系统提示授权即可。

- Q: 预览里有些图片加载失败？
  - A: 可能是 URL 过期、风控或资源暂不可达；导出时也可能出现少量失败。

- Q: 为什么默认每 50 张分组？
  - A: 飞书/企微/钉钉等平台常见单次添加上限约 50 张，分组更方便导入。

- Q: 新版微信（4.x）找不到 `fav.archive`？
  - A: 属于正常变化。微信 4.x 主要使用 `xwechat_files` 下的数据库，本项目已适配新版路径。

## 开发者说明（仅开发）

### 环境依赖

- Node.js `>= 20`
- pnpm
- Rust stable
- Tauri v1 构建依赖（macOS 通常需要 Xcode Command Line Tools）

### 开发者快速开始

1. 安装依赖

```bash
pnpm install
```

2. 启动桌面端开发模式（前端 + Tauri）

```bash
pnpm tauri dev
```

3. 代码检查（提交前建议执行）

```bash
pnpm -s typecheck
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path cli/Cargo.toml
```

### 构建命令（开发者）

```bash
# 仅构建前端静态资源（dist）
pnpm build

# 构建 App（debug）
pnpm tauri build --debug

# 构建 App（release）
pnpm tauri-build
```

### CLI 开发命令（wxemoticon）

```bash
# 查看 CLI 帮助
cargo run --manifest-path cli/Cargo.toml -- --help

# 构建 CLI（release）
cargo build --manifest-path cli/Cargo.toml --release
```
