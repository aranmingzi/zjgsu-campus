// components/ui/sticky-filter/index.js
// 迁移自 src/components/ui/StickyFilterBar.vue
// 毛玻璃降级：半透明背景 + 同色描边，不用 backdrop-filter（小程序 WebView 不保证支持）
Component({
  properties: {
    blur: { type: Boolean, value: true },
  },
});
