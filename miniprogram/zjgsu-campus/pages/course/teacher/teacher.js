// pages/course/teacher/teacher —— 某位老师的评价页
//
// 老师评价没有独立入口（tabBar 满了），从课程详情页的「老师评价」进。
// 这里看的是这位老师在这门课上的口碑；同学写评价时补了任课老师，
// 别门课里出现的同名评价也会一并列出来，方便判断「是不是同一个人」。
const store = require('../../../utils/store.js');
const userApi = require('../../../utils/user.js');

Page({
  data: {
    name: '',
    // 自定义导航条（app-header）的标题，同一份名字不再调一次 setNavigationBarTitle
    navTitle: '老师评价',
    courseId: '',
    courseName: '',
    reviews: [],
    otherReviews: [],
    avg: 0,
    avgRound: 0,
    courseAvg: 0,
    scoredCount: 0,
    scoreCount: 0,
    count: 0,
    otherCount: 0,
    verified: false,
    college: '',
    loading: true
  },

  onLoad(query) {
    this.setData({
      name: decodeURIComponent((query && query.name) || ''),
      courseId: (query && query.courseId) || ''
    });
    this.load();
  },

  onShow() {
    if (this.data.name) this.load();
  },

  async load() {
    const name = this.data.name;
    if (!name) {
      this.setData({ loading: false });
      return;
    }
    const here = store.getReviewsByTeacher(name, this.data.courseId);
    const all = store.getReviewsByTeacher(name, '');
    const other = all.filter((r) => r.courseId !== this.data.courseId);

    // 老师分和课程分分开算：课好老师差的情况很常见，混在一起这位老师就永远看不出问题。
    // 只统计 teacherScore>0 的那些（老评价没有这个字段，一律按没打分处理）。
    const scored = all.filter((r) => (Number(r.teacherScore) || 0) > 0);
    const avg = this.avgOf(scored.map((r) => Number(r.teacherScore) || 0));
    const courseAvg = this.avgOf(all.map((r) => Number(r.score) || 0));

    // 名录里查一下这位：官方名录抓下来的才打勾，同学自己加的不算
    let verified = false;
    let college = '';
    try {
      const list = await userApi.teacherList(name, '');
      const hit = list.filter((t) => t.name === name)[0];
      if (hit) { verified = true; college = hit.college || ''; }
    } catch (e) {}

    this.setData({
      navTitle: name || '老师评价',
      reviews: here.map((r) => this.decorateReview(r)),
      otherReviews: other.slice(0, 10).map((r) => this.decorateReview(r)),
      courseName: here.length && here[0].courseName ? here[0].courseName : '',
      avg: avg,
      avgRound: Math.round(avg),
      courseAvg: courseAvg,
      scoredCount: scored.length,
      scoreCount: all.length,
      count: here.length,
      otherCount: other.length,
      verified: verified,
      college: college,
      loading: false
    });
    wx.setNavigationBarTitle({ title: name });
  },

  // WXML 里不能四舍五入，展示用的数值在这里一次算好
  avgOf(list) {
    if (!list.length) return 0;
    return Math.round((list.reduce((s, v) => s + v, 0) / list.length) * 10) / 10;
  },

  // 一条评价里两档分并存：老师分和课程分，没打老师分的只显示课程分
  decorateReview(r) {
    const t = Number(r.teacherScore) || 0;
    return Object.assign({}, r, {
      hasTeacherScore: t > 0,
      teacherStarOn: t,
      starOn: Number(r.score) || 0,
      scoreText: t > 0 ? t.toFixed(1) : '',
      courseText: (Number(r.score) || 0).toFixed(1)
    });
  },

  goCourse(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/course/detail/detail?id=' + id });
  },

  goReview() {
    if (!this.data.courseId || !this.data.courseName) {
      wx.showToast({ title: '这门课没有对应的课程', icon: 'none' });
      return;
    }
    // 老师名带过去：同学点的是「写对这位老师的评价」，
    // 到了页面还要他重新打一遍名字，等于把人挡在门外
    wx.navigateTo({
      url: '/pages/course/review/review?id=' + this.data.courseId
        + '&teacher=' + encodeURIComponent(this.data.name)
    });
  },

  onShareAppMessage() {
    const n = this.data.name || '老师';
    return {
      title: '商砖小站 · ' + n + ' 的课程评价',
      path: '/pages/course/detail/detail?id=' + this.data.courseId
    };
  }
});
