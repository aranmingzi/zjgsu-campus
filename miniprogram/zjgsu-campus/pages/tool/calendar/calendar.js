// pages/tool/calendar/calendar.js —— 校历倒计时
//
// 为什么做这个：课程评价只在选课周爆发、二手只在搬宿舍时有人用，
// 校历是「每周都会瞄一眼」的东西——它给小程序一个被反复打开的理由。
//
// 数据存在云端的 calendar 集合：第一次进来库是空的，云函数会把预置节点写进去；
// 审核员可以在这里改日期，改完全校看到的都是新的。
const userApi = require('../../../utils/user.js');

const TYPES = [
  { key: 'exam', label: '考试', icon: '📝' },
  { key: 'term', label: '学期', icon: '🎓' },
  { key: 'other', label: '其他', icon: '📌' }
];

// 倒计时天数：WXML 的 {{}} 里不能调方法，天数必须在这里算好
function daysText(date) {
  const target = new Date(String(date || '').replace(/-/g, '/') + ' 00:00:00');
  if (isNaN(target.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff > 0) return '还有 ' + diff + ' 天';
  if (diff === 0) return '就是今天';
  return '已过去 ' + Math.abs(diff) + ' 天';
}

function daysNum(date) {
  const target = new Date(String(date || '').replace(/-/g, '/') + ' 00:00:00');
  if (isNaN(target.getTime())) return 99999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

Page({
  data: {
    list: [],
    nextText: '',
    isMod: false,
    loading: true,
    types: TYPES,
    // 审核员才能看到的编辑区
    editing: false,
    form: { id: '', name: '', date: '', type: 'other', note: '' },
    typeMap: { exam: true, term: false, other: false }
  },

  onLoad() {
    this.load();
  },

  async load() {
    const [list, who] = await Promise.all([
      userApi.calendarList(),
      userApi.whoami()
    ]);
    const decorated = (list || [])
      .map((it) => Object.assign({}, it, {
        days: daysNum(it.date),
        daysText: daysText(it.date),
        past: daysNum(it.date) < 0,
        typeIcon: (TYPES.filter((t) => t.key === it.type)[0] || {}).icon || '📌'
      }))
      .sort((a, b) => a.days - b.days);
    // 最近一个还没到的节点，放在页面顶部当「今日提醒」
    const next = decorated.filter((d) => d.days >= 0)[0];
    this.setData({
      list: decorated,
      nextText: next ? (next.name + '：' + next.daysText) : '近期没有安排，有通知了再来加一条',
      isMod: !!(who && who.isMod),
      loading: false
    });
  },

  onEditToggle() {
    if (!this.data.isMod) {
      wx.showToast({ title: '只有审核员能改校历', icon: 'none' });
      return;
    }
    this.setData({ editing: !this.data.editing });
  },

  onFormInput(e) {
    const k = e.currentTarget.dataset.k;
    const form = Object.assign({}, this.data.form);
    form[k] = e.detail.value;
    this.setData({ form: form });
  },

  onFormType(e) {
    const k = e.currentTarget.dataset.k;
    const typeMap = {};
    TYPES.forEach((t) => { typeMap[t.key] = t.key === k; });
    const form = Object.assign({}, this.data.form, { type: k });
    this.setData({ form: form, typeMap: typeMap });
  },

  onFormDate(e) {
    const form = Object.assign({}, this.data.form, { date: e.detail.value });
    this.setData({ form: form });
  },

  async onSubmit() {
    const f = this.data.form;
    if (!f.name.trim() || !f.date) {
      wx.showToast({ title: '名称和日期都要填', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    const r = await userApi.calendarSave({
      id: f.id,
      name: f.name.trim(),
      date: f.date,
      type: f.type,
      note: f.note
    });
    wx.hideLoading();
    if (!r || r.ok === false) {
      wx.showToast({ title: (r && r.msg) || '保存失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已保存', icon: 'success' });
    this.setData({ editing: false, form: { id: '', name: '', date: '', type: 'other', note: '' } });
    this.load();
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删掉这个节点？',
      content: '删了以后全校都看不到了',
      success: async (r) => {
        if (!r.confirm) return;
        await userApi.calendarRemove(id);
        this.load();
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '商砖小站 · 校历倒计时（考试周/四六级/考研一眼看清）',
      path: '/pages/tool/calendar/calendar'
    };
  }
});
