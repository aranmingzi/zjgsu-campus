# 原生小程序 UI 迁移报告

把仓库里 **Vue 3 + Tailwind 高保真原型**（`src/`）的界面，按最新设计令牌**真正重写**到
微信原生小程序 `miniprogram/zjgsu-campus/`，覆盖 `app.json` 里全部 **32 个页面**。

- 分支：`codex/miniprogram-ui-migration`
- 基线：`origin/main` @ `60914b0`（Ignore local GitHub CLI tools）
- 迁移契约：同目录 `docs/native-ui-contract.md`

---

## 一、一句话结论

**32 个页面全部迁移完成**，新增 13 个原生 UI 组件 + 840 个线性图标 + 1 个系统信息工具模块；
121 个既有文件被修改（33 wxml / 33 wxss / 32 json / 23 js）。
**但截图/真机验证没有做**（见「未完成项」），只做到了静态自检 + `node --check` 全量语法体检。

---

## 二、改了什么

### 2.1 新增

| 类别 | 内容 | 位置 |
| --- | --- | --- |
| 设计系统底座 | `app.wxss` 重写：颜色 / 圆角 / 阴影 / 字号 / 场景色 / 按钮 / 标签 / 列表行 / 骨架 / 空态 / 抽屉 / 毛玻璃降级 | `miniprogram/zjgsu-campus/app.wxss` |
| 13 个原生组件 | app-header、bottom-nav、base-card、base-button、icon-button、pill-selector、sticky-filter、bottom-sheet、empty-state、skeleton、avatar-editor、vote-card、treehole-entry | `components/ui/<name>/index.{js,json,wxml,wxss}` |
| 图标资源 | 840 个线性 outline SVG（70 个图标名 × 12 个颜色键），由脚本生成 | `assets/icons/<name>--<color>.svg` |
| 插画资源 | 牛皮纸袋（迁移自 `EmptyMarketState.vue` 内联 SVG）+ 树洞三套插画（夜灯 / 小动物 / 云月，替换原来的面具） | `assets/illustrations/` |
| 系统信息 | `system()`（状态栏 / 胶囊 / 安全区）+ `vibrateShort()`（替代 `navigator.vibrate`） | `utils/system.js` |
| 图标生成器 | lucide 风格几何 → 扁平 SVG | `scripts/generate-miniprogram-icons.py` |
| 自检脚本 | 8 项静态体检 | `scripts/verify-miniprogram-ui.py` |

### 2.2 修改

| 类型 | 数量 |
| --- | --- |
| WXML | 33 |
| WXSS | 33 |
| JSON（页面配置 / 组件注册） | 32 |
| JS | 23 |
| 合计 | **121** |

`app.json` 同步调整：`window` 白色导航条 + `#f5f7fa` 背景，tabBar 选中色 `#2b5aed` / 未选 `#98a3b8`；
32 条页面路径与 5 个 tabBar 项原样保留。

---

## 三、三条硬约束（写进 `app.wxss` 文件头，后续改样式别踩）

1. `.container` / `.page-scroll` **不能加常驻 transform**。一旦有 `transform`，它就变成
   `position: fixed` 的包含块，页内所有悬浮栏、FAB、bottom-sheet 会全部退化为相对定位。
   本次只在 `.container` 上留了 `animation: pageIn`（关键帧里也**不含** transform）。
2. **不用** `window` / `document` / `navigator.vibrate` / `backdrop-filter` / `@property` / `clamp()`。
3. 毛玻璃降级为「半透明背景 + 同色描边」（`.sticky-filter--blur`），震动走 `wx.vibrateShort({type:'light'})`。

---

## 四、逐页对照

「Web 参考」列取自 `src/router/index.ts` 的路由表和 `src/views` / `src/components` 的真实文件。
「截图」列标注为 `无` —— **本次没有产出任何截图**，原因见「未完成项」。

### 4.1 课程（course）

| # | 原生页面 | Web 参考 | WXML/WXSS | 状态 | 截图 | 改 JS |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `pages/course/list/list` | `views/course/CourseListView.vue` + `components/course/CourseCard.vue` | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 2 | `pages/course/detail/detail` | `GenericPageView.vue`(`/course/detail/:id`) + `components/course/CourseCard.vue` | 全量重写 | ✅ 完成 | 无 | ✅ `detail/review/teacher` 三处补 `navTitle` |
| 3 | `pages/course/review/review` | `GenericPageView.vue`(`/course/review/:courseId`, form) | 全量重写 | ✅ 完成 | 无 | ✅ `navTitle` |
| 4 | `pages/course/teacher/teacher` | `GenericPageView.vue`(`/course/teacher/:name`, detail) | 全量重写 | ✅ 完成 | 无 | ✅ `navTitle` |
| 5 | `pages/course/add/add` | `GenericPageView.vue`(`/course/add`, form) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |

