# 完整源码同步说明

## 为什么使用 Git

`dist/` 只是当前机器生成的可预览网页，不是可继续开发、修改和部署的完整版本。Git 仓库会保存源码、配置、锁文件、文档和完整原生小程序目录，接收方可以在另一台电脑上重新安装依赖并构建。

## 方式一：推送到 Git 托管平台

1. 在 GitHub、Gitee 或学校 Git 服务中创建一个空仓库。
2. 在本仓库执行：

```bash
git remote add origin <仓库地址>
git push -u origin main
```

3. 接收方执行：

```bash
git clone <仓库地址>
cd <仓库目录>
pnpm install
pnpm dev
```

接收方第一次拉取后得到的是源码和工作记录，不包含 `node_modules`、`dist` 或本机缓存。

## 方式二：离线 Git Bundle

如果暂时没有远程仓库，可以生成一个包含完整提交历史的单文件仓库：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-sync-bundle.ps1
```

脚本会在 `release/` 下生成 `zjgsu-campus-full.bundle` 和对应 SHA256 文件。只需要把 bundle 文件发给对方。

接收方执行：

```bash
git clone zjgsu-campus-full.bundle campus
cd campus
pnpm install
pnpm dev
```

对方克隆后的仓库拥有完整历史和全部分支，可继续提交后再同步回远程仓库。

## 方式三：压缩包

Git 托管不可用时，也可以直接发送仓库目录的 ZIP，但必须确认压缩包中至少包含：

- `src/`
- `public/`
- `scripts/`
- `docs/`
- `miniprogram/zjgsu-campus/`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tailwind.config.ts`
- `vite.config.ts`

不要发送只有 `dist/` 的目录。

## 日常同步

提交改动：

```bash
git add .
git commit -m "描述本次改动"
git push
```

拉取别人的改动：

```bash
git pull --rebase
pnpm install
pnpm typecheck
```

## 提交边界

- 提交源码、文档、配置和锁文件。
- 不提交 `node_modules`、`dist`、`.vite`、`test-results`、本机环境文件和个人路径。
- 大型二进制素材需要单独评估；当前项目截图属于可再生成内容。
