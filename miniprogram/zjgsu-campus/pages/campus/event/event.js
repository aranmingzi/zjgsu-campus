// pages/campus/event/event.js —— 活动详情（报名 / 取消报名 / 删除）
//
// 报名是这个功能唯一有「可撤销副作用」的动作：
// 报名人数要加、取消要减，还不能在云函数挂掉时谎报成功——
// 谎报之后同学以为报上了，到现场才发现没进去，比直接报错难受得多。
const eventApi = require('../../../utils/event.js');

Page({
  data: {
    id: '',
    ev: null,
    loading: true,
    joining: false,
    // 联系方式只有报过名 / 是自己发起的才显示：没报就能看号码，等于把私域流量公开
    contactVisible: false,
    notFound: false
  },

  onLoad(query) {
    this.setData({ id: (query && query.id) || '' });
    this.load(true);
  },

  onShow() {
    // 兜底：如果遮罩还挂着（上次提交被中断），顺手收掉。
    // 残留的 showLoading 会盖住整屏，之后所有按钮都点不动 —— 正是「点了没反应」的经典成因。
    if (this.data.joining) {
      this.setData({ joining: false });
      wx.hideLoading();
      wx.showToast({ title: '上一步没走完，已复位', icon: 'none' });
      this.load(true);
    }
  },

  async load(showLoading) {
    const id = this.data.id;
    if (!id) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    if (showLoading) wx.showLoading({ title: '加载中', mask: true });
    // 从云端重拉一遍：报名状态、人数都由服务端判定，本地缓存说了不算
    await eventApi.fetchEvents(1);
    wx.hideLoading();

    const ev = eventApi.getEventById(id);
    if (!ev) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.decorate(ev);
  },

  // WXML 里不能调方法，展示用的派生字段在这里一次算好
  decorate(ev) {
    const cap = Number(ev.capacity) || 0;
    const count = Number(ev.joinedCount) || 0;
    this.setData({
      ev: Object.assign({}, ev, {
        typeIcon: ev.official ? 'shield-check️' : eventApi.typeIcon(ev.type),
        typeLabel: ev.official ? '官方' : eventApi.typeLabel(ev.type),
        countText: cap > 0 ? (count + ' / ' + cap + ' 人已报名') : (count + ' 人已报名'),
        fullText: cap > 0 && count >= cap ? '人数已满' : '',
        // 官网抓下来的活动没有报名接口（发布方是学校，不走这套报名表），
        // 所以这类活动只给「看原文」的出口，不给「我要报名」的按钮
        official: !!ev.official
      }),
      // WXML 里不能调方法，展示用的派生字段在这里一次算好
      fullShown: !!(cap > 0 && count >= cap),
      contactVisible: !!ev.joined || !!ev.isMine,
      loading: false
    });
  },

  goBack() {
    wx.navigateBack();
  },

  /* ---------------- 报名 ---------------- */

  async onJoin() {
    const ev = this.data.ev;
    if (!ev) return;
    if (this.data.joining) {
      wx.showToast({ title: '正在提交，稍等一下', icon: 'none' });
      return;
    }
    this.setData({ joining: true });
    wx.showLoading({ title: '提交中', mask: true });
    const r = await eventApi.joinEvent(ev.id);
    wx.hideLoading();
    if (!r || r.ok === false) {
      this.setData({ joining: false });
      wx.showToast({ title: (r && r.msg) || '报名失败', icon: 'none' });
      return;
    }
    this.setData({ joining: false });
    wx.showToast({ title: r.already ? '你已经报名了' : '报名成功', icon: 'success' });
    await this.load(false);
  },

  async onCancel() {
    const ev = this.data.ev;
    if (!ev) return;
    if (this.data.joining) {
      wx.showToast({ title: '正在提交，稍等一下', icon: 'none' });
      return;
    }
    const d = await new Promise((resolve) => {
      wx.showModal({
        title: '取消报名？',
        content: '名额会立刻让给其他同学，之后再报要重新点',
        confirmText: '取消报名',
        confirmColor: '#d9534f',
        success: (r) => resolve(r)
      });
    });
    if (!d || !d.confirm) return;

    this.setData({ joining: true });
    wx.showLoading({ title: '提交中', mask: true });
    const r = await eventApi.cancelJoin(ev.id);
    wx.hideLoading();
    if (!r || r.ok === false) {
      this.setData({ joining: false });
      wx.showToast({ title: (r && r.msg) || '取消失败', icon: 'none' });
      return;
    }
    this.setData({ joining: false });
    wx.showToast({ title: '已取消报名', icon: 'success' });
    await this.load(false);
  },

  /* ---------------- 删除 / 联系 ---------------- */

  async onRemove() {
    const ev = this.data.ev;
    if (!ev || !ev.isMine) return;
    const d = await new Promise((resolve) => {
      wx.showModal({
        title: '删除这个活动？',
        content: '报名记录会一起清掉，确认吗？',
        confirmText: '删除',
        confirmColor: '#d9534f',
        success: (r) => resolve(r)
      });
    });
    if (!d || !d.confirm) return;
    wx.showLoading({ title: '删除中', mask: true });
    const r = await eventApi.removeEvent(ev.id);
    wx.hideLoading();
    if (!r || r.ok === false) {
      wx.showToast({ title: (r && r.msg) || '删除失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已删除', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 600);
  },

  // 复制官网原文链接：学校发布的活动，最终以官网为准确
  onCopySource() {
    const ev = this.data.ev || {};
    if (!ev.sourceUrl) {
      wx.showToast({ title: '这条没有原文链接', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: String(ev.sourceUrl),
      success: () => wx.showToast({ title: '原文链接已复制', icon: 'none' })
    });
  },

  // 复制联系方式：报名的人总要能找到组织的人
  onCopyContact() {
    const ev = this.data.ev;
    if (!ev || !ev.contact) return;
    wx.setClipboardData({
      data: String(ev.contact),
      success: () => wx.showToast({ title: '已复制联系方式', icon: 'none' })
    });
  },

  onShareAppMessage() {
    const ev = this.data.ev || {};
    return {
      title: (ev.title ? '商砖小站 · ' + ev.title : '商砖小站 · 校园活动'),
      path: '/pages/campus/campus'
    };
  }
});
