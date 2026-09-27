// pages/course/add/add.js —— 同学互助：添加课程库里还没有的课
const store = require('../../../utils/store.js');
const seed = require('../../../data/seed.js');

Page({
  data: {
    colleges: [],
    college: '',
    collegeIndex: 0,
    name: '',
    major: '',
    credit: '3',
    // 课程类型：让加课的人自己说一句是最靠谱的 —— 官方目录里全是专业课，
    // 按课名推不出「体育课 / 思政课」，所以这里给个选择器，默认先按名字猜一个
    ctypes: seed.COURSE_TYPES,
    ctype: seed.DEFAULT_COURSE_TYPE,
    ctypeIndex: 0,
    // 同学手动挑过类型之后，课名再变也不覆盖他的选择
    ctypePicked: false
  },

  onLoad(options) {
    const colleges = store.getColleges();
    // 从课程列表搜索页跳来时，把关键词预填成课程名，少打一次字
    const kw = options && options.kw ? decodeURIComponent(options.kw) : '';
    // 从「这个类型下还没有课」的空状态跳来时，类型已经选好了，直接带上
    const wantType = options && options.ctype ? decodeURIComponent(options.ctype) : '';
    if (wantType && this.data.ctypes.indexOf(wantType) >= 0) {
      this.setData({ ctype: wantType, ctypeIndex: this.data.ctypes.indexOf(wantType), ctypePicked: true });
    }
    this.setData({
      colleges,
      college: colleges[0] || '',
      collegeIndex: 0,
      name: kw
    });
    if (!wantType) this.refreshGuess();
  },

  // 课名变了就重新猜一次类型：同学没手动改过类型时，跟着课名走
  refreshGuess() {
    const guess = seed.guessCourseType(this.data.name);
    const i = Math.max(0, this.data.ctypes.indexOf(guess));
    this.setData({ ctypeIndex: i, ctype: this.data.ctypes[i] });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
    // 只在同学还没手动挑过类型时才跟着课名走，别把他选的覆盖掉
    if (!this.data.ctypePicked) this.refreshGuess();
  },

  onCtype(e) {
    const i = Number(e.detail.value);
    this.setData({ ctypeIndex: i, ctype: this.data.ctypes[i], ctypePicked: true });
  },

  onCollege(e) {
    const i = Number(e.detail.value);
    this.setData({ collegeIndex: i, college: this.data.colleges[i] });
  },

  onMajor(e) {
    this.setData({ major: e.detail.value });
  },

  onCredit(e) {
    this.setData({ credit: e.detail.value });
  },

  // 提交前先查重，避免同一门课被反复添加
  checkDuplicate() {
    const name = this.data.name.trim();
    if (!name) return null;
    return store.findCourseByName(name);
  },

  submit() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: '先填一下课程名', icon: 'none' });
      return;
    }

    const existed = this.checkDuplicate();
    if (existed) {
      wx.showModal({
        title: '这门课已经有了',
        content: '「' + existed.name + '」在课程库里，直接去写评价吧。',
        confirmText: '去评价',
        cancelText: '知道了',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/course/detail/detail?id=' + existed.id });
          } else {
            wx.navigateBack();
          }
        }
      });
      return;
    }

    const course = store.addCourse({
      name,
      college: this.data.college,
      major: this.data.major.trim() || '未分类',
      credit: this.data.credit,
      ctype: this.data.ctype
    });

    wx.showToast({ title: '添加成功', icon: 'success' });
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/course/detail/detail?id=' + course.id });
    }, 600);
  }
});
