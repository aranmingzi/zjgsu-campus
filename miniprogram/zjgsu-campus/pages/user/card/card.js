// pages/user/card —— 同学名片
// 别人能在我这里看到多少，取决于我们之间的「关系」：
//   陌生人 → 只有昵称头像；点了「想认识」→ 等对方同意；同意后 → 才能看到联系方式。
const userApi = require('../../../utils/user.js');
const cloud = require('../../../utils/cloud.js');

Page({
  data: {
    openid: '',
    isMe: false,
    isFriend: false,
    waiting: false,
    profile: null,
    contactLabel: '',
    msg: '',
    showMsg: false,
    blockedMe: false, // 我拉黑了 TA
    blockedByThem: false // TA 拉黑了我，我发不出请求
  },

  onLoad(options) {
    const openid = options && options.openid ? options.openid : '';
    this.setData({ openid: openid });
    this.load();
  },

  onShow() {
    this.load();
  },

  load() {
    const openid = this.data.openid;
    if (!openid) {
      wx.showToast({ title: '缺少身份参数', icon: 'none' });
      return;
    }
    const myOpenid = cloud.getOpenid() || (userApi.getMyProfile().openid || '');
    this.setData({ isMe: !!myOpenid && myOpenid === openid });

    userApi.getProfile(openid).then((r) => {
      const p = r.profile || null;
      // 头像首字在 JS 里算好：WXML 的 {{}} 里不能调用 charAt。
      // 没资料就保持 null，否则会渲染出一个啥也没有的空壳页面。
      const decorated = p ? Object.assign({}, p, {
        avatarText: (p.nickName || '').charAt(0) || '同'
      }) : null;
      this.setData({
        profile: decorated,
        isFriend: !!r.isFriend,
        contactLabel: userApi.CONTACT_LABEL[p && p.contactType] || '联系方式'
      });
      if (!p) wx.showToast({ title: '这位同学还没有填资料', icon: 'none' });
    });

    // 我已经发出过请求但还没被处理
    userApi.listOutgoing().then((list) => {
      const hit = list.find((x) => x.toOpenid === openid);
      this.setData({ waiting: !!hit, msg: hit ? hit.message : '' });
    });

    // 拉黑状态：双向都要看，单向也不让你继续打扰
    userApi.listBlocks().then((list) => {
      const arr = list || [];
      this.setData({
        blockedMe: arr.some((b) => b.openid === openid)
      });
    });
    // 我拉黑的方向是 blocks[me→them]，对方拉黑我则是 them→me，
    // 后者靠 addRequest 在服务端拦；这里只做展示提示。
  },

  onMsg(e) {
    this.setData({ msg: e.detail.value });
  },

  toggleMsg() {
    this.setData({ showMsg: !this.data.showMsg });
  },

  onRequest() {
    const openid = this.data.openid;
    if (!openid) return;
    const msg = this.data.msg.trim();
    wx.showLoading({ title: '发送中', mask: true });
    userApi.addRequest(openid, msg).then((r) => {
      wx.hideLoading();
      if (r && r.ok === false) {
        wx.showToast({ title: r.msg || '发送失败', icon: 'none' });
        return;
      }
      this.setData({ waiting: true, showMsg: false, msg: msg });
      wx.showToast({ title: '已发出，等对方同意', icon: 'success' });
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '网络不太顺，再试一次', icon: 'none' });
    });
  },

  onCopy(e) {
    const v = e.currentTarget.dataset.v || '';
    if (!v) return;
    wx.setClipboardData({ data: String(v) });
  },

  onToggleBlock() {
    const openid = this.data.openid;
    if (!openid) return;
    if (!this.data.blockedMe) {
      wx.showModal({
        title: '拉黑这位同学',
        content: '拉黑后 TA 再也发不出请求，你也不会再看到 TA 的留言。',
        success: (res) => {
          if (!res.confirm) return;
          userApi.block(openid).then(() => {
            this.setData({ blockedMe: true });
            wx.showToast({ title: '已拉黑', icon: 'success' });
          });
        }
      });
      return;
    }
    wx.showModal({
      title: '解除拉黑',
      content: '解除后可以重新收到 TA 的请求。',
      success: (res) => {
        if (!res.confirm) return;
        userApi.unblock(openid).then(() => {
          this.setData({ blockedMe: false });
          wx.showToast({ title: '已解除', icon: 'success' });
        });
      }
    });
  },

  onEditMine() {
    wx.navigateTo({ url: '/pages/user/profile/profile' });
  }
});
