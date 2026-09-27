// pages/market/list/list.js —— 失物招领 / 二手交易 列表
// 三个 tab 共用一套逻辑，只靠 type 切换；云端没部署时照常显示本地缓存。
const market = require('../../../utils/market.js');
// 顶部 Banner：全站最热树洞 / 最急寻物 / 最火闲置（论坛、闲置、活动三个板块共用）
const bannerApi = require('../../../utils/banner.js');

const TABS = [
  { key: 'lost', label: '寻物' },
  { key: 'found', label: '招领' },
  { key: 'sell', label: '闲置' }
];

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
    tab: 'lost',
    tabMap: tabMap('lost'),
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
    // 顶部 Banner 轮播：4 秒自动切；手指一碰立刻停，抬手恢复
    banner: [],
    bannerIdx: 0,
    bannerAutoplay: true
  },

  onLoad() {
    this.load();
  },

  onShow() {
    // 从发布页退回来时刷新（刚发的不该看不到）
    if (this.data.firstLoaded) this.load();
    this.loadBanner();
  },

  /* ---------------- 顶部 Banner 轮播 ---------------- */

  // 数据随 onShow 刷新：刚发的寻物 / 闲置、刚被顶起来的树洞，回来就该看到新的
  loadBanner() {
    this.setData({ banner: bannerApi.getBannerItems(), bannerIdx: 0, bannerAutoplay: true });
  },

  // 手指触碰轮播立即停：自动切换和拖动抢一个 swiper，触摸期间把 autoplay 关掉
  onBannerTouchStart() {
    if (!this.data.bannerAutoplay) return;
    this.setData({ bannerAutoplay: false });
  },

  // 抬手 / 划出轮播区域就恢复自动切换
  onBannerTouchEnd() {
    if (this.data.bannerAutoplay) return;
    this.setData({ bannerAutoplay: true });
  },
  onBannerTouchCancel() {
    this.onBannerTouchEnd();
  },

  // swiper 自滚也会触发 change：只用来同步指示点
  onBannerChange(e) {
    const cur = e.detail.current;
    if (cur === this.data.bannerIdx) return;
    this.setData({ bannerIdx: cur });
  },

  onBannerTap(e) {
    const b = this.data.banner[e.currentTarget.dataset.idx];
    if (!b || !b.url) return;
    wx.navigateTo({ url: b.url });
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
