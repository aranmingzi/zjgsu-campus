// pages/forum/hole/hole —— 匿名树洞（独立区域）
//
// 和主论坛的区别：
//   1. 只显示「树洞」板块的帖子，主论坛（全部/各板块筛选）永远不混入；
//   2. 在这里发帖强制匿名：昵称换成「匿名·xxxx」，头像留空，连选择的机会都不给；
//   3. 没有板块选择、没有课程关联、没有配图 —— 降低表达门槛，只留文字。
//
// 排序和主论坛共用 store.getPosts 的那一套，只有四种（见下面 SORT_OPTIONS），
// 和主论坛看到的排序方式保持一致。
//
// 举报也跟主论坛完全一样：匿名是保护作者不被认出来，不是免罪牌。
// 树洞内容反而更容易出事（吐槽、爆料、人身攻击），更不能没有举报口。
const store = require('../../../utils/store.js');
const { vibrateShort } = require('../../../utils/system.js');
const moderation = require('../../../utils/moderation.js');
const userApi = require('../../../utils/user.js');

// 树洞只有四种排序：没有「最多踩」 —— 树洞里已经没有踩这个动作了（见 onPostVote），
// 留着一个排不出来的档位只会让同学以为排序坏了
const SORT_OPTIONS = [
  { k: 'latest', icon: 'clock', label: '最新' },
  { k: 'hot', icon: 'flame', label: '热门' },
  { k: 'likes', icon: 'heart', label: '最多抱抱' },
  { k: 'comments', icon: 'message-circle', label: '最多评论' }
];