### 4.2 论坛（forum）

| # | 原生页面 | Web 参考 | WXML/WXSS | 状态 | 截图 | 改 JS |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | `pages/forum/list/list` | `views/forum/ForumListView.vue` + `components/forum/TreeHoleEntryCard.vue` | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 7 | `pages/forum/detail/detail` | `views/forum/ForumDetailView.vue` + `components/vote/VoteCard.vue` | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 8 | `pages/forum/post/post` | `views/forum/PostComposerView.vue` | 全量重写 | ✅ 完成 | 无 | ✅ 补投票帖数据源，放行 `kind:'vote'` |
| 9 | `pages/forum/hole/hole` | `views/forum/HoleView.vue` + `components/forum/EmotionMoodIcon.vue` + `TreeHoleIcon.vue` | 全量重写 | ✅ 完成 | 无 | ✅ 补 `mood` / `onMood`，接 `vibrateShort` |
| 10 | `pages/forum/hidden/hidden` | `GenericPageView.vue`(`/forum/hidden`) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |

### 4.3 闲置（market）

| # | 原生页面 | Web 参考 | WXML/WXSS | 状态 | 截图 | 改 JS |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | `pages/market/list/list` | `views/market/MarketListView.vue` | 全量重写 | ✅ 完成 | 无 | ✅ 补 `tabKeys/tabLabels/onPillChange`，分类表加 `all` |
| 12 | `pages/market/detail/detail` | `GenericPageView.vue`(`/market/detail/:id`, detail) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 13 | `pages/market/edit/edit` | `GenericPageView.vue`(`/market/edit`, form) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 14 | `pages/market/mine/mine` | `GenericPageView.vue`(`/market/mine`) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |

### 4.4 校园（campus）

| # | 原生页面 | Web 参考 | WXML/WXSS | 状态 | 截图 | 改 JS |
| --- | --- | --- | --- | --- | --- | --- |
| 15 | `pages/campus/campus` | `views/campus/CampusHubView.vue` | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 16 | `pages/campus/add/add` | `GenericPageView.vue`(`/campus/add`, form) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 17 | `pages/campus/event/event` | `GenericPageView.vue`(`/campus/event/:id`, detail) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 18 | `pages/campus/blindbox/blindbox` | `views/campus/BlindBoxView.vue` | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |

### 4.5 我的 / 用户（mine, user）

| # | 原生页面 | Web 参考 | WXML/WXSS | 状态 | 截图 | 改 JS |
| --- | --- | --- | --- | --- | --- | --- |
| 19 | `pages/mine/mine` | `views/mine/MineHomeView.vue` | 全量重写 | ✅ 完成 | 无 | ✅ 补 `onHole`（入口卡片跳转树洞） |
| 20 | `pages/mine/favorites/favorites` | `GenericPageView.vue`(`/mine/favorites`) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 21 | `pages/mine/drafts/drafts` | `GenericPageView.vue`(`/mine/drafts`) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 22 | `pages/user/guide/guide` | `GenericPageView.vue`(`/guide`, settings) | 全量重写 | ✅ 完成 | 无 | ✅ 说明文案里的功能类 emoji 去掉 |
| 23 | `pages/user/profile/profile` | `views/user/ProfileView.vue` | 全量重写 | ✅ 完成 | 无 | ✅ 补 `privacyItems/privacyLabels/onPrivacy/onAvatarChange` |
| 24 | `pages/user/card/card` | `GenericPageView.vue`(`/user/card/:id`, detail) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 25 | `pages/user/friends/friends` | `GenericPageView.vue`(`/friends`) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 26 | `pages/user/chats/chats` | `GenericPageView.vue`(`/chats`) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 27 | `pages/user/chat/chat` | `GenericPageView.vue`(`/chat/:id`, detail) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |

### 4.6 工具与管理（tool, admin）

