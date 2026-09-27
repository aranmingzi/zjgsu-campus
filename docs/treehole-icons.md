# 匿名树洞图标方案

入口卡片组件为 `src/components/forum/TreeHoleEntryCard.vue`，主图标组件为 `src/components/forum/TreeHoleIcon.vue`。

```vue
<TreeHoleEntryCard icon-variant="night-light" />
<TreeHoleEntryCard icon-variant="animal" />
<TreeHoleEntryCard icon-variant="cloud-moon" />
```

- `night-light`：暖光小夜灯，当前默认方案。
- `animal`：树洞里探头的小猫，更活泼。
- `cloud-moon`：云朵包住月亮，更安静、温柔。

三个方案都是内联 SVG，不依赖外部图片或图标字体。卡片点击态使用 `active:scale-[0.975]` 回弹。
