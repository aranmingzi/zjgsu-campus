// components/ui/bottom-nav/index.js
// 迁移自 src/components/ui/BottomNav.vue
// 五个主 Tab 与 app.json 的 tabBar 一致：课程 / 论坛 / 闲置 / 校园 / 我的。
Component({
  properties: {
    active: { type: String, value: 'course' },
  },

  methods: {
    onTap(e) {
      const url = e.currentTarget.dataset.url;
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      // 已经在(tab)当前页就只回到顶部，避免 switchTab 什么都不做看着像卡住
      if (cur && cur.route && '/' + cur.route === url) {
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
        return;
      }
      wx.switchTab({ url, fail: () => wx.navigateTo({ url }) });
      this.triggerEvent('switch', { url });
    },
  },
});