Page({
  data: {
    posts: [],
    sort: 'latest', // latest | hot | likes | dislikes | comments
    sortOptions: SORT_OPTIONS,
    content: '',
    title: '',
    posting: false,
    loading: true,
    // 此刻的心情：只影响顶部氛围层，不发进帖子内容
    mood: 'sad',
    // 恢复的是哪条树洞草稿：发出去之后好把它撤掉
    draftId: ''
  },

  // 进页面就接上上次没说完的话：树洞的话往往是一口气写的，
  // 被打断再进来面对空框，多半就不想说了
  onLoad() {
    const last = store.getDrafts().find((x) => x.type === 'hole');
    if (last) {
      this.setData({
        draftId: last.id,
        title: last.title || '',
        content: last.content || ''
      });
    }
  },

  onShow() {
    this.load();
  },

  // 离开页面时自动存草稿，不用记得点任何按钮
  autoSaveDraft() {
    if (this._published) return;
    const d = this.data;
    const title = String(d.title || '').trim();
    const content = String(d.content || '').trim();
    if (!title && !content) {
      if (d.draftId) store.removeDraft(d.draftId);
      return;
    }
    const saved = store.saveDraft({ type: 'hole', title: title, content: content });
    if (saved && saved.id && saved.id !== d.draftId) this.setData({ draftId: saved.id });
  },

  onHide() { this.autoSaveDraft(); },
  onUnload() { this.autoSaveDraft(); },

  load() {
    // 带上「我举报过没有」：举报完按钮要变成「已举报」，
    // 否则用户以为没点上，一遍遍地戳（服务端本来就会去重，但界面得说实话）
    const posts = store.getHolePosts(this.data.sort).map((p) =>
      Object.assign({}, p, { reported: store.hasReported(p.id) })
    );
    this.setData({ posts: posts, loading: false });
  },

  onSortPick(e) {
    const sort = String(e.currentTarget.dataset.s || '');
    if (!sort || sort === this.data.sort) return;
    this.setData({ sort: sort });
    this.load();
  },

  // 树洞里没有「踩」：这里能点的只有「抱抱」。
  // 之前和主论坛一样有赞踩两颗按钮，但树洞是匿名说真心话的地方，
  // 「被踩」的反馈只会让人后悔说出来了；数据层 toggleVote 保留 dislike，
  // 主论坛还用，树洞页只是不再给它入口
  onPostVote(e) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    store.toggleVote(id, 'like');
    this.load();
  },

  // 举报树洞贴：和主论坛走同一个云函数，原因、判定、自动处置规则全都一样。
  // 匿名的只是「作者是谁」，内容照样要守规矩；而且树洞内容更容易出事，更不能没有举报口
  onReport(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const target = String(e.currentTarget.dataset.openid || '');
    if (!id) return;
    if (store.hasReported(id)) {
      wx.showToast({ title: '你已经举报过这条了', icon: 'none' });
      return;
    }
    if (!target) {
      wx.showToast({ title: '这条内容太老了，缺作者信息没法举报', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: moderation.REPORT_REASONS,
      success: (res) => {
        const reason = moderation.REPORT_REASONS[res.tapIndex];
        wx.showModal({
          title: '举报：' + reason,
          content: moderation.reportTip(reason),
          placeholderText: '例如：这条在推销校外培训班',
          editable: true,
          confirmColor: '#d9534f',
          success: async (m) => {
            if (!m.confirm) return;
            const r = await userApi.reportPost(target, reason, (m.content || '').slice(0, 200), id, 'post');
            // 举报已经落到服务端了，本地记一笔，按钮立刻变「已举报」
            store.markReported(id);
            // 云端当场判定处置动作，本地镜像跟着改，举报的人马上能看到结果
            if (r && r.action === 'hide') {
              store.setPostStatus(id, 'hidden');
            } else if (r && r.action === 'delete') {
              store.setPostStatus(id, 'deleted');
            }
            this.load();
            wx.showToast({ title: (r && r.msg) || '已提交', icon: 'none', duration: 2500 });
          }
        });
      },
      fail: () => {}
    });
  },

  onTitle(e) {
    this.setData({ title: e.detail.value });
  },

  onContent(e) {
    this.setData({ content: e.detail.value });
  },

  // 发帖：board 固定「树洞」，anonymous 固定 true
  // 服务端（云函数 postAdd）照样过屏蔽词和官方内容安全接口，匿名不是免罪牌
  async send() {
    // 同发帖页：上一次卡住时按钮会静默失灵，必须给个说法
    if (this.data.posting) {
      wx.showToast({ title: '还在发上一条，稍等一下', icon: 'none' });
      return;
    }
    const title = String(this.data.title || '').trim();
    const content = String(this.data.content || '').trim();
    if (!title && !content) {
      wx.showToast({ title: '想说什么就写下来吧', icon: 'none' });
      return;
    }
    // 树洞里的「加微信」也放行：私事约见面、找人帮忙，本来就要留联系方式
    if (!moderation.guardText(content, '树洞', store.HOLE_BOARD)) return;
    this.setData({ posting: true });
    let r;
    try {
      r = await store.addPost({
        board: store.HOLE_BOARD,
        title: title.slice(0, 60),
        content: content.slice(0, 2000),
        anonymous: true
      });
    } catch (e) {
      // 云函数超时/崩溃：按钮必须放开，输入框里的字也必须还在
      r = { ok: false, saved: false, msg: '网络好像不太稳，内容先存在本机了' };
    } finally {
      this.setData({ posting: false });
    }
    // 刷新一次：云端存不住时内容还在本机，列表里应该看得到自己刚写的那条
    this.load();
    if (r && r.ok === false) {
      wx.showToast({ title: r.msg || '没发出去，换个说法试试', icon: 'none', duration: 3000 });
      return;
    }
    this.setData({ title: '', content: '' });
    // 发出去了：这条草稿的使命结束了，别再留到下次进页面
    this._published = true;
    if (this.data.draftId) store.removeDraft(this.data.draftId);
    wx.showToast({ title: '已投进树洞', icon: 'success' });
  },

  // 切心情：氛围层 CSS 自己过渡 720ms，这里只换状态；
  // wx.vibrateShort 是小程序里唯一能碰到的震动反馈（Web 版的 navigator.vibrate 用不了）
  onMood(e) {
    const mood = String(e.currentTarget.dataset.m || '');
    if (!mood || mood === this.data.mood) return;
    vibrateShort();
    this.setData({ mood });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/forum/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  onPullDownRefresh() {
    this.load();
    // eslint-disable-next-line no-undef
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    return {
      title: '商砖小站 · 匿名树洞，说点不敢说的',
      path: '/pages/forum/hole/hole'
    };
  }
});
