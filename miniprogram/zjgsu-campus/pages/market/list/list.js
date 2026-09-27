// pages/market/list/list.js —— 失物招领 / 二手交易 列表
// 三个 tab 共用一套逻辑，只靠 type 切换；云端没部署时照常显示本地缓存。
const market = require('../../../utils/market.js');

// 「全部」= TYPES 里没有的 key，getMarkets / searchMarkets 会原样返回全部类型
const TABS = [
  { key: 'all', label: '全部' },
  { key: 'lost', label: '寻物' },
  { key: 'found', label: '招领' },
  { key: 'sell', label: '闲置' }
];

// 胶囊组件要的是「值数组 + 值->中文 的映射」，页面只负责把 TABS 摊成这两个
const TAB_KEYS = TABS.map((t) => t.key);
const TAB_LABELS = (function () {
  const m = {};
  TABS.forEach((t) => { m[t.key] = t.label; });
  return m;
})();

// 选中态不能用 tab === 'lost' 这种判等来加 class（WXML 表达式能判等，但要写三遍），
// 统一转成 map：tabMap.lost 就是 true/false
function tabMap(tab) {
  const m = {};
  TABS.forEach((t) => { m[t.key] = t.key === tab; });
  return m;
}

// 闲置分类（教材专区只在「闲置」tab 出现）
const CATS = [{ key: 'all', label: '全部', icon: '' }].concat(market.CATEGORIES);

function catMap(current) {
  const m = {};
  CATS.forEach((c) => { m[c.key] = c.key === current; });
  return m;
}

Page({
  data: {
    tabs: TABS,
    tabKeys: TAB_KEYS,
    tabLabels: TAB_LABELS,
    tab: 'all',
    tabMap: tabMap('all'),
    cats: CATS,
    category: 'all',
    catMap: catMap('all'),
    items: [],
    keyword: '',
    // 精准 / 模糊：默认模糊
    searchMode: 'fuzzy',
    // 骨架屏：首次进入先把占位画出来，别让用户看白屏
    loading: true,
    firstLoaded: false,
    noMore: false,
  },

  onLoad() {
    this.load();
  },

  onShow() {
    // 从发布页退回来时刷新（刚发的不该看不到）
    if (this.data.firstLoaded) this.load();
  },


  async load() {
    const tab = this.data.tab;
    const kw = String(this.data.keyword || '').trim();
    // 云端拉一页：本地缓存可能在别的设备改过，拉到就覆盖（fetchMarkets 会回写缓存）
    let pulled = 0;
    try {
      pulled = await market.fetchMarkets(1) || 0;
    } catch (e) {}
    // 过滤只做这一遍：原来关键词和分类各写一次，云端拉完只补了关键词，
    // 分类筛选就被整份覆盖掉 —— 选了「教材」，一联网就混进数码和生活类
    let list = kw
      ? market.searchMarkets(tab, kw, this.data.searchMode === 'exact')
      : market.getMarkets(tab);
    if (tab === 'sell') list = market.filterByCategory(list, this.data.category);

    const render = list.slice(0, 30);
    this.setData({
      items: render,
      noMore: render.length >= list.length,
      loading: false,
      firstLoaded: true
    });
  },

  onTab(e) {
    const t = e.currentTarget.dataset.k;
    if (t === this.data.tab) return;
    this.setData({ tab: t, tabMap: tabMap(t), keyword: '' });
    this.load();
  },

  // 胶囊组件回传的是 detail.value，包一层换成 onTab 认的 data-k，筛选逻辑就不必重写
  onPillChange(e) {
    this.onTab({ currentTarget: { dataset: { k: e.detail.value } } });
  },

  onCategory(e) {
    const c = e.currentTarget.dataset.c || 'all';
    if (c === this.data.category) return;
    this.setData({ category: c, catMap: catMap(c) });
    this.load();
  },

  onSearch(e) {
    const kw = e.detail.value;
    this.setData({ keyword: kw });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.load(), 250);
  },

  onSearchClear() {
    if (this._timer) clearTimeout(this._timer);
    this.setData({ keyword: '' });
    this.load();
  },

  // 精准 / 模糊：和课程页、论坛页同一套
  onSearchMode(e) {
    const m = e.currentTarget.dataset.m;
    if (m === this.data.searchMode) return;
    this.setData({ searchMode: m });
    this.load();
    wx.showToast({
      title: m === 'exact' ? '只找完全一致的' : '打错字也能找到',
      icon: 'none',
      duration: 1500
    });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/market/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/market/edit/edit?type=' + this.data.tab });
  },

  myTap() {
    wx.navigateTo({ url: '/pages/market/mine/mine' });
  },

  goResources() {
    wx.navigateTo({ url: '/pages/tool/resources/resources' });
  },

  previewImages(e) {
    const urls = e.currentTarget.dataset.imgs || [];
    if (!urls.length) return;
    wx.previewImage({ current: urls[0], urls: urls });
  },

  onShareAppMessage() {
    return {
      title: '商砖小站 · 丢了的 / 捡到的 / 闲置的都在这儿',
      path: '/pages/market/list/list'
    };
  }
});
