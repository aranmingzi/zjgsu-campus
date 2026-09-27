// pages/campus/campus.js —— 校园 Tab（活动信息 / 校历 / 地点地图）
//
// 这三个东西为什么挤在一个页面里：它们都是「每周瞄一眼」的信息，
// 各占一个 tab 的话，四个 tab 已经把微信的五个位置用掉五分之四，
// 剩下的位置得留给主内容。所以这里用页内分段切换，一个位置装三块。
//
// 校历、地点的读取复用 utils/user.js 里现成的接口（跟 pages/tool 那两个页面同一份数据），
// 这里只做展示；要改校历 / 补地点，仍然进「校历」「校园地点」两个完整页
// （那两页有地图选点、审核员编辑这些用不上的复杂逻辑，不往这里搬）。
const eventApi = require('../../utils/event.js');
const userApi = require('../../utils/user.js');
// 顶部 Banner：全站最热树洞 / 最急寻物 / 最火闲置（论坛、闲置、活动三个板块共用）
const bannerApi = require('../../utils/banner.js');

const TABS = [
  { key: 'events', label: '活动信息' },
  { key: 'calendar', label: '校历' },
  { key: 'places', label: '地点地图' }
];

function tabMap(cur) {
  const m = {};
  TABS.forEach((t) => { m[t.key] = t.key === cur; });
  return m;
}

// 地点分类，跟 pages/tool/places 保持一致
const PLACE_CATS = ['教学楼', '食堂', '宿舍', '快递', '运动', '其他'];

function placeCatIcon(c) {
  return c === '教学楼' ? '🏫' : (c === '食堂' ? '🍚' : (c === '宿舍' ? '🛏️'
    : (c === '快递' ? '📦' : (c === '运动' ? '⚽' : '📍'))));
}

