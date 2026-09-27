// pages/tool/memo/memo.js —— 我的备忘（记日常）
//
// 和论坛、树洞最大的不同：这是「只给自己看」的地方。
// 服务端读写一律带 openid 过滤，别的同学（哪怕审核员）也翻不到这里的一条。
//
// 设计取舍：
//  · 列表按日期分组，写多 days 了也不会糊成一片；
//  · 顶部只放两个数——连续写了几天、这个月记了多少条。连续天数是这类工具
//    唯一的「上瘾点」，比任何功能都重要；
//  · 本机先缓存一份用于秒开，云端为准，写成功后再以云端结果重排。
const userApi = require('../../../utils/user.js');

const KEY = 'zjgsu_memos';

const MOODS = [
  { key: 'happy', icon: '😄', name: '开心' },
  { key: 'flat', icon: '😐', name: '平静' },
  { key: 'down', icon: '😔', name: '低落' },
  { key: 'busy', icon: 'flame', name: '充实' },
  { key: 'tired', icon: '😮‍💨', name: '累了' }
];

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(n) {
  return (n < 10 ? '0' + n : '' + n);
}
function dateStr(d) {
  const t = d || new Date();
  return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
}
function parseDate(s) {
  // iOS 不吃「2026-09-26」这种横杠写法，要换成斜杠
  return new Date(String(s || '').replace(/-/g, '/') + ' 00:00:00');
}
function moodOf(key) {
  return MOODS.filter((m) => m.key === key)[0] || MOODS[1];
}

