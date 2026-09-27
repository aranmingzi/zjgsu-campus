# 校园小程序 Logo 规范

## 设计概念

Logo 提取校徽中央深蓝几何结构的层叠、向上感，将其转化为一只圆润的几何小精灵。精灵手持打开的书本，绿色页面与叶片形结构呼应校徽中的绿色枝饰。

设计不包含校名、英文缩写、年份或任何其他文字。校徽原始内容没有直接嵌入，是经过简化的独立角色化改编。

## 文件

- `public/logo/zjgsu-campus-logo.svg`：可编辑主源文件。
- `public/logo/zjgsu-campus-logo-1024.png`：微信小程序图标上传尺寸。
- `public/logo/zjgsu-campus-logo-512.png`：高分辨率展示。
- `public/logo/zjgsu-campus-logo-256.png`：应用内或文档展示。
- `public/logo/zjgsu-campus-logo-128.png`、`64.png`、`32.png`：小尺寸预览与 favicon。

## 使用规则

- 保持圆形轮廓内部留白，不拉伸、不裁切、不改变主体比例。
- 在浅色背景上使用彩色主版本。
- 小于 64px 时不要添加额外文字、投影或装饰。
- 微信小程序后台配置 App 图标时使用 1024×1024 PNG 版本。
- 如需修改颜色，优先调整 `mascotBlue`、`leafGreen` 和 `bgGlow` 三个渐变。

## 色彩

- 主深蓝：`#08477B`
- 深蓝高光：`#12659F`
- 校徽绿系点缀：`#93C957` 至 `#4F8E37`
- 背景奶白：`#F8FCFF`
- 柔和浅蓝：`#E8F5FF`
- 腮红：`#FFB6B9`

## 再生成 PNG

```bash
pnpm exec node scripts/generate-logo-assets.mjs
```
