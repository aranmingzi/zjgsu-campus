// pages/forum/list/list.js
// 分页：一次只渲染一页，触底再要下一页；没有更多了才回头让云端多给一页。
const store = require('../../../utils/store.js');
const moderation = require('../../../utils/moderation.js');
const userApi = require('../../../utils/user.js');
// 全站同一套精准 / 模糊内核：帖子标题打错字也该搜得到

const COURSE_BOARD = '课程评价';
const PAGE_SIZE = store.PAGE.SIZE;

// 排序档位：加一档就得在 store.getPosts 里有对应的排法，否则切过去是「没反应」。
// 「最多评论」是信息墙专用的入口：找同好群的人不会去翻最新，
// 他要的是「已经聚了最多人的那一个」—— 喊了三个月没人的群不该排在他前面
const SORT_OPTIONS = [
  { k: 'latest', icon: 'clock', label: '最新' },
  { k: 'hot', icon: 'flame', label: '热门' },
  { k: 'likes', icon: 'thumbs-up', label: '最多赞' },
  { k: 'dislikes', icon: 'thumbs-down', label: '最多踩' },
  { k: 'comments', icon: 'message-circle', label: '最多留言' }
];

Page({
  data: {
    posts: [],
    board: '全部',
    boards: ['全部'],
    sort: 'latest', // latest | hot | likes | dislikes | comments
    sortOptions: SORT_OPTIONS,
    isCourseBoard: false,
    courseFilter: [], // [{ courseId, courseName, count }]
    courseId: '', // 当前筛选的课程，空串表示不限
    rendered: 0, // 已经渲染出来的条数
    noMore: false,
    refreshing: false,
    // 搜索相关：keyword 是输入框里的原文，searching 是「正在按关键词展示结果」
    keyword: '',
    searching: false,
    // 搜过一次（结果已渲染）：只用来区分「搜不到」和「这个板块本来就没帖子」
    searched: false,
    resultCount: 0,
    // 精准 / 模糊：默认模糊，打错字也搜得到
    searchMode: 'fuzzy',
    searchHistory: [],
    hotKeywords: [],
    // 卡片上点「分享」时记下这条帖子，系统菜单的转发会优先转发它
    sharePost: null,
    // 骨架屏与断网提示：加载态和空态都要有，别让用户在白屏上猜发生了什么
    loading: true,
    offline: false,
    // 被举报暂停展示的内容条数。不进主列表，但要给同学一个能进来补举报的口子 ——
    // 没有这个口子，第 4、5 票就收不到，「5 人举报自动删除」永远触发不了
    hiddenCount: 0,
  },

  onLoad() {
    const boardNames = store.getBoards().map((b) => b.name);
    this.setData({
      boards: ['全部'].concat(boardNames),
      searchHistory: store.getSearchHistory(),
      hotKeywords: store.getHotKeywords()
    });
    this.checkNetwork();
    this.load();
  },

  // 断网时列表照常显示缓存，但要说明一句「这可能是旧的」，
  // 否则用户会以为内容就这么少了
  checkNetwork() {
    wx.onNetworkStatusChange((res) => {
      this.setData({ offline: !res.isConnected });
    });
    try {
      wx.getNetworkType({
        success: (res) => this.setData({ offline: res.networkType === 'none' })
      });
    } catch (e) {}
  },

  onShow() {
    this.load();
  },


  load() {
    // 搜索态下 load 必须走搜索，否则触底加载会把「搜出来的结果」换成不带关键词的完整列表
    if (this.data.keyword && this.data.keyword.trim()) {
      this.runSearch(this.data.keyword);
      return;
    }
    const posts = store.getPosts({
      board: this.data.board,
      sort: this.data.sort,
      courseId: this.data.courseId
    });

    // 「课程评价」板块：按课程把帖子汇总，方便一门一门看
    let isCourseBoard = false;
    let courseFilter = [];
    if (this.data.board === COURSE_BOARD) {
      isCourseBoard = true;
      const all = store.getPosts({ board: COURSE_BOARD, sort: 'latest', courseId: '' });
      const map = {};
      all.forEach((p) => {
        if (!p.courseId) return;
        if (!map[p.courseId]) {
          map[p.courseId] = {
            courseId: p.courseId,
            courseName: p.courseName || '未命名课程',
            count: 0
          };
        }
        map[p.courseId].count += 1;
      });
      courseFilter = Object.keys(map).map((k) => map[k]);
    }

    // 带上「我举报过没有」：已举报的按钮要变灰，不然用户以为没点上会一直戳
    const marked = posts.map((p) => Object.assign({}, p, { reported: store.hasReported(p.id) }));

    const total = posts.length;
    const rendered = Math.min(total, this.data.rendered || PAGE_SIZE);
    const next = {
      rendered,
      total,
      noMore: rendered >= total,
      isCourseBoard,
      courseFilter,
      courseId: this.data.courseId,
      hiddenCount: store.getHiddenPosts().length
    };
    // 列表内容没变就别重刷整个列表：每次从详情页/发帖页退回来都会走这里，
    // 全量 setData 在低端机上就是「卡顿」的来源
    const old = this.data.posts || [];
    const same = old.length === rendered && old.every((p, i) => p.id === marked[i].id);
    if (!same) next.posts = marked.slice(0, rendered);
    next.loading = false;
    this.setData(next);
  },

  /* ---------------- 搜索 ---------------- */

  // 输入防抖：每敲一个字都去全表扫一遍没必要，停手 200ms 再算
  onSearchInput(e) {
    const kw = e.detail.value;
    this.setData({ keyword: kw });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.runSearch(kw), 200);
  },

  // 回车 / 点「搜索」：记进历史，并立刻出结果
  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    const kw = String(this.data.keyword || '').trim();
    this.setData({
      searchHistory: kw ? store.pushSearchHistory(kw) : store.getSearchHistory()
    });
    this.runSearch(this.data.keyword);
  },

  onClearSearch() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.setData({ keyword: '', searching: false, resultCount: 0, sharePost: null });
    this.load();
  },

  // 精准 / 模糊：和课程页同一套内核，同学打错字也搜得到帖子
  onSearchMode(e) {
    const m = e.currentTarget.dataset.m;
    if (m === this.data.searchMode) return;
    this.setData({ searchMode: m });
    if (String(this.data.keyword || '').trim()) this.runSearch(this.data.keyword);
    wx.showToast({
      title: m === 'exact' ? '只找完全一致的' : '打错字也能找到',
      icon: 'none',
      duration: 1500
    });
  },

  onTapHistory(e) {
    const kw = e.currentTarget.dataset.k || '';
    this.setData({ keyword: kw });
    this.onSearchConfirm();
  },

  onClearHistory() {
    this.setData({ searchHistory: store.clearSearchHistory() });
  },

  async runSearch(keyword) {
    const kw = String(keyword || '').trim();
    if (!kw) {
      this.setData({ searching: false, searched: false, resultCount: 0 });
      this.load();
      return;
    }
    this.setData({ searching: true });

    const exact = this.data.searchMode === 'exact';
    let list = store.searchPosts(kw, exact);

    // 本地缓存只是最近几页（分页拉取），结果太少时再向云端多要三页，
    // 否则会出现「库里明明有这条，搜出来是空的」
    if (list.length < 5 && this._deepFor !== kw + '|' + (exact ? 'e' : 'f')) {
      this._deepFor = kw + '|' + (exact ? 'e' : 'f');
      await store.fetchPostsFromCloud(3);
      list = store.searchPosts(kw, exact);
    }

    const rendered = Math.min(list.length, PAGE_SIZE);
    this.setData({
      posts: list.slice(0, rendered),
      total: list.length,
      rendered,
      noMore: rendered >= list.length,
      resultCount: list.length,
      isCourseBoard: false,
      courseFilter: [],
      // 结果出来了就退出「搜索态」，否则板块栏 / 排序栏 / 树洞入口全被 wx:if 藏掉，
      // 搜完一次就只能盯着结果，切不了板块也换不了排序
      searching: false,
      // 但「空态文案」还得分得清：搜不到 ≠ 这个板块本来就没帖子
      searched: true
    });
  },

  /* ---------------- 分享 ---------------- */

  // 点卡片上的「分享」：先把这条帖记下来，转发时转发它而不是整个论坛
  // 用 _shareTarget 而不是 data：setData 是异步的，转发面板读 data 可能还没刷上去
  onSharePost(e) {
    const id = e.currentTarget.dataset.id;
    const p = (this.data.posts || []).find((x) => x.id === id);
    const target = p ? { id: p.id, title: p.title, image: (p.images && p.images[0]) || '' } : null;
    this._shareTarget = target;
    this.setData({ sharePost: target });
  },

  // 右上角系统菜单「转发给朋友」：有选中帖子就转发那条，否则转发整个论坛
  onShareAppMessage() {
    const p = this._shareTarget || this.data.sharePost;
    if (p && p.id) {
      return {
        title: (p.title || '一条来自论坛的帖子') + ' · 商砖小站',
        path: '/pages/forum/detail/detail?id=' + p.id,
        imageUrl: p.image || ''
      };
    }
    return {
      title: '商砖小站 · 找同伴、发吐槽、查课程评价',
      path: '/pages/forum/list/list'
    };
  },

  // 分享到朋友圈：简单模式，点开对方进入的就是这条帖子
  onShareTimeline() {
    const p = this._shareTarget || this.data.sharePost;
    return {
      title: (p && p.title ? p.title : '商砖小站 · 校园生活都在这儿'),
      query: p && p.id ? 'id=' + p.id : '',
      imageUrl: (p && p.image) || ''
    };
  },

  onBoard(e) {
    // 换板块时清掉课程筛选，避免残留上一次的选中项
    this.setData({ board: e.currentTarget.dataset.b, courseId: '', rendered: 0 });
    this.load();
  },

  // 「最新 / 热门 / 最多赞 …」切换：直接指定要哪个，不再来回翻转
  onSortPick(e) {
    const sort = String(e.currentTarget.dataset.s || '');
    if (!sort || sort === this.data.sort) return;
    this.setData({ sort, rendered: 0 });
    this.load();
    // 切排序要给用户一点反馈，不然在长列表里根本看不出到底切没切
    const hit = (this.data.sortOptions || []).filter((o) => o.k === sort)[0];
    if (hit) {
      wx.showToast({ title: '按' + hit.label + '排序', icon: 'none', duration: 1200 });
    }
  },

  // 列表上直接点赞 / 点踩，不进详情页。
  // 这里只记本地那一下（点完马上变色），云端值回来会被覆盖成权威值
  onPostVote(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const kind = e.currentTarget.dataset.v === 'dislike' ? 'dislike' : 'like';
    if (!id) return;
    store.toggleVote(id, kind);
    this.load();
  },

  // 进匿名树洞：独立页面，强制匿名
  goHole() {
    wx.navigateTo({ url: '/pages/forum/hole/hole' });
  },

  // 校园盲盒 / 漂流瓶：tabBar 满了，入口放论坛页树洞下面（都是匿名说心里话的场景）
  goBlindbox() {
    wx.navigateTo({ url: '/pages/campus/blindbox/blindbox' });
  },

  // 被举报暂停展示的内容：单独一页，能看也能继续举报
  goHidden() {
    wx.navigateTo({ url: '/pages/forum/hidden/hidden' });
  },

  onCourseFilter(e) {
    this.setData({ courseId: e.currentTarget.dataset.c || '', rendered: 0 });
    this.load();
  },

  // 下拉刷新：重新拉云端数据后再渲染
  async onPullDownRefresh() {
    if (this.data.refreshing) return;
    this.setData({ refreshing: true });
    await store.loadMorePosts(true);
    this.setData({ rendered: 0, noMore: false });
    this.load();
    wx.stopPullDownRefresh();
    this.setData({ refreshing: false });
  },

  // 触底加载：先吃本地剩下的，不够了才向云端要
  async onReachBottom() {
    const total = this.data.total || 0;
    if (this.data.noMore) return;
    if (this.data.rendered < total) {
      this.setData({ rendered: Math.min(total, this.data.rendered + PAGE_SIZE) });
      this.load();
      return;
    }
    const more = await store.loadMorePosts();
    if (more) {
      // 拉到了新一页，从第一页重新渲染，露出最新的内容
      this.setData({ rendered: 0, noMore: false });
    } else {
      // 云端真没了，别再让用户一直往下拖
      this.setData({ noMore: true });
    }
    this.load();
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/forum/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  // 从帖子跳到该课程详情页（看看这门课的评分与评价）
  goCourse(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/course/detail/detail?id=' + id });
  },

  goPost() {
    wx.navigateTo({ url: '/pages/forum/post/post' });
  },

  // 列表上直接举报，不用先点进详情。
  // 和详情页那份走的是同一个云函数、同一套判定和自动处置规则
  onReportPost(e) {
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
            // 已经落到服务端了，本地记一笔，按钮立刻变成「已举报」
            store.markReported(id);
            // 云端当场判定处置动作，本地镜像跟着改
            if (r && r.action === 'hide') store.setPostStatus(id, 'hidden');
            else if (r && r.action === 'delete') store.setPostStatus(id, 'deleted');
            this.load();
            wx.showToast({ title: (r && r.msg) || '已提交', icon: 'none', duration: 2500 });
          }
        });
      },
      fail: () => {}
    });
  },

  previewImages(e) {
    const list = e.currentTarget.dataset.imgs || [];
    if (!list.length) return;
    wx.previewImage({ current: list[0], urls: list });
  }
});
