// pages/course/review/review.js
// 一条评价可能来自「写新评价」，也可能来自「改我以前写的那条」。
// 两种模式共用同一个页面：带 reviewId 进入即编辑模式，加载原内容并允许改匿名设置。
const store = require('../../../utils/store.js');
const moderation = require('../../../utils/moderation.js');
const userApi = require('../../../utils/user.js');
// 全站同一套精准 / 模糊搜索
const searchCore = require('../../../utils/search.js');

Page({
  data: {
    id: '',
    course: null,
    score: 5,
    content: '',
    anonymous: true, // 评课场景下默认匿名：这是让人敢开口的前提
    tags: [],
    tagsMap: {},
    presetTags: [],
    universalTags: [],
    editingId: '',
    isEdit: false,
    submitting: false,
    myNick: '',
    // 这次是恢复哪条草稿来的：发成功之后要把它从草稿箱撤掉
    draftId: '',
    courseName: '',
    // 任课老师：填了这条评价才会出现在「老师评价」里
    teacher: '',
    teacherOptions: [],
    teacherVerified: false,
    // 给老师的分，和上面给课程的分是两档；0 表示这次没单独给老师打分
    teacherScore: 0,
    // 当前在给哪个打分：'course' | 'teacher'。两档分共用一块星条，
    // 靠这个开关切换，同学一眼就知道自己现在点的是哪个分
    scale: 'course'
  },

  onLoad(options) {
    const course = store.getCourseById(options.id);
    const preset = course ? (Array.isArray(course.tags) ? course.tags : []) : [];
    // 课程自带的标签 + 通用标签：前者是这门课的分身标签，后者是跨课可比的维度
    const base = ['给分好', '作业多', '考试难', '干货多', '要背的', '小组作业', '点名勤', '老师很棒', '别翘课', '实用']
      .filter((t) => preset.indexOf(t) < 0);

    this.setData({
      id: options.id,
      course,
      courseName: course ? course.name : '',
      // 老师名三个来源：URL 里带过来的 > 课程自带的任课老师 > 空。
      // 从「写对某位老师的评价」进来时，名字已经填好，下面直接就是老师打分条
      teacher: options.teacher ? decodeURIComponent(options.teacher) : ((course && course.teacher) || ''),
      presetTags: preset,
      universalTags: base,
      editingId: options.reviewId || '',
      myNick: userApi.getMyProfile().nickName || '浙小商'
    });

    if (options.reviewId) {
      this.loadEditing(options.reviewId);
    } else if (options.draftId) {
      // 从草稿箱进来：把没写完的那篇填回表单，并记住是哪一条，发成功好撤掉
      const d = store.getDraft(options.draftId);
      if (d) {
        this.setData({ draftId: options.draftId });
        const tags = Array.isArray(d.tags) ? d.tags : [];
        const tagsMap = {};
        tags.forEach((t) => { tagsMap[t] = true; });
        this.setData({
          score: Number(d.score) || 5,
          content: d.content || '',
          tags: tags,
          tagsMap: tagsMap,
          // 课程 id 一起恢复，否则这条评价会挂到错误的课程下
          courseId: d.courseId || this.data.id
        });
      }
    } else if (this.data.teacher) {
      // 预填的老师名去名录核一次：命中就打上「✓ 官方名录」的勾
      userApi.teacherList(this.data.teacher, '')
        .then((list) => {
          if (list.some((t) => t.name === this.data.teacher)) {
            this.setData({ teacherVerified: true });
          }
        })
        .catch(() => {});
    } else {
      // 自动接上同一门课没写完的评价：只认同课程的那篇，
      // 别的课的草稿不掺和，免得把 A 课的评价内容填到 B 课头上
      const last = store.getDrafts().find((x) => x.type === 'review' && x.courseId === options.id);
      if (last) {
        const tags = Array.isArray(last.tags) ? last.tags : [];
        const tagsMap = {};
        tags.forEach((t) => { tagsMap[t] = true; });
        this.setData({
          draftId: last.id,
          score: Number(last.score) || 5,
          content: last.content || '',
          tags: tags,
          tagsMap: tagsMap,
          teacher: last.teacher || ''
        });
        wx.showToast({ title: '已接上上次没写完的', icon: 'none', duration: 2000 });
      }
    }
    wx.setNavigationBarTitle({ title: options.reviewId ? '修改评价' : '评价《' + (course ? course.name : '') + '》' });
  },

  // 评分页也留草稿退路：写到一半被消息打断，回来还在
  onSaveDraft() {
    const d = this.data;
    if (!store.hasDraftText({ title: '', content: d.content })) {
      wx.showToast({ title: '还没写内容', icon: 'none' });
      return;
    }
    store.saveDraft({
      type: 'review',
      courseId: this.data.id,
      courseName: this.data.courseName || '',
      content: d.content,
      tags: d.tags,
      score: d.score,
      teacher: this.data.teacher || '',
      teacherScore: this.data.teacher ? (this.data.teacherScore || 0) : 0
    });
    wx.showToast({ title: '草稿已存，在「我的 → 草稿箱」', icon: 'none', duration: 2500 });
  },

  // 页面离开时自动存草稿（写一半退出去，回来接着写）：
  // 编辑模式下改的是已发布的评价，不归草稿管，跳过
  autoSaveDraft() {
    if (this._published || this.data.isEdit) return;
    const d = this.data;
    if (!store.hasDraftText({ title: '', content: d.content })) {
      if (d.draftId) store.removeDraft(d.draftId);
      return;
    }
    const saved = store.saveDraft({
      type: 'review',
      courseId: d.id,
      courseName: d.courseName || '',
      content: d.content,
      tags: d.tags,
      score: d.score,
      anonymous: d.anonymous,
      teacher: d.teacher || '',
      teacherScore: d.teacher ? (d.teacherScore || 0) : 0
    });
    if (saved && saved.id && saved.id !== d.draftId) this.setData({ draftId: saved.id });
  },

  onHide() { this.autoSaveDraft(); },
  onUnload() { this.autoSaveDraft(); },

  // 同发帖页：遮罩卡住会自动收掉，避免按钮点不动却看不出原因
  onShow() {
    if (this.data.submitting) {
      this.setData({ submitting: false });
      wx.hideLoading();
      wx.showToast({ title: '上一条没发完，已复位，可以再试', icon: 'none' });
    }
  },

  // 编辑模式：把原来那条填进表单，同时带上原来的匿名设置
  loadEditing(reviewId) {
    const mine = store.getMyReviews();
    const old = mine.find((r) => r.id === reviewId);
    if (!old) {
      wx.showToast({ title: '找不到这条评价', icon: 'none' });
      return;
    }
    this.setData({
      isEdit: true,
      score: Number(old.score) || 5,
      content: old.content || '',
      anonymous: !!old.anonymous,
      tags: old.tags || [],
      teacher: old.teacher || '',
      teacherVerified: !!old.teacherVerified,
      // 编辑老评价时，老师分只在还留着老师的前提下恢复
      teacherScore: old.teacher ? (Number(old.teacherScore) || 0) : 0,
      tagsMap: (() => { const m = {}; (old.tags || []).forEach((x) => { m[x] = true; }); return m; })()
    });
  },

  /* ---------------- 任课老师 ---------------- */

  // 官方名录要想办法用上：同学打字时给一串真实存在的老师名，
  // 比让他自己瞎填靠谱得多，填完还会在课程页显示「✓ 官方名录」。
  onTeacherInput(e) {
    const kw = String(e.detail.value || '').trim();
    // 老师名被清空时，刚才那个老师的分也要跟着作废，
    // 否则会出现「没填老师却带了一个老师分」的脏评价
    this.setData({
      teacher: kw,
      teacherVerified: false,
      teacherScore: kw ? this.data.teacherScore : 0
    });
    if (this._tTimer) clearTimeout(this._tTimer);
    if (kw.length < 1) {
      this.setData({ teacherOptions: [] });
      return;
    }
    this._tTimer = setTimeout(() => this.matchTeacher(kw), 250);
  },

  async matchTeacher(kw) {
    let list = await userApi.teacherList(kw, '');
    // 名录是按学院抓下来的，同学搜「王」常常只搜到自己学院那批，
    // 再拿本地评价里出现过的老师名补一层，避免补全列表空空如也
    const extra = store.getCourseTeachers(this.data.id).map((t) => ({ name: t.name, college: '' }));
    const seen = {};
    // 同一套精准 / 模糊：老师名打错一个字，也该在补全里找得到人，
    // 找不到就只能自己瞎填一个，后面「✓ 官方名录」的VERIFIED标记也就没了
    const merged = list.concat(extra).filter((t) => {
      if (seen[t.name]) return false;
      seen[t.name] = true;
      return searchCore.matchFields([t.name, t.college], kw) >= 0;
    });
    this.setData({
      teacherOptions: merged.slice(0, 10),
      teacherVerified: !!list.filter((t) => t.name === this.data.teacher.trim())[0]
    });
  },

  pickTeacher(e) {
    const name = e.currentTarget.dataset.name;
    const inList = this.data.teacherOptions.some((t) => t.name === name);
    // 换人了就把老师分归零：上一个人的分不能跟着算到新老师头上
    this.setData({ teacher: name, teacherOptions: [], teacherVerified: inList, teacherScore: 0 });
  },

  // 名录里没有的同学可以自己加一条，加完别人也能选到
  async onAddTeacher() {
    const name = String(this.data.teacher || '').trim();
    if (!name) {
      wx.showToast({ title: '先填个老师名', icon: 'none' });
      return;
    }
    if (!/^[一-龥·]{2,6}$/.test(name)) {
      wx.showToast({ title: '填个中文名，2-6 个字', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '查一下名录', mask: true });
    const r = await userApi.teacherAdd(name, this.data.course ? (this.data.course.college || '') : '');
    wx.hideLoading();
    if (!r || r.ok === false) {
      wx.showToast({ title: (r && r.msg) || '添加失败', icon: 'none' });
      return;
    }
    this.setData({ teacherVerified: true });
    wx.showToast({ title: '已加入名录', icon: 'success' });
  },

  selectScore(e) {
    this.setData({ score: Number(e.currentTarget.dataset.s) });
  },

  // 老师打分：只有填了老师名才会显示这一条
  selectTeacherScore(e) {
    this.setData({ teacherScore: Number(e.currentTarget.dataset.s) });
  },

  // 两档分之间切换。点一下已经选中的那个不做事，免得反复 setData 触发重渲染
  onScale(e) {
    const s = e.currentTarget.dataset.s || 'course';
    if (s === this.data.scale) return;
    if (s === 'teacher' && !this.data.teacher) {
      this.onNeedTeacher();
      return;
    }
    this.setData({ scale: s });
  },

  // 还没填老师就想给老师打分：别只弹个错误，直接把老师输入那块提上来提示一下
  onNeedTeacher() {
    wx.showToast({ title: '先在第 3 步填上老师名，才能给老师打分', icon: 'none', duration: 2400 });
    wx.pageScrollTo({ selector: '.tch-pick', duration: 260 });
  },

  toggleTag(e) {
    const t = e.currentTarget.dataset.t;
    let tags = this.data.tags.slice();
    const i = tags.indexOf(t);
    if (i >= 0) tags.splice(i, 1);
    else tags.push(t);
    // wxml 里不能用 tags.indexOf()（不支持函数调用，会导致整页渲染失败），走 map
    const map = {};
    tags.forEach((x) => { map[x] = true; });
    this.setData({ tags: tags, tagsMap: map });
  },

  onContent(e) {
    this.setData({ content: e.detail.value });
  },

  toggleAnonymous() {
    this.setData({ anonymous: !this.data.anonymous });
  },

  removeTag(e) {
    const t = e.currentTarget.dataset.t;
    const tags = this.data.tags.filter((x) => x !== t);
    const map = {};
    tags.forEach((x) => { map[x] = true; });
    this.setData({ tags: tags, tagsMap: map });
  },

  async submit() {
    // 同发帖页：上一次卡住时按钮会静默失灵，必须给个说法
    if (this.data.submitting) {
      wx.showToast({ title: '还在发上一条，稍等一下', icon: 'none' });
      return;
    }
    const content = String(this.data.content || '').trim();
    if (content.length < 5) {
      wx.showToast({ title: '至少写 5 个字', icon: 'none' });
      return;
    }
    if (!moderation.guardText(content, '评价')) return;

    // 服务端再校验一次：本地词表只是提示，拦截权在云函数
    const safe = await userApi.checkText({ content: content });
    if (safe && safe.ok === false) {
      wx.showToast({ title: safe.msg || '内容不合适', icon: 'none' });
      return;
    }

    // 置灰期间任何异常都要复位，否则提交按钮永久点不动
    this.setData({ submitting: true });
    const draftId = this.data.draftId || '';
    try {
      if (this.data.isEdit) {
        store.updateReview(this.data.editingId, {
          score: this.data.score,
          content: content,
          tags: this.data.tags,
          anonymous: this.data.anonymous,
          teacher: String(this.data.teacher || '').trim(),
          teacherVerified: !!this.data.teacherVerified,
          teacherScore: String(this.data.teacher || '').trim()
            ? (Number(this.data.teacherScore) || 0) : 0
        });
        wx.showToast({ title: '已更新', icon: 'success' });
        this._published = true;
      } else {
        const r = await store.addReview({
          courseId: this.data.id,
          score: this.data.score,
          content: content,
          tags: this.data.tags,
          anonymous: this.data.anonymous,
          teacher: String(this.data.teacher || '').trim(),
          teacherVerified: !!this.data.teacherVerified,
          teacherScore: String(this.data.teacher || '').trim()
            ? (Number(this.data.teacherScore) || 0) : 0
        });
        if (!r || r.ok === false) {
          // 云端存不住时内容还在本机，说清楚真相，别让人以为丢了又重写一遍
          wx.showToast({ title: (r && r.msg) || '评价没能发出去', icon: 'none', duration: 3000 });
          return;
        }
        wx.showToast({ title: this.data.anonymous ? '已匿名发布' : '评价成功', icon: 'success' });
        // 发掉了：别让 onUnload 再自动存一遍，草稿箱里那份也该撤掉
        this._published = true;
        if (draftId) store.removeDraft(draftId);
      }
    } catch (e) {
      wx.showToast({ title: '网络好像不太稳，内容先存在本机了', icon: 'none', duration: 3000 });
      return;
    } finally {
      this.setData({ submitting: false });
    }
    setTimeout(() => {
      wx.navigateBack();
    }, 700);
  }
});
