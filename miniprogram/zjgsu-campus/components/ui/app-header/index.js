// components/ui/app-header/index.js
// 迁移自 src/components/ui/AppHeader.vue
// Web 版用 window.history.length 判断能不能返回；小程序用页面栈，
// 栈深 <= 1 说明是直接打开的（比如扫码 / 分享直达），这时给一个兜底首页。
const { system } = require('../../../utils/system.js');

Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    dark: { type: Boolean, value: false },
  },

  data: {
    nav: {},
    now: '',
  },

  lifetimes: {
    attached() {
      this.setData({ nav: system() });
      this._syncTime();
      this._timer = setInterval(() => this._syncTime(), 30000);
    },
    detached() {
      if (this._timer) clearInterval(this._timer);
    },
  },

  methods: {
    _syncTime() {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      this.setData({ now: `${h}:${m}` });
    },

    onBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.switchTab({ url: '/pages/course/list/list' });
      }
      this.triggerEvent('back');
    },

    onMore() {
      this.triggerEvent('more');
    },
  },
});
