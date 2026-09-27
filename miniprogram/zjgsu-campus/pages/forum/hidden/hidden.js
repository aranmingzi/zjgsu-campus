// pages/forum/hidden —— 被举报暂停展示的内容
//
// 这个页面存在的唯一理由：让「第 4、5 票」收得到。
//
// 一条内容被 3 票自动下架后，会从所有公开列表里消失。藏起来是它该做的，
// 可是一藏起来，学校里就没人再看得见它 —— 第 4、5 票再也没地方投，
// 「24 小时内 5 人举报自动删除」这条规则就成了摆设，凑够票的永远是广告/隐私那一路。
// 所以下架的内容必须留一个人人都能进的出口，进来能看、能申诉、也能继续举报。
const store = require('../../../utils/store.js');

Page({
  data: {
    posts: [],
    loading: true
  },

  onShow() {
    this.load();
  },

  load() {
    // 每次进来都重取：上一条刚被删掉，列表得跟着变，不然会残留一条已经没了的内容
    const posts = store.getHiddenPosts();
    this.setData({ posts, loading: false });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id || '';
    if (!id) return;
    wx.navigateTo({ url: '/pages/forum/detail/detail?id=' + id });
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  }
});
