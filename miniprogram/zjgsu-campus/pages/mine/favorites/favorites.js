// pages/mine/favorites/favorites.js —— 我的收藏
// 收藏里存的是「类型 + id」，页面负责把 id 还原成能点进去的内容。
// 内容被删掉之后 id 还在列表里，这里要能安静地跳过，而不是显示一堆打不开的死链接。
const store = require('../../../utils/store.js');
const market = require('../../../utils/market.js');

Page({
  data: {
    items: [],
    loading: true,
    tab: 'all',
    tabMap: { all: true, course: false, post: false, market: false },
    countText: ''
  },

  onShow() {
    this.load();
  },

  load() {
    const favs = store.getFavorites();
    const items = [];
    favs.forEach((f) => {
      let it = null;
      if (f.type === 'course') {
        const c = store.getCourseById(f.id);
        if (c) it = { key: f.id, type: 'course', title: c.name, desc: c.college, url: '/pages/course/detail/detail?id=' + f.id };
      } else if (f.type === 'post') {
        const p = store.getPostById(f.id);
        if (p) it = { key: f.id, type: 'post', title: p.title, desc: p.content, url: '/pages/forum/detail/detail?id=' + f.id };
      } else if (f.type === 'review') {
        const r = store.getReviewById(f.id);
        // 评价本身没有独立页面，跳回它所属的课程
        if (r) it = { key: f.id, type: 'review', title: r.content, desc: '来自 5 分评价', url: '/pages/course/detail/detail?id=' + r.courseId };
      } else if (f.type === 'market') {
        const m = market.getMarketById(f.id);
        if (m) it = { key: f.id, type: 'market', title: m.title, desc: m.desc, url: '/pages/market/detail/detail?id=' + m.id };
      }
      if (it) items.push(it);
    });

    const tab = this.data.tab;
    const show = tab === 'all' ? items : items.filter((x) => x.type === tab);
    const tabMap = {};
    ['all', 'course', 'post', 'market'].forEach((k) => { tabMap[k] = k === tab; });

    this.setData({
      items: show,
      tabMap: tabMap,
      loading: false,
      countText: items.length ? items.length + ' 项收藏' : ''
    });
  },

  onTab(e) {
    const t = e.currentTarget.dataset.k;
    const tabMap = {};
    ['all', 'course', 'post', 'market'].forEach((k) => { tabMap[k] = k === t; });
    this.setData({ tab: t, tabMap });
    this.load();
  },

  open(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url: url });
  },

  async unfavorite(e) {
    const d = e.currentTarget.dataset;
    store.removeFavorite(d.type, d.id);
    this.load();
  }
});