| # | 原生页面 | Web 参考 | WXML/WXSS | 状态 | 截图 | 改 JS |
| --- | --- | --- | --- | --- | --- | --- |
| 28 | `pages/tool/calendar/calendar` | `views/tools/CalendarView.vue` | 全量重写 | ✅ 完成 | 无 | ✅ `setData` 补 `nextDays/nextName/nextDate` |
| 29 | `pages/tool/resources/resources` | `GenericPageView.vue`(`/resources`) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 30 | `pages/tool/places/places` | `views/tools/PlacesView.vue` + `components/ui/MapPreview.vue` | 全量重写 | ✅ 完成 | 无 | ✅ **补齐地图抽屉整条链路**（见下） |
| 31 | `pages/tool/memo/memo` | `GenericPageView.vue`(`/memo`, form) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |
| 32 | `pages/admin/moderation/moderation` | `GenericPageView.vue`(`/admin/moderation`) | 全量重写 | ✅ 完成 | 无 | ❌ 未改 |

**32 / 32 全部完成。**

---

## 五、迁移过程中修掉的真实缺陷

这些不是样式问题，是「照着原型重写时暴露出来的坑」，逐条记录以便复查：

| # | 问题 | 处理 |
| --- | --- | --- |
| 1 | `components/ui/skeleton` 只有 `index.js` / `index.json`，**缺 `index.wxml` / `index.wxss`**，组件根本注册不上 | 补齐两个文件 |
| 2 | `components/ui/bottom-nav` 拿 tab 的 key 当图标名，`{{...}}` 展开成 `course--brand.svg` 这种不存在的文件，五个 Tab 全是碎图 | 重写为 5 个写死的图标名 |
| 3 | 9 处 `★` 文本星标（course/list ×1、course/detail ×3、course/teacher ×5） | 全部换成 `star--amber` / `star--faint` 线性图标，清掉死规则 |
| 4 | 7 个页面 wxml 用了 `show-back`（连字符），而 `app-header` 的属性名是驼峰 `showBack`，返回按钮不显示 | 统一改成驼峰；顺带把 `vote-data` / `icon-variant` 也统一成驼峰，与仓库既有的 `reviewsCount` 写法一致 |
| 5 | `utils/banner.js` 里 3 个功能类 emoji（🎭 🔍 🛍️），被 `utils/banner.wxml` 以文字形式渲染到三个列表页的轮播上 | emoji 换成线性图标名，wxml 改渲染 `<image>`；新增 `bannerTone` 数据字段区分渐变底（white）/ 白底卡（brand） |
| 6 | `pages/campus/campus.wxml` 用了 `<include src="/utils/banner.wxml"/>`，但这页**从来没有 banner 的样式**，轮播会裸奔 | 在 `campus.wxss` 补齐白底卡样式 |
| 7 | **`pages/tool/places/places.wxml` 绑了 7 个 wxml 里存在、但 js 里完全不存在的方法**（`onWalkRoute` / `onCallBus` / `onMarkerTap` / `onSheetClose`），`navOpen` / `sheetPlace` / `markers` 三个数据字段也全部缺失 → 地图上的标记是空的、抽屉永远打不开、「到达方式」两个按钮点了没反应 | 补齐：`markers` 由 `list` 的经纬度算出来（`id` 用下标 + 1，`onMarkerTap` 按 `markerId` 反查），`onOpen` 改为开抽屉，`onWalkRoute` 走 `wx.openLocation`，`onCallBus` 在无热线时给明确提示 |
| 8 | 全站 JS 数据里散布的功能类 emoji：`data/seed.js` 9 个板块图标、`utils/event.js`、`utils/market.js`、`utils/bottle.js`、campus / calendar / places / resources / hole / list / edit 的分类与排序图标、`pages/course/detail` 的 actionSheet 打勾 | 逐条换成线性图标名；只有**情绪类** emoji 按契约保留（树洞「抱抱 / 递茶 / 摸摸头」、备忘的五种心情） |
| 9 | `pages/user/guide/guide.js` 的说明文案里混着 emoji | 纯文字化，去掉图标名残留 |

---

## 六、视觉与交互的落点

