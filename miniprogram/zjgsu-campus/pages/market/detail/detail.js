// pages/market/detail/detail.js —— 失物招领 / 二手 详情
// 这一页真正的目的只有一个：让丢东西和捡到东西的人能联系上。
// 所以联系方式要显眼，联系不上就退一步给「打个招呼」——直接进私信。
const market = require('../../../utils/market.js');

Page({
  data: {
    item: null,
    loading: true,
    loadingText: '加载中…'
  },

  onLoad(options) {
    this.id = options.id || '';
    this.load();
  },

  onShow() {
    // 从私信返回时状态可能已经变了（对方已解决）
    if (this.id) this.load();
  },

  async load() {
    if (!this.id) {
      this.setData({ loading: false, loadingText: '这条记录不存在' });
      return;
    }
    // 先吃本地缓存，别让用户对着空白等网络
    const local = market.getMarketById(this.id);
    if (local) this.setData({ item: local, loading: false });

    // 再拉一次云端：状态（已解决）可能被别人改过
    try {
      await market.fetchMarkets(1);
    } catch (e) {}
    const fresh = market.getMarketById(this.id);
    this.setData({ item: fresh || local, loading: false, loadingText: '这条记录不见了' });
    if (fresh) {
      wx.setNavigationBarTitle({ title: market.typeLabel(fresh.type) + '详情' });
    }
  },

  copyContact() {
    const c = (this.data.item && this.data.item.contact) || '';
    if (!c) {
      wx.showToast({ title: '发布者没留联系方式', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: c,
      success: () => wx.showToast({ title: '联系方式已复制', icon: 'success' })
    });
  },

  // 直接进私信：比切出去翻通讯录快一步
  goChat() {
    const it = this.data.item || {};
    const name = it.author || '这位同学';
    if (!it.openid) {
      wx.showToast({ title: '暂时联系不上发布者', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/user/chat/chat?peer=' + it.openid + '&name=' + name });
  },

  async onDone() {
    const it = this.data.item || {};
    if (!it.isMine) return;
    await market.markDone(it.id);
    this.load();
    wx.showToast({ title: it.done ? '已重新开放' : '已标记为解决', icon: 'success' });
  },

  onDelete() {
    const it = this.data.item || {};
    wx.showModal({
      title: '删除这条',
      content: '删掉之后其他人就看不到了，确定吗？',
      confirmColor: '#d9534f',
      success: async (res) => {
        if (!res.confirm) return;
        await market.removeMarket(it.id);
        wx.navigateBack();
      }
    });
  },

  previewImages(e) {
    const urls = e.currentTarget.dataset.imgs || [];
    if (!urls.length) return;
    wx.previewImage({ current: urls[0], urls: urls });
  },

  onShareAppMessage() {
    const it = this.data.item || {};
    const imgs = it.images || [];
    return {
      title: (it.title || '一条校园信息') + ' · 商砖小站',
      path: '/pages/market/detail/detail?id=' + this.id,
      imageUrl: imgs[0] || ''
    };
  },

  onShareTimeline() {
    const it = this.data.item || {};
    return { title: it.title || '商砖小站 · 失物招领与闲置分享', query: 'id=' + this.id };
  }
});
