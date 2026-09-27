// pages/user/friends —— 我的同学
// 三个页签：好友（可看联系方式）/ 请求（别人想认识我）/ 找同学（按昵称或学院搜）
const userApi = require('../../../utils/user.js');

// WXML 的 {{}} 表达式里不能调用函数（连 Page 里定义的方法也不行），
// 所以头像首字、联系方式标签这些都得先在 JS 里算好，模板只负责展示。
function decorate(f) {
  const name = f.nickName || '';
  return Object.assign({}, f, {
    avatarText: name ? name.charAt(0) : '同',
    contactText: userApi.CONTACT_LABEL[f.contactType] || '联系方式'
  });
}

Page({
  data: {
    tab: 'friends',
    friends: [],
    requests: [],
    outgoing: [],
    blocks: [], // 我拉黑的人
    keyword: '',
    results: [],
    searching: false,
    // 找同学也支持「精准 / 模糊」：名字打错一个字就搜不到人，
    // 在找人这件事上最让人以为小程序坏了
    searchMode: 'fuzzy'
  },

  onShow() {
    this.reloadAll();
  },

  reloadAll() {
    userApi.listFriends().then((list) => this.setData({
      friends: (list || []).map((f) => decorate(f))
    }));
    userApi.listRequests().then((list) => this.setData({ requests: list }));
    userApi.listOutgoing().then((list) => this.setData({ outgoing: list }));
    userApi.listBlocks().then((list) => this.setData({ blocks: list || [] }));
    if (this.data.keyword) this.doSearch();
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },

  doSearch() {
    const kw = this.data.keyword.trim();
    if (!kw) {
      this.setData({ results: [] });
      return;
    }
    this.setData({ searching: true });
    userApi.search(kw, this.data.searchMode === 'exact').then((list) => {
      this.setData({ results: (list || []).map((f) => decorate(f)), searching: false });
      if (!list || list.length === 0) {
        wx.showToast({ title: '没找到，换个昵称试试', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ searching: false });
    });
  },

  // 切「精准 / 模糊」：名字要真的一样才算，还是打错字也认。
  // 切完立刻按新档位重搜一次，不然按钮看着点了没反应
  onSearchMode(e) {
    const m = e.currentTarget.dataset.m;
    if (m === this.data.searchMode) return;
    this.setData({ searchMode: m });
    if (String(this.data.keyword || '').trim()) this.doSearch();
    wx.showToast({
      title: m === 'exact' ? '只找名字完全一样的' : '打错字也能找到',
      icon: 'none',
      duration: 1500
    });
  },

  goCard(e) {
    const openid = e.currentTarget.dataset.openid;
    if (!openid) {
      wx.showToast({ title: '这位同学还没登记资料', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/user/card/card?openid=' + openid });
  },

  onAccept(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '处理中', mask: true });
    userApi.respond(id, 'accept').then(() => {
      wx.hideLoading();
      wx.showToast({ title: '已通过', icon: 'success' });
      this.reloadAll();
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '操作失败，再试一次', icon: 'none' });
    });
  },

  onReject(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '处理中', mask: true });
    userApi.respond(id, 'reject').then(() => {
      wx.hideLoading();
      wx.showToast({ title: '已忽略', icon: 'none' });
      this.reloadAll();
    });
  },

  onUnblock(e) {
    const openid = e.currentTarget.dataset.openid;
    wx.showModal({
      title: '解除拉黑',
      content: '解除后这名同学可以重新给你发请求。',
      success: (res) => {
        if (!res.confirm) return;
        userApi.unblock(openid).then(() => {
          wx.showToast({ title: '已解除', icon: 'success' });
          this.reloadAll();
        });
      }
    });
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/user/profile/profile' });
  }
});