// 倒计时天数：WXML 的 {{}} 里不能调方法，天数必须在这里算好
function daysNum(date) {
  const target = new Date(String(date || '').replace(/-/g, '/') + ' 00:00:00');
  if (isNaN(target.getTime())) return 99999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function daysText(date) {
  const n = daysNum(date);
  if (n === 99999) return '';
  if (n > 0) return '还有 ' + n + ' 天';
  if (n === 0) return '就是今天';
  return '已过去 ' + Math.abs(n) + ' 天';
}

Page({
  data: {
    tabs: TABS,
    tab: 'events',
    tabMap: tabMap('events'),
    loaded: { events: false, calendar: false, places: false },

    /* 活动信息 */
    events: [],
    eventLoading: true,
    eventCount: 0,
    officialEvents: [],
    studentEvents: [],
    officialCount: 0,
    studentCount: 0,
    // 官方活动 / 同学组织的分开看：这是两类性质完全不同的东西，
    // 挤在一起，同学想找学校发的通知得从头翻
    evFilter: 'all',
    shownOfficial: [],
    shownStudent: [],
    lastSync: '',
    syncing: false,

    /* 校历 */
    calList: [],
    calNext: '',

    /* 地点地图 */
    placeCats: ['全部'].concat(PLACE_CATS),
    placeCat: '全部',
    placeCatMap: {},
    placeList: [],
    placeLoading: true,

    /* 顶部 Banner 轮播：4 秒自动切；手指一碰立刻停，抬手恢复 */
    banner: [],
    bannerIdx: 0,
    bannerAutoplay: true
  },

  onLoad() {
    this.setData({ placeCatMap: this.buildPlaceCatMap('全部') });
    this.loadBanner();
    this.loadEvents();
    // 悄咪咪补一次同步：定时的管每天 07:30，白天打开小程序的人也该看到最新的活动。
    // 排在列表加载之后，不挡首屏、不弹任何东西，失败就当没发生过。
    if (this.needAutoSync()) setTimeout(() => this.autoSync(), 1200);
  },

  onShow() {
    // 从发布活动页 / 活动详情页退回来时刷新，刚发的不该看不到
    if (this.data.loaded.events) this.loadEvents();
    this.loadBanner();
  },

  /* ---------------- 顶部 Banner 轮播 ---------------- */

  // 数据随 onShow 刷新：刚发的寻物 / 闲置、刚被顶起来的树洞，回来就该看到新的
  loadBanner() {
    this.setData({ banner: bannerApi.getBannerItems(), bannerIdx: 0, bannerAutoplay: true });
  },

  // 手指触碰轮播立即停：自动切换和拖动抢一个 swiper，触摸期间把 autoplay 关掉
  onBannerTouchStart() {
    if (!this.data.bannerAutoplay) return;
    this.setData({ bannerAutoplay: false });
  },

  // 抬手 / 划出轮播区域就恢复自动切换
  onBannerTouchEnd() {
    if (this.data.bannerAutoplay) return;
    this.setData({ bannerAutoplay: true });
  },
  onBannerTouchCancel() {
    this.onBannerTouchEnd();
  },

  // swiper 自滚也会触发 change：只用来同步指示点
  onBannerChange(e) {
    const cur = e.detail.current;
    if (cur === this.data.bannerIdx) return;
    this.setData({ bannerIdx: cur });
  },

  onBannerTap(e) {
    const b = this.data.banner[e.currentTarget.dataset.idx];
    if (!b || !b.url) return;
    wx.navigateTo({ url: b.url });
  },

  buildPlaceCatMap(cur) {
    const m = {};
    this.data.placeCats.forEach((c) => { m[c] = c === cur; });
    return m;
  },

  /* ---------------- 分段切换 ---------------- */

  onTab(e) {
    const k = e.currentTarget.dataset.k;
    if (k === this.data.tab) return;
    this.setData({ tab: k, tabMap: tabMap(k) });
    // 懒加载：点到哪块才去拉哪块的数据，首屏不用等三个接口
    if (k === 'calendar' && !this.data.loaded.calendar) this.loadCalendar();
    if (k === 'places' && !this.data.loaded.places) this.loadPlaces();
  },

  /* ---------------- 活动信息 ---------------- */

  async loadEvents() {
    let list = eventApi.getEvents();
    try {
      const n = await eventApi.fetchEvents(1);
      if (n) list = eventApi.getEvents();
    } catch (e) {}
    const decorated = list.map((e) => Object.assign({}, e, {
      typeIcon: e.official ? '🏛️' : eventApi.typeIcon(e.type),
      typeLabel: e.official ? '官方' : eventApi.typeLabel(e.type),
      // 人数上限：写了就显示「已报名 3/20」，没写就不显示，免得看着像限制人数
      countText: e.capacity > 0 ? ('已报名 ' + (e.joinedCount || 0) + '/' + e.capacity) : ('' + (e.joinedCount || 0) + ' 人已报名')
    }));

    // 官网那条和同学自己发的那条分开摆：官网活动按活动日期排、同学活动按发布时间排，
    // 混在一条列表里官网那批会被旧时间的自己沉到底，音乐节、体育节就看不见了。
    // 官方块永远在最上面，也顺带回答了「哪些是学校发的、哪些是同学发的」。
    // 官网条目只展示最近 7 天的：与云函数采集窗口一致，旧通知不再挂在列表里占位置。
    const weekAgo = Date.now() - 7 * 86400000;
    const official = decorated.filter((e) => e.official === true
      && (Number(e.at) || 0) >= weekAgo);
    const student = decorated.filter((e) => e.official !== true);

    // 当前选中的分类决定实际渲染哪几块
    const f = this.data.evFilter;
    const showOfficial = (f === 'all' || f === 'official') ? official : [];
    const showStudent = (f === 'all' || f === 'student') ? student : [];

    this.setData({
      events: decorated,
      officialEvents: official,
      studentEvents: student,
      shownOfficial: showOfficial,
      shownStudent: showStudent,
      eventLoading: false,
      // 「全部」的计数 = 官网（7 天内）+ 同学发起，必须跟下面两个数能对上。
      // 之前写 list.length（含被 7 天窗口滤掉的旧官网通知），出现
      // 「全部 40 / 官网 17 / 同学 0」这种加不起来的怪数
      eventCount: official.length + student.length,
      officialCount: official.length,
      studentCount: student.length,
      lastSync: this.readSyncTime(),
      loaded: Object.assign({}, this.data.loaded, { events: true })
    });
  },

  // 活动分类：全部 / 官网发布 / 同学发起
  onEvFilter(e) {
    const f = e.currentTarget.dataset.f || 'all';
    if (f === this.data.evFilter) return;
    this.setData({ evFilter: f });
    this.loadEvents();
  },

  // 同步时间只记在本地：同学点「更新」之后想知道官网那批数据有多旧
  readSyncTime() {
    try {
      const v = wx.getStorageSync('zjgsu_events_synced_at');
      return v ? String(v) : '';
    } catch (e) {
      return '';
    }
  },

  async writeSyncTime() {
    try {
      wx.setStorageSync('zjgsu_events_synced_at', eventApi.nowText());
      wx.setStorageSync('zjgsu_events_synced_ts', Date.now());
    } catch (e) {}
  },

  // 距上次同步超过 12 小时，就自动再抓一次
  needAutoSync() {
    const ts = Number(wx.getStorageSync('zjgsu_events_synced_ts')) || 0;
    return !ts || (Date.now() - ts) > 12 * 3600 * 1000;
  },

  async autoSync() {
    const r = await userApi.eventSync();
    if (!r || r.ok === false) return; // 抓不到就等下一次，不弹窗打扰同学
    await this.writeSyncTime();
    this.loadEvents();
  },

  // 手动触发一次官网同步。云函数里有定时触发器每天自动跑（每天 07:30），
  // 但这个按钮还是要有：定时任务没生效时，同学能自己点一下。
  async onSync() {
    if (this.data.syncing) {
      wx.showToast({ title: '正在同步，稍等一下', icon: 'none' });
      return;
    }
    this.setData({ syncing: true });
    wx.showLoading({ title: '正在抓官网', mask: true });
    const r = await userApi.eventSync();
    wx.hideLoading();
    this.setData({ syncing: false });
    if (!r || r.ok === false) {
      // 官网挂了 / 超时 / 云函数版本太老，都得让同学看得懂
      wx.showModal({
        title: '同步失败',
        content: (r && r.msg) || '官网暂时打不开，可以稍后再试。已配置每天自动同步一次，明天再看。',
        showCancel: false
      });
      return;
    }
    await this.writeSyncTime();
    wx.showToast({
      title: '新增 ' + (r.added || 0) + ' 条，更新 ' + (r.updated || 0) + ' 条',
      icon: 'none',
      duration: 2200
    });
    this.loadEvents();
  },

  // 官方活动跳官网原文：出处必须能追溯，不然就是无从查证的转载。
  // 小程序里没法直接开外链（要配业务域名），所以给链接 + 复制到剪贴板两条路。
  onOfficial(e) {
    const ev = this.data.shownOfficial[e.currentTarget.dataset.i];
    if (!ev || !ev.sourceUrl) return;
    wx.setClipboardData({ data: ev.sourceUrl });
    wx.showModal({
      title: '来自「' + (ev.source || '官网') + '」',
      content: '原文链接：' + ev.sourceUrl + '\n\n已复制到剪贴板，可粘贴到浏览器打开。',
      showCancel: false
    });
  },

  goEvent(e) {
    wx.navigateTo({ url: '/pages/campus/event/event?id=' + e.currentTarget.dataset.id });
  },

  goAddEvent() {
    wx.navigateTo({ url: '/pages/campus/add/add' });
  },

  /* ---------------- 校历 ---------------- */

  async loadCalendar() {
    let list = await userApi.calendarList();
    const decorated = (list || []).map((it) => Object.assign({}, it, {
      days: daysNum(it.date),
      daysText: daysText(it.date),
      past: daysNum(it.date) < 0,
      typeIcon: it.type === 'exam' ? '📝' : (it.type === 'term' ? '🎓' : '📌')
    })).sort((a, b) => a.days - b.days);
    const next = decorated.filter((d) => d.days >= 0)[0];
    this.setData({
      calList: decorated,
      calNext: next ? (next.name + ' · ' + next.daysText) : '近期没有安排',
      loaded: Object.assign({}, this.data.loaded, { calendar: true })
    });
  },

  goCalendarFull() {
    wx.navigateTo({ url: '/pages/tool/calendar/calendar' });
  },

  /* ---------------- 地点地图 ---------------- */

  async loadPlaces() {
    const all = await userApi.placeList(this.data.placeCat === '全部' ? '' : this.data.placeCat);
    this.setData({
      placeList: (all || []).map((p) => Object.assign({}, p, {
        catIcon: placeCatIcon(p.category)
      })),
      placeLoading: false,
      loaded: Object.assign({}, this.data.loaded, { places: true })
    });
  },

  onPlaceCat(e) {
    const c = e.currentTarget.dataset.c || '全部';
    if (c === this.data.placeCat) return;
    this.setData({ placeCat: c, placeCatMap: this.buildPlaceCatMap(c), placeLoading: true });
    this.loadPlaces();
  },

  // 唤起微信内置地图：位置在这里看、导航在这里叫
  onPlaceOpen(e) {
    const p = this.data.placeList[e.currentTarget.dataset.i];
    if (!p) return;
    wx.openLocation({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      name: p.name,
      address: p.address || p.desc || '',
      scale: 18
    });
  },

  goPlacesFull() {
    wx.navigateTo({ url: '/pages/tool/places/places' });
  },

  onShareAppMessage() {
    return {
      title: '商砖小站 · 校园活动 + 校历倒计时 + 地点地图',
      path: '/pages/campus/campus'
    };
  }
});
