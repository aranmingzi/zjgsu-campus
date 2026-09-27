// pages/campus/blindbox/blindbox —— 校园盲盒 / 漂流瓶
//
// 规矩（详见云函数 bottleThrow / bottleFetch 上的注释）：
//   - 每天能捞 3 次，次数以云端为准（页面上的「剩 X 次」只是展示）；
//   - 捞到的瓶子只有类型和内容，「来自哪个学院」锁着 —— 回复成功才解锁；
//   - 自己扔的瓶子不会捞到自己手里；30 天没人捞到的瓶子沉海。
//
// 入口在「论坛」页（树洞入口下面）和「我的」页工具区。tabBar 满了，不占底部位置。
const bottle = require('../../../utils/bottle.js');

const KIND_KEYS = ['吐槽', '分享', '提问'];

Page({
  data: {
    // 今日剩余捞瓶次数：null = 还没从云端拿到（不显示数字，按钮也不置灰，
    // 云函数那道闸才是真的，这里只是别在数字没到之前吓唬用户）
    left: null,
    daily: bottle.DAILY_FETCH,
    // 云端拿不到数据时的说明（多半是云函数还没部署新版），如实写出来而不是装作没事
    cloudMsg: '',

    /* 扔瓶子 */
    kinds: KIND_KEYS.map((k) => ({ key: k, icon: bottle.kindIcon(k), hint: bottle.KINDS[k].hint })),
    throwKind: '吐槽',
    throwKindMap: { '吐槽': true, '分享': false, '提问': false },
    throwContent: '',
    throwing: false,

    /* 捞瓶子 */
    fetching: false,
    // 当前捞到的瓶子：{ id, kind, content, locked, ownerCollege }
    bottle: null,
    replyText: '',
    replying: false,
    // 解锁瞬间给个高亮：院系从锁到开，配上「已解锁」角标
    justUnlocked: false,

    /* 我的瓶子 */
    mineOpen: false,
    mine: [],
    mineLoading: false
  },

  onShow() {
    this.refresh();
  },

  // 从云端拿今日剩余次数 + 我扔的瓶子（含收到的回复）
  refresh() {
    bottle.myBottles().then((r) => {
      if (r && r.ok) {
        this.setData({
          left: Number(r.left) || 0,
          mine: r.mine || [],
          cloudMsg: ''
        });
      } else if (r && r.msg) {
        // 云函数没部署新版时给一句实话，别让页面看起来「坏了」
        this.setData({ cloudMsg: r.msg });
      }
    });
  },

  onPickKind(e) {
    const k = e.currentTarget.dataset.k || '吐槽';
    const m = {};
    KIND_KEYS.forEach((x) => { m[x] = x === k; });
    this.setData({ throwKind: k, throwKindMap: m });
  },

  onThrowInput(e) {
    this.setData({ throwContent: e.detail.value });
  },

  // 扔瓶子：云端过审后入库，同一类型的规则和论坛一致（屏蔽词 + 官方安全接口）
  async onThrow() {
    if (this.data.throwing) return;
    const content = String(this.data.throwContent || '').trim();
    if (!content) {
      wx.showToast({ title: '写点什么再扔吧', icon: 'none' });
      return;
    }
    this.setData({ throwing: true });
    wx.showLoading({ title: '封进瓶子里…', mask: true });
    let r;
    try {
      r = await bottle.throwBottle(this.data.throwKind, content);
    } catch (e) {
      r = { ok: false, msg: '网络好像不太稳，再试一次' };
    } finally {
      wx.hideLoading();
      this.setData({ throwing: false });
    }
    if (r && r.ok === false) {
      wx.showToast({ title: r.msg || '没扔出去，再试一次', icon: 'none', duration: 2500 });
      return;
    }
    this.setData({ throwContent: '' });
    wx.showToast({ title: '已经扔进海里啦', icon: 'success' });
    this.refresh();
  },

  // 捞瓶子：成功后瓶子浮上来；次数用完 / 海里没瓶，云端都会带原因回来
  async onFetch() {
    if (this.data.fetching) return;
    if (this.data.bottle) {
      // 手里还举着一只没处理的瓶子：先放回去再捞
      this.setData({ bottle: null, replyText: '', justUnlocked: false });
    }
    this.setData({ fetching: true });
    let r;
    try {
      r = await bottle.fetchBottle();
    } catch (e) {
      r = { ok: false, msg: '网络好像不太稳，再试一次' };
    } finally {
      this.setData({ fetching: false });
    }
    if (r && r.ok === false) {
      if (r.dry) {
        // 海里没瓶子：不算失败，把次数还回去
        this.setData({ left: Number(r.left) || this.data.left });
        wx.showToast({ title: r.msg || '海里暂时没有瓶子', icon: 'none', duration: 2500 });
        return;
      }
      if (r && typeof r.left === 'number') this.setData({ left: r.left });
      wx.showToast({ title: r.msg || '没捞到，稍后再试', icon: 'none', duration: 2500 });
      return;
    }
    this.setData({
      bottle: r.bottle,
      left: typeof r.left === 'number' ? r.left : this.data.left,
      replyText: '',
      justUnlocked: false
    });
  },

  onReplyInput(e) {
    this.setData({ replyText: e.detail.value });
  },

  // 回复捞到的瓶子：回复成功的那一刻，对方的院系解锁
  async onReply() {
    if (this.data.replying) return;
    const b = this.data.bottle;
    if (!b || !b.id) return;
    const content = String(this.data.replyText || '').trim();
    if (!content) {
      wx.showToast({ title: '回复写点什么吧', icon: 'none' });
      return;
    }
    this.setData({ replying: true });
    let r;
    try {
      r = await bottle.replyBottle(b.id, content);
    } catch (e) {
      r = { ok: false, msg: '网络好像不太稳，再试一次' };
    } finally {
      this.setData({ replying: false });
    }
    if (r && r.ok === false) {
      wx.showToast({ title: r.msg || '没发出去，再试一次', icon: 'none', duration: 2500 });
      return;
    }
    // 解锁：瓶子的「来自」翻开，页面上把院系亮出来
    this.setData({
      bottle: Object.assign({}, b, { locked: false, ownerCollege: (r && r.ownerCollege) || '未填写' }),
      replyText: '',
      justUnlocked: true
    });
    wx.showToast({ title: '已解锁对方院系', icon: 'success' });
    this.refresh();
  },

  // 放回去：不回复也行，瓶子继续漂
  onPutBack() {
    this.setData({ bottle: null, replyText: '', justUnlocked: false });
  },

  onToggleMine() {
    this.setData({ mineOpen: !this.data.mineOpen });
  },

  onShareAppMessage() {
    return {
      title: '商砖小站 · 校园盲盒，捞一个同学的悄悄话',
      path: '/pages/campus/blindbox/blindbox'
    };
  }
});
