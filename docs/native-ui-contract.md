# 原生小程序 UI 迁移契约（所有页面迁移必须遵守）

把 `src/`（Vue3 + Tailwind 高保真原型）的 UI 迁到 `miniprogram/zjgsu-campus/`（微信原生）。
**只重写 WXML/WXSS，不重写业务逻辑。**

## 1. 设计令牌（已写进 `miniprogram/zjgsu-campus/app.wxss`，直接用语义类）

| 用途 | 值 | 类 |
| --- | --- | --- |
| 主色 | `#2B5AED` | `.bg-brand` / `.text-brand` |
| 主色深 | `#2047C9` | `.text-brand`（标签文字） |
| 主色浅底 | `#EFF4FF` | `.bg-brand-50` / `.brand-soft-bg` |
| 页面背景 | `#F5F7FA` | `.bg-canvas` |
| 文字 | `#172033` | 默认 |
| 次要/辅助 | `#6F7B91` / `#98A3B8` | `.muted` / `.faint` |
| 论坛紫 | `#7357FF` | `.bg-forum` / `.bg-forum-soft` / `.text-forum` |
| 闲置橙 | `#F58A32` | `.bg-market` / `.bg-market-soft` / `.text-market` |
| 校园绿 | `#19A66A` | `.bg-campus` / `.bg-campus-soft` / `.text-campus` |
| 个人资料青蓝 | `#2F9FD6` | `.bg-profile` / `.text-profile` |
| 危险 | `#DD4B55` | `.bg-danger-soft` / `.text-danger` |
| 圆角 | 外层 32rpx / 内层 24rpx / 胶囊 999rpx | `.card` / `.inner` / `.pill` |
| 阴影 | `0 8rpx 24rpx rgba(0,0,0,.05)` | `.card` |
| 主标题 | 36rpx 700 | `.title-lg` |
| 正文 | 28rpx | `.body-text` |
| 辅助 | 24rpx | `.muted` |
| 标签 | 20–22rpx | `.tag` / `.tag--campus` 等 |
| 热区 | ≥88rpx | `.hit` / `.pressable` |

## 2. 三条硬约束（违反会导致线上 bug）

1. **`.container` / `.page-scroll` 上绝不允许出现 `transform`**（含 animate 里的
   transform）。它们是 `position: fixed` 的包含块，一旦有 transform，页内所有
   悬浮按钮 / 固定底栏 / BottomSheet 都会退化成相对定位。
2. **不用浏览器专属 API**：`window`、`document`、`navigator.vibrate`、CSS
   `@property`、`clamp()`、`backdrop-filter`。震动用 `wx.vibrateShort`。
3. **不要写 Tailwind 工具类字符串进 WXML**。只能用 app.wxss 的语义类或本页面
   wxss 里新写的语义类。

## 3. 可用共享组件（`components/ui/`，在页面 json 的 usingComponents 里注册）

| 组件 | 路径 | 主要属性 |
| --- | --- | --- |
| app-header | `ui/app-header` | `title` `showBack` `dark` |
| base-card | `ui/base-card` | `padded` `clickable` `flat` `flush` |
| base-button | `ui/base-button` | `variant`(primary/secondary/ghost/danger/dark) `size` `disabled` `loading` `block` |
| icon-button | `ui/icon-button` | `variant`(light/glass/plain) `color`(ink/white/muted/brand/faint) `icon`(图标名) `size` |
| pill-selector | `ui/pill-selector` | `items` `value` `labels` `accent`(brand/forum/market/campus) → `change` |
| bottom-sheet | `ui/bottom-sheet` | `open` `title` `description` → `close` |
| empty-state | `ui/empty-state` | `title` `description` `actionLabel` `icon` `iconColor` → `action` |
| skeleton | `ui/skeleton` | `width` `height` `radius` |
| avatar-editor | `ui/avatar-editor` | `src` `size` `readonly` → `change` |
| vote-card | `ui/vote-card` | `voteData` → `vote` `open` `discuss` `share` `like` |
| treehole-entry | `ui/treehole-entry` | `iconVariant`(night-light/animal/cloud-moon) → `tap` |
| bottom-nav | `ui/bottom-nav` | `active` → `switch` |
| sticky-filter | `ui/sticky-filter` | `blur` |

## 4. 图标

线性 outline 小图标放在 `miniprogram/zjgsu-campus/assets/icons/<name>--<color>.svg`，
用 `<image class="..." src="/assets/icons/xxx--brand.svg" mode="aspectFit" />` 引用。
可用颜色：`brand brand600 white ink muted faint forum market campus profile danger amber`。
已有的名字：`chevron-right chevron-left x check plus search clock star message-circle
thumbs-up share-2 vote users user-round book-open book-open-check shopping-bag tag
map-pin map-pinned calendar-days megaphone users-round sparkles ticket compass bookmark
file-text notebook-pen life-buoy inbox send camera trash-2 edit image loader flame
message-square shield shield-check lock eye eye-off wallet gift award graduation-cap
list-checks pin map moon cloud edit refresh filter check-plus home settings menu`
**功能类 emoji 一律删掉**（搜索🔍、清除✕、匿名🎭 等），换成上面的图标。
情绪互动 emoji 可保留。

## 5. 导航

- 5 个 tab 页（course/list、forum/list、market/list、campus/campus、mine/mine）：
  用原生导航条 + 原生 tabBar，**不加 navigationStyle:custom**。
- 其余页面：用 `<app-header>` 自定义浅色导航，并在该页面 json 里加
  `"navigationStyle": "custom"`。app-header 需要 `showBack` 时走页面栈返回。

## 6. 必须保持不变的东西

- `*.js` 里的云函数 action、参数、storage key、分页逻辑、图片懒加载：一律不动。
- data 字段名、接口字段：UI 需要的数据如果页面 data 里没有，先复用已有字段，
  不要为了界面去改数据结构。
- 列表分页（onReachBottom / 滚动到底加载）和 `lazy-load`：保留。

## 7. 逐页要求

- 列表页用 `scroll-view` 或页面滚动，卡片间距 24rpx，卡片圆角 32rpx。
- 所有可点击 view 必须有按压反馈（`hover-class` 或 `.pressable`）。
- 点击热区 ≥88rpx。
- 320 / 375 / 430 三种宽度下文字不重叠、不溢出（用 `flex` + `min-width:0` +
  `truncate`）。
- 页面 wxss 里不要重复定义 app.wxss 已有的类。
