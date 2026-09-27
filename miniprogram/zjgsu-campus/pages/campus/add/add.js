// pages/campus/add/add.js —— 发起校园活动
//
// 同学自己发起，不需要审核员开权限：讲座、比赛、组队都是「有人发起、有人报名」的事，
// 走审核反而赶不上报名时间。唯一不能省的是内容安全——标题 / 详情 / 地点照样要过屏蔽词
// 和微信官方接口（云函数里那道 guard 才是真拦截，这里只是提前给个提示）。
const eventApi = require('../../../utils/event.js');
const userApi = require('../../../utils/user.js');

const TYPES = [
  { key: 'lecture', label: '讲座', icon: 'megaphone️' },
  { key: 'contest', label: '比赛', icon: 'award' },
  { key: 'team', label: '组队', icon: 'users-round' },
  { key: 'other', label: '其他', icon: 'sparkles' }
];

Page({
  data: {
    types: TYPES,
    form: {
      type: 'lecture',
      title: '',
      date: '',
      time: '',
      location: '',
      capacity: '',
      contact: '',
      desc: ''
    },
    typeMap: { lecture: true, contest: false, team: false, other: false },
    submitting: false
  },

  onLoad() {
    this.resetTypeMap('lecture');
    // 默认给个明天的日期：多数人发活动是「下周的讲座」，让玩家自己改，
    // 而不是空着让人纠结填什么
    const d = new Date(Date.now() + 86400000);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    this.setData({ 'form.date': d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) });
  },

  resetTypeMap(cur) {
    const m = {};
    TYPES.forEach((t) => { m[t.key] = t.key === cur; });
    this.setData({ typeMap: m });
  },

  onType(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ 'form.type': k });
    this.resetTypeMap(k);
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['form.' + k]: e.detail.value });
  },

  onDate(e) {
    this.setData({ 'form.date': e.detail.value });
  },

  onTime(e) {
    this.setData({ 'form.time': e.detail.value });
  },

  async onSubmit() {
    // 连点保护：上一次提交卡住时 submitter 会留在 true，按钮看着能点、实则被静默吃掉，
    // 用户看到的就是「点了没反应」。给一句明话，别让人反复戳。
    if (this.data.submitting) {
      wx.showToast({ title: '正在发布，稍等一下', icon: 'none' });
      return;
    }
    const f = this.data.form;
    const title = String(f.title || '').trim();
    if (!title) {
      wx.showToast({ title: '给活动起个名字', icon: 'none' });
      return;
    }
    if (!f.date) {
      wx.showToast({ title: '选一下活动日期', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '发布中', mask: true });

    // 本地词表即时提示（真正拦在云函数那道 guard）
    const pre = await userApi.checkText({ title: title, content: String(f.desc || '') });
    if (pre && pre.ok === false) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: pre.msg || '内容有违规词', icon: 'none' });
      return;
    }

    const cap = String(f.capacity || '').trim();
    const r = await eventApi.addEvent({
      type: f.type,
      title: title,
      date: f.date,
      time: f.time,
      location: String(f.location || '').trim(),
      // 没填就当不限人数：硬塞一个默认值反而会让同学以为报满了
      capacity: cap ? parseInt(cap, 10) || 0 : 0,
      contact: String(f.contact || '').trim(),
      desc: String(f.desc || '').trim(),
      author: (userApi.getMyProfile().nickName) || '浙小商'
    });
    wx.hideLoading();
    this.setData({ submitting: false });

    if (!r || r.ok === false) {
      // saved:false 表示云端没存住（不是违规），本地那条已经被撤掉了，
      // 提示说清楚，别让同学以为发了却查不到
      wx.showToast({ title: (r && r.msg) || '发布失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已发布', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 600);
  },

  onShareAppMessage() {
    return { title: '商砖小站 · 校园活动', path: '/pages/campus/campus' };
  }
});
