// pages/forum/detail/detail.js
const store = require('../../../utils/store.js');
const moderation = require('../../../utils/moderation.js');
const userApi = require('../../../utils/user.js');
const cloud = require('../../../utils/cloud.js');

// 给每条留言先算好「我能不能删」「我举报过没」。
// WXML 的 {{}} 里调不了函数（写了整页都会崩），所以这些标记必须在这里算好再交给模板。
// 能删的人三档都认：留言的人自己、发帖的人（信息墙的维护者）、审核员 —— 云端还会再认一遍。
// 「我举报过」只认本地那份记录：服务端才是权威，这里纯粹是为了让按钮变成「已举报」，
// 不然同学以为自己没点上，对着同一条一遍一遍地戳。
function decorateComments(post, isMine) {
  const myOid = String(store.myOpenid() || '');
  const mod = !!store.isModerator();
  const list = (post.comments || []).map((c) => {
    const who = String(c.authorOpenid || c._openid || '');
    return Object.assign({}, c, {
      canRemove: !!isMine || (!!myOid && who === myOid) || mod,
      reported: store.hasReportedComment(post.id, c.id)
    });
  });
  return Object.assign({}, post, { comments: list });
}

Page({
  data: {
    id: '',
    post: null,
    commentText: '',
    postImages: [], // 已去掉云存储前缀的 fileID，直接给 image src 用
    isMine: false,
    // 收藏和私信作者都要靠数据表达：模板里写不了函数
    favorited: false,
    canChat: false,
    // 内容被自动删除后：本地那份也跟着没，页面得给个说得清的收尾，不能继续挂着旧内容
    gone: false
  },

  onLoad(options) {
    this.setData({ id: options.id });
    this.load();
  },

  onShow() {
    this.load();
  },

  load() {
    const post = store.getPostById(this.data.id);
    if (post) {
      // 归属判定统一走 store.isMinePost（身份字段 + 老帖昵称兜底）
      const isMine = store.isMinePost(post);
      this.setData({
        post: decorateComments(post, isMine),
        // 云存储 fileID 本身就能当 image 的 src 用
        postImages: post.images || [],
        isMine: isMine,
        // 树洞帖没有「踩」：点赞在这页叫「抱抱」，按钮文案和数量含义随板块变
        isHole: post.board === '树洞',
        favorited: store.isFavorited('post', post.id),
    // 只有不是自己的帖子才能「打招呼」，自己跟自己聊没意义
    canChat: !isMine && !!post.authorOpenid,
    // 「恢复展示」只有作者能点（云函数会拦，别人点了也只有一句提示）。
    // 但下架之后「举报」必须留给所有人 —— 这是第 4、5 票唯一进得去的口子
    canRestore: isMine
  });
      // 信息墙的标题栏应该叫主题，不然用户点进来以为走错页了
      wx.setNavigationBarTitle({ title: post.kind === 'topic' ? (post.board + ' · 信息墙') : post.board });
    }
  },

  onFavorite() {
    const p = this.data.post || {};
    const r = store.toggleFavorite({ type: 'post', id: p.id, title: p.title || '' });
    if (!r.ok) return;
    this.setData({ favorited: !!r.favorited });
    wx.showToast({ title: r.favorited ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  goChat() {
    const p = this.data.post || {};
    if (!p.authorOpenid) {
      wx.showToast({ title: '这位同学还没有身份信息', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/user/chat/chat?peer=' + p.authorOpenid + '&name=' + (p.author || '这位同学')
    });
  },

  onComment(e) {
    this.setData({ commentText: e.detail.value });
  },

  sendComment() {
    const text = this.data.commentText.trim();
    if (!text) {
      wx.showToast({ title: '说点什么吧', icon: 'none' });
      return;
    }
    // 信息墙上的留言过的是「全局词表」：这里不带板块参数，
    // 因为留言是留给所有同学看的公开信息，跟发在哪个板块无关
    if (!moderation.guardText(text, '评论')) return;
    store.addComment(this.data.id, text);
    this.setData({ commentText: '' });
    this.load();
    wx.showToast({ title: '评论成功', icon: 'success' });
  },

  // 删一条留言。
  //
  // 弹确认是因为误删太容易：手滑点到就少了一条别人还需要的群号。
  // 服务端会再认一遍权限（留言人本人 / 帖主 / 审核员），这里只是别让人白删。
  onRemoveComment(e) {
    const commentId = e.currentTarget.dataset.id || '';
    if (!commentId) return;
    const p = this.data.post || {};
    const target = (p.comments || []).find((c) => c.id === commentId) || {};
    const who = (p.kind === 'topic' && p.isMine) ? '这条主题是你发的，' : '';
    wx.showModal({
      title: '删掉这条留言？',
      content: who + '「' + String(target.content || '').slice(0, 30) + '」删掉后就找不回来了。',
      success: (res) => {
        if (!res.confirm) return;
        // 先撤本地：界面立刻少一条，不用等云端转一圈
        store.removeComment(this.data.id, commentId);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.load();
        // 云端那份撤不掉也得说清楚，别让人以为「删了就是删了」
        userApi.removeComment(this.data.id, commentId).then((r) => {
          if (r && r.ok === false) {
            wx.showToast({ title: r.msg || '没能同步到云端', icon: 'none' });
            this.load();
          }
        }).catch(() => {});
      }
    });
  },

  // 举报一条留言。
  //
  // 删留言这事儿以前只有三档人能干（留言的人自己 / 帖主 / 审核员），
  // 可运营是一个人，不可能天天盯着每条留言。所以这里把举报通道也开出来：
  // 凑够人数服务端直接删，不用谁亲手点。
  async onReportComment(e) {
    const commentId = e.currentTarget.dataset.id || '';
    if (!commentId) return;
    const post = this.data.post || {};
    const target = (post.comments || []).find((c) => c.id === commentId) || {};
    if (!target.id) return;
    if (store.hasReportedComment(post.id, commentId)) {
      wx.showToast({ title: '你已经举报过这条了', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: moderation.REPORT_REASONS,
      success: (res) => {
        const reason = moderation.REPORT_REASONS[res.tapIndex];
        wx.showModal({
          title: '举报：' + reason,
          content: moderation.reportTip(reason),
          placeholderText: '例如：这个是校外培训机构的招生群',
          editable: true,
          confirmColor: '#d9534f',
          success: async (m) => {
            if (!m.confirm) return;
            const r = await userApi.reportComment(post.id, commentId, reason, (m.content || '').slice(0, 200));
            // 落地了就记一笔，按钮立刻变「已举报」
            store.markReportedComment(post.id, commentId);
            // 服务端当场判定：凑够人数这条留言已经没了
            // —— 本地那份也得跟着撤，否则页面上还挂着一条全校都看不到的东西
            if (r && r.removed) store.removeComment(post.id, commentId);
            this.load();
            wx.showToast({ title: (r && r.msg) || '已提交', icon: 'none' });
          }
        });
      },
      fail: () => {}
    });
  },

  onLike() {
    store.toggleVote(this.data.id, 'like');
    this.load();
  },

  // 点踩：和点赞互斥（云端会强制换边），再点一次取消
  onDislike() {
    store.toggleVote(this.data.id, 'dislike');
    this.load();
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/forum/list/list' }) });
  },

  previewImages(e) {
    const list = e.currentTarget.dataset.imgs || [];
    if (!list.length) return;
    wx.previewImage({ current: list[0], urls: list });
  },

  // 举报：选完原因补一句说明（可留空），提交后由服务端当场决定处置动作
  onReport() {
    const post = this.data.post;
    const target = (post && post.authorOpenid) || '';
    if (!target) {
      wx.showToast({ title: '无法识别作者', icon: 'none' });
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
            const r = await userApi.reportPost(target, reason, (m.content || '').slice(0, 200), post.id, 'post');
            // 云端当场判定处置动作，本地缓存要跟着改，举报的人马上就能看到结果：
            //   hide    → 下架（还能恢复）
            //   delete  → 限时内多人举报，内容已经删了，本地那份也必须清掉，
            //             否则手机上还挂着一条云端已经不存在的内容
            if (r && r.action === 'hide') {
              store.setPostStatus(post.id, 'hidden');
              this.load();
            } else if (r && r.action === 'delete') {
              // 云端已经把它标记成 deleted，本地那份必须一起标掉，
              // 不然页面上还挂着一条全校都看不见的内容
              store.setPostStatus(post.id, 'deleted');
              this.load();
            }
            wx.showToast({ title: (r && r.msg) || '已提交', icon: 'none' });
          }
        });
      },
      fail: () => {}
    });
  },

  // 自己的内容被系统自动下架：给一个直接的恢复入口，不用去找审核员
  onRestore(e) {
    const id = e.currentTarget.dataset.id || this.data.id;
    wx.showModal({
      title: '恢复展示',
      content: '确认这条内容没有违规吗？恢复后其他同学就能看到。',
      success: (res) => {
        if (!res.confirm) return;
        store.setPostStatus(id, 'normal');
        this.load();
        wx.showToast({ title: '已恢复', icon: 'success' });
      }
    });
  },

  onDelete() {
    wx.showModal({
      title: '删除帖子',
      content: '删掉后其他人就看不到这条了，确定吗？',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.deletePost(this.data.id);
        setTimeout(() => {
          wx.navigateBack();
          wx.showToast({ title: '已删除', icon: 'success' });
        }, 200);
      }
    });
  },

  // 点作者进名片：可以「想认识」，对方同意后才互相看到联系方式
  goAuthor(e) {
    const id = e.currentTarget.dataset.openid;
    if (!id) return;
    wx.navigateTo({ url: '/pages/user/card/card?openid=' + id });
  },

  // 从课程讨论跳到课程详情页
  goCourse(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/course/detail/detail?id=' + id });
  },

  /* ---------------- 分享 ---------------- */

  // 转发给朋友：对方点开直接落到这条帖子的详情页
  onShareAppMessage() {
    const p = this.data.post;
    const title = (p && p.title) ? p.title : '商砖小站';
    return {
      title: title + ' · 来自商砖小站',
      path: '/pages/forum/detail/detail?id=' + this.data.id,
      // 有配图就用第一张当分享卡的背景，比系统默认图好看得多
      imageUrl: (this.data.postImages && this.data.postImages[0]) || ''
    };
  },

  // 分享到朋友圈：query 带上帖子 id，别人点开就是这条内容
  onShareTimeline() {
    const p = this.data.post;
    return {
      title: (p && p.title ? p.title : '浙小商论坛') + ' · 校园生活都在这儿',
      query: 'id=' + this.data.id,
      imageUrl: (this.data.postImages && this.data.postImages[0]) || ''
    };
  }
});