// 连续记录天数：今天还没写就先从昨天往前数，别让人一进页面就看到 0 而泄气
function calcStreak(dates) {
  if (!dates.length) return 0;
  const set = {};
  dates.forEach((d) => { set[d] = true; });
  const cursor = new Date();
  if (!set[dateStr(cursor)]) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set[dateStr(cursor)]) return 0;
  }
  let n = 0;
  while (set[dateStr(cursor)]) {
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

// 按日期倒序分组：同一天记多条也归在一格里
function groupByDate(list) {
  const map = {};
  list.forEach((m) => {
    const d = String(m.date || dateStr());
    if (!map[d]) {
      const p = parseDate(d);
      map[d] = { date: d, week: WEEK[p.getDay()] || '', items: [] };
    }
    map[d].items.push(Object.assign({}, m, {
      moodIcon: moodOf(m.mood).icon,
      moodName: moodOf(m.mood).name,
      // 正文很长时在卡片上只露一小段，全展开会把列表挤爆
      brief: String(m.text || '').replace(/\s+/g, ' ').slice(0, 60)
    }));
  });
  return Object.keys(map).sort((a, b) => (a < b ? 1 : -1)).map((d) => map[d]);
}

Page({
  data: {
    groups: [],
    total: 0,
    streak: 0,
    month: 0,
    monthLabel: '',
    hasToday: false,
    keyword: '',
    showForm: false,
    editing: false,
    form: { id: '', date: '', mood: 'flat', text: '' },
    moods: MOODS,
    moodMap: { happy: false, flat: true, down: false, busy: false, tired: false },
    today: dateStr()
  },

  onLoad() {
    this.refresh(true);
  },

  onShow() {
    // 从编辑页回来时兜一下新鲜度，顺手把「本机缓存秒开」的分支也走一遍
    this.refresh(false);
  },

  onPullDownRefresh() {
    this.refresh(false).then(() => wx.stopPullDownRefresh());
  },

  // quiet=true 表示首帧只用本机那份，不去联网——进页面要秒开，不该白等一个请求
  refresh(quiet) {
    const local = wx.getStorageSync(KEY) || [];
    if (quiet && local.length) this.apply(local);

    return userApi.memoList().then((r) => {
      const list = Array.isArray(r && r.list) ? r.list : [];
      if (list.length) wx.setStorageSync(KEY, list);
      this.apply(list);
    }).catch(() => { /* 云端不可用时就用上面那份本机缓存 */ });
  },

  // 全量数据存一份在实例上：搜索只在这份里过滤，不再为了筛几个字打一次网络请求
  apply(list) {
    const dates = [];
    const now = new Date();
    const prefix = now.getFullYear() + '-' + pad(now.getMonth() + 1);
    const today = dateStr();
    list.forEach((m) => {
      const d = String(m.date || '');
      if (d && dates.indexOf(d) < 0) dates.push(d);
    });
    this.setData({
      groups: groupByDate(list),
      total: list.length,
      streak: calcStreak(dates),
      month: list.filter((m) => String(m.date || '').indexOf(prefix) === 0).length,
      monthLabel: (now.getMonth() + 1) + ' 月',
      hasToday: list.some((m) => String(m.date || '') === today)
    });
    // 存全量，搜索才筛得到；漏了这行 onSearch 里的 _all 就是 undefined
    this._all = Array.isArray(list) ? list : [];
    this.render(list);
  },

  // 只重画列表，不动顶上的统计
  render(list) {
    this.setData({
      groups: groupByDate(list),
      total: list.length
    });
  },

  onSearch(e) {
    const keyword = String(e.detail.value || '');
    // _all 必须已经Ready：这里是 undefined 时打字会直接抛错，
    // 连「搜索词回显」都做不到的 —— 所以首次渲染前搜索框就应该是坏的
    const all = this._all || [];
    const hit = keyword
      ? all.filter((m) => String(m.text || '').indexOf(keyword) >= 0)
      : all;
    this.setData({ keyword: keyword });
    this.render(hit);
  },

  onClearSearch() {
    this.setData({ keyword: '' });
    this.render(this._all || []);
  },

  openForm() {
    this.setData({
      showForm: true,
      editing: false,
      form: { id: '', date: dateStr(), mood: 'flat', text: '' },
      moodMap: { happy: false, flat: true, down: false, busy: false, tired: false }
    });
  },

  closeForm() {
    this.setData({ showForm: false, editing: false });
  },

  onFormText(e) {
    const form = Object.assign({}, this.data.form);
    form.text = e.detail.value;
    this.setData({ form: form });
  },

  onFormDate(e) {
    const form = Object.assign({}, this.data.form);
    form.date = e.detail.value;
    this.setData({ form: form });
  },

  onFormMood(e) {
    const k = e.currentTarget.dataset.k;
    const moodMap = {};
    MOODS.forEach((m) => { moodMap[m.key] = m.key === k; });
    this.setData({ form: Object.assign({}, this.data.form, { mood: k }), moodMap: moodMap });
  },

  onEdit(e) {
    const item = e.currentTarget.dataset.item || {};
    const moodMap = {};
    MOODS.forEach((m) => { moodMap[m.key] = m.key === item.mood; });
    this.setData({
      showForm: true,
      editing: true,
      form: {
        id: item.id || '',
        date: item.date || dateStr(),
        mood: item.mood || 'flat',
        text: item.text || ''
      },
      moodMap: moodMap
    });
  },

  onRemove(e) {
    const item = e.currentTarget.dataset.item || {};
    if (!item.id) return;
    wx.showModal({
      title: '删掉这一条？',
      content: '删了就找不回来了。',
      confirmColor: '#d9534f',
      success: async (res) => {
        if (!res.confirm) return;
        const r = await userApi.memoRemove(item.id).catch(() => null);
        if (!r || r.ok === false) {
          wx.showToast({ title: (r && r.msg) || '删除失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已删除', icon: 'success' });
        this.refresh(false);
      }
    });
  },

  async onSave() {
    const f = this.data.form;
    const text = String(f.text || '').trim();
    if (!text) {
      wx.showToast({ title: '还没写内容', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    const r = await userApi.memoSave({
      id: f.id,
      date: f.date,
      mood: f.mood,
      text: text
    }).catch(() => null);
    wx.hideLoading();
    if (!r || r.ok === false) {
      wx.showToast({ title: (r && r.msg) || '保存失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: f.id ? '已更新' : '已记下', icon: 'success' });
    this.setData({ showForm: false, editing: false, keyword: '' });
    this.refresh(false);
  },

  // 弹层白点一下就收起，别为了「关掉」再写一个空的关闭方法
  noop() {},

  onShareAppMessage() {
    return {
      title: '商砖小站 · 我的备忘（每天记一句，回头看看挺好）',
      path: '/pages/tool/memo/memo'
    };
  }
});
