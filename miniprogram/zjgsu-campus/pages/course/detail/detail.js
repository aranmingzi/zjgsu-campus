// pages/course/detail/detail.js
// 这一页对查课的同学来说是「决策页」，不是「评论区」：
// 顶部先给结论（综合分 / 评分分布 / 大家都在说 / 一句话判断），下面才是原始评价。
const store = require('../../../utils/store.js');
const userApi = require('../../../utils/user.js');

// 两个分段：「课程整体」和「按老师」。
// 同一门课可能有好几位老师授，同学想骂的往往不是"这门课"，而是"某位老师"，
// 混在一起看会淹没掉具体某人的问题，所以这里拆成两栏。
const TABS = [
  { key: 'course', label: '课程评价' },
  { key: 'teacher', label: '老师评价' }
];

function tabMap(cur) {
  const m = {};
  TABS.forEach((t) => { m[t.key] = t.key === cur; });
  return m;
}

Page({
  data: {
    id: '',
    // 自定义导航条（app-header）要显示课名，WXML 里拿不到 course，
    // 这里单独存一份给标题用；原有业务字段一个没动
    navTitle: '课程详情',
    course: null,
    reviews: [],
    expanded: false,
    // 收藏与大纲折叠都靠数据表达：WXML 里写不了函数，只能用 true/false
    favorited: false,
    outlineOpen: false,
    tabs: TABS,
    tab: 'course',
    tabMap: tabMap('course'),
    teacherGroups: [],
    teacherCount: 0,
    // 申请删除：加课人自己删是「一键删」，别人删要凑票，两套文案不一样
    isMineCourse: false,
    reqVotes: 0,
    reqNeed: 3,
    reqMine: false,
    // 这门课在本机课程库里找不到（数据没同步全 / 已被别人删掉）：
    // 得给一个能走的出口，不能白屏
    notFound: false
  },

  onLoad(options) {
    this.setData({ id: options.id });
    this.load();
  },

  onShow() {
    this.load();
  },

  load() {
    const course = store.getCourseInsight(this.data.id);
    // 找不到课程不能直接 return：整页 wx:if="{{course}}" 会变成一片空白，
    // 同学看到的就是「点进来啥都没有、也没法操作」，比报错还难办
    if (!course) {
      this.setData({ course: null, notFound: true, navTitle: '课程详情' });
      return;
    }
    // 一行：把课名交给自定义导航条（原来这行逻辑是给原生导航条 setNavigationBarTitle）
    this.setData({ notFound: false, navTitle: course.name || '课程详情' });
    // 「按老师」这一栏是聚合视图，永远显示全部（不受"只显示前 3 条"影响），
    // 不然同学点进老师评价，看到的是被截断的半成品
    const reviews = store.getReviews(this.data.id).map((r) =>
      Object.assign({}, r, { starOn: r.score })
    );
    const teacherGroups = store.getCourseTeachers(this.data.id);
    this.setData({
      course,
      reviews,
      // WXML 里不能四舍五入，展示用的整数星在这里算好
      teacherGroups: teacherGroups.map((t) => Object.assign({}, t, { avgRound: Math.round(t.avg || 0) })),
      teacherCount: teacherGroups.length,
      favorited: store.isFavorited('course', this.data.id),
      isMineCourse: store.isMineCourse(course)
    });
    wx.setNavigationBarTitle({ title: course.name });
    // 别人加的课才需要问「有没有人在申请删」；自己加的课直接就能删
    if (course.builtin === false && !store.isMineCourse(course)) this.loadReqInfo();
  },

  // 纠正课程类型：五种里挑一个，本机立即生效，云端存一份给全校共享。
  // 用 ActionSheet 而不是跳页 —— 改个标签不值得一次导航
  onEditType() {
    const c = this.data.course;
    if (!c || !c.id) return;
    const types = ['专业必修', '专业选修', '通识课', '体育课', '思政课'];
    wx.showActionSheet({
      itemList: types.map((t) => (t === c.ctype ? '· ' + t + '（当前）' : t)),
      success: (r) => {
        const t = types[r.tapIndex];
        if (!t || t === c.ctype) return;
        wx.showLoading({ title: '保存中', mask: true });
        store.setCourseType(c.id, t).then((res) => {
          wx.hideLoading();
          if (res && res.ok === false) {
            wx.showToast({ title: (res && res.msg) || '没存住，稍后再试', icon: 'none', duration: 2400 });
          } else {
            wx.showToast({ title: '已改为「' + t + '」', icon: 'success' });
          }
          this.load();
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '网络不太稳，再试一次', icon: 'none' });
        });
      }
    });
  },

  // 这门课上现在有几票：显示在按钮上，同学才知道自己这一票算不算数
  async loadReqInfo() {
    const r = await userApi.courseReqInfo(this.data.id, this.data.course && this.data.course.name);
    if (!r || r.ok === false) return;
    this.setData({
      reqVotes: Number(r.votes) || 0,
      reqNeed: Number(r.need) || 3,
      reqMine: !!r.mine
    });
  },

  // 申请删除别人误加的课：一人一票，凑够票数云端自动删，由前端清掉本地那份
  async onRequestRemove() {
    const c = this.data.course;
    if (!c) return;
    if (this.data.reqMine) {
      wx.showToast({ title: '你已经投过票了', icon: 'none' });
      return;
    }
    const n = Number(c.reviewCount) || 0;
    const d = await new Promise((resolve) => {
      wx.showModal({
        title: '申请删除这门课？',
        content: '「' + c.name + '」是别的同学加的。'
          + (n ? '课下已有 ' + n + ' 条评价，' : '')
          + '凑够 ' + this.data.reqNeed + ' 个人申请（或审核员出手）就会删掉。确定申请吗？',
        confirmText: '申请删除',
        confirmColor: '#d9534f',
        success: (r) => resolve(r)
      });
    });
    if (!d || !d.confirm) return;

    wx.showLoading({ title: '提交中', mask: true });
    const r = await userApi.courseReqVote(this.data.id, '', c.name);
    wx.hideLoading();
    if (!r || r.ok === false) {
      wx.showToast({ title: (r && r.msg) || '申请失败，稍后再试', icon: 'none', duration: 2400 });
      return;
    }
    if (r.removed) {
      // 够票了：云端已经删掉，本地那份也得清，否则这门课在列表里阴魂不散
      store.dropCourseLocal(this.data.id);
      wx.showToast({ title: '已删除这门课', icon: 'success' });
      setTimeout(() => { wx.navigateBack(); }, 700);
      return;
    }
    this.setData({ reqVotes: Number(r.votes) || 0, reqMine: true });
    wx.showToast({
      title: '已申请，还差 ' + Math.max(0, (Number(r.need) || 3) - (Number(r.votes) || 0)) + ' 人同意',
      icon: 'none',
      duration: 2400
    });
  },

  onTab(e) {
    const k = e.currentTarget.dataset.k;
    if (k === this.data.tab) return;
    this.setData({ tab: k, tabMap: tabMap(k), expanded: false });
  },

  goTeacher(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    wx.navigateTo({ url: '/pages/course/teacher/teacher?name=' + encodeURIComponent(name) + '&courseId=' + this.data.id });
  },

  // 课程收藏：之后回「我的 → 收藏」能直接跳回来
  onFavorite() {
    const r = store.toggleFavorite({ type: 'course', id: this.data.id, title: courseName(this.data.course) });
    if (!r.ok) return;
    this.setData({ favorited: !!r.favorited });
    wx.showToast({ title: r.favorited ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  // 删除误加的自建课程。点一下立刻出确认框 —— 之前这类按钮点了没反馈，
  // 用户会以为没点中，反复戳。
  onRemoveCourse() {
    const c = this.data.course;
    if (!c) return;
    if (c.builtin !== false) {
      wx.showToast({ title: '官方课程不能删', icon: 'none' });
      return;
    }
    if (!store.isMineCourse(c)) {
      wx.showToast({ title: '只能删自己添加的课', icon: 'none' });
      return;
    }
    const n = Number(c.reviewCount) || 0;
    wx.showModal({
      title: '删除这门课',
      content: n
        ? '「' + c.name + '」下已经有 ' + n + ' 条评价。删课后这些评价会一起消失，确定吗？'
        : '「' + c.name + '」会从课程库里移除，确定吗？',
      confirmText: '删除',
      confirmColor: '#d9534f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        let r;
        try {
          r = await store.removeCourse(this.data.id, { force: true });
        } catch (e) {
          r = { ok: false, msg: '网络不太稳，稍后再试' };
        } finally {
          wx.hideLoading();
        }
        if (!r || r.ok === false) {
          wx.showToast({ title: (r && r.msg) || '没能删掉', icon: 'none', duration: 2500 });
          return;
        }
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => { wx.navigateBack(); }, 600);
      }
    });
  },

  toggleOutline() {
    this.setData({ outlineOpen: !this.data.outlineOpen });
  },

  // 数据没同步全时的自救：重新同步一次，多半就好了
  async onRetryLoad() {
    wx.showLoading({ title: '重新同步中', mask: true });
    try {
      await store.syncNow();
    } catch (e) {}
    wx.hideLoading();
    this.load();
    if (this.data.course) {
      wx.showToast({ title: '回来了', icon: 'success' });
    } else {
      wx.showToast({ title: '还是没找到，可能已被删除', icon: 'none', duration: 2400 });
    }
  },

  // 本机这条数据确实坏了（比如老数据缺 id）：清掉它，别让同学每次点进来都白屏
  onDropBroken() {
    wx.showModal({
      title: '清掉这条数据？',
      content: '这条课程数据在本机是坏的（多半是早期同步留下的）。清掉后它会从你的列表里消失，不影响其他同学。',
      confirmText: '清掉',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.dropCourseLocal(this.data.id);
        wx.showToast({ title: '已清理', icon: 'success' });
        setTimeout(() => { wx.navigateBack(); }, 600);
      }
    });
  },

  goReview() {
    wx.navigateTo({ url: '/pages/course/review/review?id=' + this.data.id });
  },

  // 自己那条评价：改内容 / 换标签 / 重新决定要不要匿名
  goEdit(e) {
    wx.navigateTo({ url: '/pages/course/review/review?id=' + this.data.id + '&reviewId=' + e.currentTarget.dataset.id });
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条评价',
      content: '删掉之后其他人就看不到了，确定吗？',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.removeReview(id);
        this.load();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  // 评价多的时候先折叠，避免信息噪音
  toggleExpand() {
    this.setData({ expanded: !this.data.expanded });
  },

  // 点标签直接看提到这个标签的所有评价
  onTag(e) {
    const t = e.currentTarget.dataset.t;
    const list = this.data.reviews.filter((r) => (r.tags || []).indexOf(t) >= 0);
    wx.showModal({
      title: '提到「' + t + '」的评价',
      content: list.length ? list[0].content : '暂时没有',
      showCancel: false
    });
  }
});

function courseName(c) {
  return (c && c.name) || '';
}
