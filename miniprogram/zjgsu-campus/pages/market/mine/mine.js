// pages/market/mine/mine.js —— 我发布的信息
// 入口在列表页右上角；删除 / 标记解决这些操作都在详情页，这里只负责列出来。
const market = require('../../../utils/market.js');

Page({
  data: {
    items: [],
    loading: true
  },

  onShow() {
    this.load();
  },

  async load() {
    let list = market.getMyMarkets();
    try {
      await market.fetchMarkets(1);
    } catch (e) {}
    list = market.getMyMarkets();
    this.setData({ items: list, loading: false });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/market/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/market/edit/edit' });
  }
});