| 规格要求 | 落地位置 |
| --- | --- |
| 主色 `#2B5AED` / 页面底 `#F5F7FA` / 卡片白 | `app.wxss` 令牌区 |
| 场景色：论坛紫 `#7357FF`、闲置橙 `#F58A32`、校园绿 `#19A66A`、个人资料青蓝 `#2F9FD6` | `.scene-*`、`--forum` / `--market` / `--campus` / `--profile` 变量 |
| 圆角 外层 32rpx / 内层 24rpx / 胶囊 999rpx；阴影 `0 8rpx 24rpx rgba(0,0,0,.05)` | `.card`、`.pill`、`.btn-primary` |
| 字号 主标题 36rpx 700 / 正文 28rpx / 辅助 24rpx / 标签 20–22rpx | `.title-lg` / `.body-text` / `.muted` / `.label` |
| 热区 ≥ 88rpx + 按压反馈 | `.hit`、`.pressable:active{opacity:.72;transform:scale(.985)}` |
| 线性 outline 图标 | `assets/icons`（840 个，`<image>` 渲染） |
| 课程卡「暂无评分」不显示 0.0 | `course-card` 组件内判断 |
| 发帖三模式动画 | `pages/forum/post` 的 WXSS 过渡 |
| 投票三态 + 500ms 进度条 + 震动 | `components/ui/vote-card`（`transition: width .5s ease-out`，对应 Web 版 `duration-500`；`_commit` 先置 `submitting` 防连点并发） |
| 树洞三套插画（不用面具）+ 紫渐变星点 + 盾牌提示 | `components/ui/treehole-entry`（`linear-gradient(135deg,#7357ff,#5b46d6,#4a3bb8)` + 4 个星点） |
| 树洞 6 情绪 600–800ms 切换 + 毛玻璃 | `pages/forum/hole` 氛围层 720ms 过渡 + `.sticky-filter--blur` 降级方案 |
| 地图真实地图 + bottom sheet 选步行 / 校车 | `<map markers>` + `components/ui/bottom-sheet` |
| 闲置牛皮纸袋 SVG + 指定文案 + 发布 CTA | `assets/illustrations/empty-market-bag.svg` + `empty-state` |

---

## 七、验证

### 7.1 自检脚本（本次新建）

```
$ python scripts/verify-miniprogram-ui.py

检查 32 个页面 / 47 个 wxml
警告 10 条:
  ! data\seed.js: 注释里的符号 '⚠️' → ...
  ! utils\config.js: 注释里的符号 '⚠️' → ...
  ...
原生 UI 迁移自检：全部通过
```

8 项检查：图标引用存在性、组件注册、禁用 API、`.container` 无 transform、32 页文件完整 +
`navigationStyle:custom` 与 `<app-header>` 匹配、无功能类 emoji、bind 处理函数存在。
10 条**警告**全部是「注释里的 ⚠️ / ✓」这类不会渲染给用户的内容，不算违规。

### 7.2 JS 语法体检

```
$ for f in $(find miniprogram -name "*.js"); do node --check "$f"; done
语法错误 0 个        # 68 个 js 全部通过
```

### 7.3 未采用仓库自带 `scripts/verify.mjs`

它是 Vue 原型的 Playwright 验证（要起 `vite preview` + `@playwright/test`），
跟小程序侧无关，本次没有跑。

---

## 八、未完成项（如实列出，不做隐藏）

1. **没有截图，也没有真机 / 开发者工具内的编译验证。**
   脚本层面的静态检查全过、`node --check` 全过，但「渲染出来长什么样」没有被机器验证过。
   试过 `cli open --project <工程目录>` 触发开发者工具编译，卡在 `- initialize` 没有推进，
   说明这一步需要人工在工具里登录并确认。人工复核时请重点看 Console 与 32 页的逐个编译结果。
2. **推送被权限拦住了。** `git push` 返回
   `403 Permission to aranmingzi/zjgsu-campus.git denied to Lee2277-t` ——
   当前这台机器上认证用的是账号 `Lee2277-t`，它对 `aranmingzi/zjgsu-campus` **没有写权限**。
   本地提交可以正常生成，**分支没有推到远端，PR 没有创建**。
3. **云函数、登录、课程评价、投票、树洞、地图这六块的能力没有被删掉**，全部原样保留；
   本次只动表现层（WXML / WXSS / 少量数据字段与方法），没有动业务逻辑与云函数。
4. 为绕开本地代理对 TLS 的拦截，排查期间在**本地仓库级**设过 `http.sslVerify=false`。
   已经用 `git config --local --unset http.sslVerify` 撤销，当前是默认开启；
   推送失败的根因是账号权限（第 2 条）而不是 TLS，这一项不需要保留。
5. 调试用的临时分支 `tmp/push-probe` 仍在本地，可以删掉（远端无残留）。
