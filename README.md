# 商砖小站校园小程序

本仓库同时保存可运行的 Web 高保真原型和完整的微信原生小程序源码。接收方应克隆或解压整个仓库，不应只拿 `dist/` 或其他构建产物。

Vue 3 + Vite + TypeScript + Tailwind CSS 构建的移动端校园服务原型。首版覆盖 32 个路由，使用静态 Mock 数据与本地交互状态，不连接云开发或真实业务接口。

## 仓库结构

- 根目录：Vue 3 Web 高保真原型源码。
- `miniprogram/zjgsu-campus/`：完整微信原生小程序源码，包含页面、云函数、数据和测试脚本。
- `docs/`：投票接口、防刷策略和树洞图标方案。
- `scripts/`：32 路由自动验证与离线 Git bundle 生成脚本。
- `dist/`、`node_modules/`、`test-results/`：构建或运行缓存，不提交到 Git。

## 本地运行

```bash
pnpm install
pnpm dev
```

开发地址默认是 `http://localhost:5173`。桌面浏览器中会以 390px 手机画布展示，窄屏设备会自动铺满。

## 验证

```bash
pnpm typecheck
pnpm build
pnpm test:e2e
```

Playwright 使用本机 Chrome 执行测试。测试会逐个访问 32 个路由，检查主导航、返回按钮、横向溢出、44px 点击热区、发帖正文折叠、地图抽屉和隐私选择器。

## 完整同步

源码通过 Git 提交和同步，不依赖本机 `dist/`。完整流程见 `docs/GIT-SYNC.md`：

```bash
git clone <repository-url>
cd <repository-folder>
pnpm install
pnpm dev
```

没有 Git 托管平台时，可以传递仓库生成的 `.bundle` 文件并由接收方克隆：

```bash
git clone 商砖小站-campus-full.bundle campus
```

## 配置

- 校车热线位于 `src/config/app.ts` 的 `BUS_PHONE`。留空时，地图抽屉会显示“校车热线待配置”。
- 设计令牌位于 `tailwind.config.ts`，包括主色、场景色、圆角、阴影和动画。
- Mock 数据集中在 `src/data/mock.ts`，后续可按后端接口逐项替换。
- 事件投票的前端请求、10 秒轮询和后端防刷约定见 `src/services/vote.ts` 与 `docs/vote-api.md`。
- 匿名树洞三套内联 SVG 图标的切换方式见 `docs/treehole-icons.md`。

## 重点页面

- 课程评价：`/course`
- 校园论坛：`/forum`
- 发布帖子：`/forum/post`
- 匿名树洞：`/forum/hole`
- 校园盲盒：`/campus/blindbox`
- 校园三合一：`/campus`
- 校历与地点：`/calendar`、`/places`
- 我的资料：`/profile`
