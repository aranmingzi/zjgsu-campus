// pages/course/list/list.js
const store = require('../../../utils/store.js');
const userApi = require('../../../utils/user.js');
// 精准 / 模糊的匹配内核在全站共用一份（utils/search.js）。
// 这里不再自己写一份，否则改了一处、另一处还是老的，同学会以为搜索坏了
const searchCore = require('../../../utils/search.js');
const { MATCH_RANK, matchLevel, hitCount } = searchCore;

const PAGE_SIZE = 30; // 一屏先给 30 门，滑到底再补，避免 900 门一次性渲染

// 课程类型二级分类：学院下面再分一层，选课的人先找对学院、再挑类型。
// 判据在 seed.guessCourseType（按课名推断），这里只放筛选项
const CTYPES = ['全部', '专业必修', '专业选修', '通识课', '体育课', '思政课'];

// 两档要搜的东西不一样：
//   课程评价 —— 找一门课，看这门课怎么样；
//   老师评价 —— 找一位老师，看他讲课怎么样。
// 搜索框还是那一个，但底下搜的字段完全不同（课名/专业 vs 人名/学院），
// 混在一起搜会把「王老师」当成课名，什么都搜不到。
const SCOPES = [
  { key: 'course', label: '课程评价' },
  { key: 'teacher', label: '老师评价' }
];

// 排序档位：综合（默认）/ 评分 / 好评率 / 评论数。
// 「评分高」≠「多数人说好」≠「讨论多」，三个口径各管一摊，都要能排。
// 老师档复用同一组档位：评分=老师分、好评率=4 星及以上占比、评论数=评价条数
const SORT_ITEMS = [
  { k: 'default', label: '综合' },
  { k: 'score', label: '评分' },
  { k: 'goodrate', label: '好评率' },
  { k: 'comments', label: '评论数' }
];

Page({
  data: {
    display: [],
    total: 0,
    hasMore: false,
    keyword: '',
    hasKeyword: false,
    college: '全部',
    colleges: ['全部'],
    ctype: '全部',
    ctypes: CTYPES,
    // 每个类型下有多少门课（随学院筛选变化），chip 上直接显示，点空档之前先看见数字
    ctypeCounts: {},
    sort: 'default', // default | score | goodrate | comments
    sortItems: SORT_ITEMS,
    // 搜索档位。界面上那个「精准 / 模糊」切换条已经撤掉了 ——
    // 让用户先想清楚自己是要「找得准」还是「找得到」，本身就多了一件事，
    // 而且选错了他还得自己切回来。现在固定走 fuzzy：
    // 它是**从准到不准**排的（完全一致 → 包含 → 打错字 → 乱序），
    // 名字打对的天然排在最前面，打错的也兜得住，不需要用户做选择。
    // 这个字段保留着，是给「精确档」留的口子（比如以后想在后台发精准查询）。
    // 配套的那个「精准 / 模糊」切换按钮和方法 onMode 都已经在界面撤掉时一起删了，
    // 目前只有 fuzzy 这一档能走到，别再往回加 UI
    mode: 'fuzzy',
    fuzzyCount: 0,
    // 现在搜的是「课」还是「老师」
    scope: 'course',
    scopes: SCOPES,
    scopeMap: { course: true, teacher: false },
    teacherCount: 0,
    // 老师档的补充名单来自云端名录（同名的同学补充会合并），可能比评论聚合出来的人多
    teachers: []
  },

  onLoad() {
    this._all = [];
    this._view = [];
    this._teacherNames = [];
    this.setData({ colleges: ['全部'].concat(store.getColleges()) });
    // 拉一次全校的课程类型纠正表（一次会话只拉一次）：
    // 别的同学改过的类型要能在这台手机上生效，筛选结果才可信
    store.syncCourseTypes();
    this.load();
  },

  onShow() {
    this.load();
    this.pullTeacherNames();
  },

  // 云端名录里那些「还没被评价过」的老师也要能搜到：
  // 同学想给某位老师写评价，至少先得搜得到这个人。
  // 名录几百条，只取名字，失败就算了（不影响评价聚合出来的那批）。
  pullTeacherNames() {
    if (this._namesLoaded || this._namesLoading) return;
    this._namesLoading = true;
    userApi.teacherList('', '').then((list) => {
      this._namesLoading = false;
      if (!list || !list.length) return;
      this._namesLoaded = true;
      this._teacherNames = list.map((t) => String(t.name || '').trim()).filter(Boolean);
      this.refreshTeacherBoard();
      if (this.data.scope === 'teacher') this.applyTeacherFilter();
    }).catch(() => { this._namesLoading = false; });
  },

  load() {
    this._all = store.getCourses();
    this.refreshTeacherBoard();
    this.applyFilter(true);
  },

  // 老师档的数据：评价聚合出来的口碑 + 云端名录里出现过的老师。
  // 名录里那些「还没人评价过」的老师也要能搜到 —— 同学想评价他时至少查得到这名字。
  refreshTeacherBoard() {
    const board = store.getTeacherBoard();
    const seen = {};
    board.forEach((t) => { seen[t.name] = true; });
    const extra = (this._teacherNames || []).filter((n) => n && !seen[n]).map((n) => ({
      name: n, count: 0, verified: true, avg: 0, avgRound: 0,
      courseAvg: 0, courseCount: 0, courseNames: '', scoredCount: 0
    }));
    this._teachers = board.concat(extra);
    this.setData({ teacherCount: this._teachers.length });
  },

  onSearch(e) {
    const kw = e.detail.value;
    this.setData({ keyword: kw, hasKeyword: !!kw.trim() });
    this.applyFilter(true);
  },

  // 课程评价 / 老师评价 切换：搜索框里的词跟着换到对应的池子里重搜
  onScope(e) {
    const s = e.currentTarget.dataset.s;
    if (s === this.data.scope) return;
    const m = {};
    SCOPES.forEach((x) => { m[x.key] = x.key === s; });
    this.setData({
      scope: s,
      scopeMap: m,
      // 两档都有同一组排序（综合/评分/好评率/评论数），切换时归位，免得按钮状态骗人
      sort: 'default'
    });
    this.applyFilter(true);
    wx.showToast({
      title: s === 'teacher' ? '现在按老师找' : '现在按课程找',
      icon: 'none',
      duration: 1200
    });
  },

  // 搜不到时，允许同学自己把这门课加进课程库。
  // 从「这个类型下还没有课」的空状态点进来时带上类型，加课页直接帮他选好
  goAdd(e) {
    const kw = encodeURIComponent(this.data.keyword.trim());
    const t = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.t) || '';
    const url = '/pages/course/add/add?kw=' + kw + (t ? '&ctype=' + encodeURIComponent(t) : '');
    wx.navigateTo({ url: url });
  },

  onCollege(e) {
    this.setData({ college: e.currentTarget.dataset.c });
    this.applyFilter(true);
  },

  // 课程类型二级筛选：学院把范围圈小之后，再按「这门课是什么性质」挑
  onCtype(e) {
    const t = e.currentTarget.dataset.t || '全部';
    if (t === this.data.ctype) return;
    this.setData({ ctype: t });
    this.applyFilter(true);
  },

  onClear() {
    this.setData({ keyword: '', hasKeyword: false });
    this.applyFilter(true);
  },

  // 排序：综合 / 评分 / 好评率 / 评论数 四档，直接点选
  onSortPick(e) {
    const sort = String(e.currentTarget.dataset.s || 'default');
    if (!sort || sort === this.data.sort) return;
    this.setData({ sort });
    this.applyFilter(true);
    const hit = SORT_ITEMS.filter((o) => o.k === sort)[0];
    if (hit && hit.k !== 'default') {
      wx.showToast({ title: '按' + hit.label + '排序', icon: 'none', duration: 1200 });
    }
  },

  applyFilter(reset) {
    // 老师档走自己那套：字段名和排序口径都不一样，硬合并只会互相牵制
    if (this.data.scope === 'teacher') { this.applyTeacherFilter(); return; }
    let list = this._all.slice();
    const kw = this.data.keyword.trim();
    // 关键字状态下，学院 / 类型筛选会跟模糊搜索互相打架（搜「高等数学」又被学院卡住，
    // 明明搜到了却看不见），所以有关键字时先不管这两层；对应 chip 会置灰提示
    const collegeOn = this.data.college && this.data.college !== '全部' && !kw;
    if (collegeOn) {
      list = list.filter((c) => c.college === this.data.college);
    }
    // 每个类型有多少门，直接写在 chip 上。
    // 官方课目录里 900 门几乎全是专业课，「体育课 / 思政课」这档可能就是 0 ——
    // 与其让同学点进去才发现空，不如提前把数字摆出来
    const ctypeCounts = {};
    CTYPES.forEach((t) => { ctypeCounts[t] = 0; });
    ctypeCounts['全部'] = list.length;
    list.forEach((c) => {
      const t = String(c.ctype || '专业必修');
      if (ctypeCounts[t] === undefined) ctypeCounts[t] = 0;
      ctypeCounts[t] += 1;
    });
    this.setData({ ctypeCounts: ctypeCounts });

    // 课程类型二级筛选：学院里再分一层（必修 / 选修 / 通识 / 体育 / 思政）
    const ctypeOn = this.data.ctype && this.data.ctype !== '全部' && !kw;
    if (ctypeOn) {
      list = list.filter((c) => (c.ctype || '专业必修') === this.data.ctype);
    }

    let fuzzyCount = 0;
    if (kw) {
      const ranks = {};
      const exact = this.data.mode === 'exact';
      list.forEach((c) => {
        const lv = matchLevel(c, kw);
        if (lv < 0) return;
        // 精准档只留「原样命中」，其余一律不算
        if (exact && lv > MATCH_RANK.contain) return;
        if (lv > MATCH_RANK.contain) fuzzyCount += 1;
        ranks[c.id] = { lv: lv, hit: hitCount(c.name, kw) };
      });
      list = list.filter((c) => ranks[c.id]);
      // 排序：先按匹配方式（完全一致 / 包含 / 拼字 / 错字 / 乱序），再按命中字数
      list.sort((a, b) => {
        const x = ranks[a.id], y = ranks[b.id];
        return (x.lv - y.lv) || (y.hit - x.hit);
      });
    }

    this.applyCourseSort(list);
    this._view = list;
    this._fuzzyCount = fuzzyCount;
    this.render(0);
  },

  // 课程档排序：综合（默认，900 门官方课按库内顺序）/ 评分 / 好评率 / 评论数。
  // 三种数值排序都把「还没有评价」的沉到底：一排「0.0 分」「0% 好评」的空课在前面，
  // 看上去就像数据坏了 —— 有评价的课才有资格排前面
  applyCourseSort(list) {
    const s = this.data.sort;
    if (s === 'score') {
      list.sort((a, b) => {
        const ra = Number(a.reviewCount) || 0, rb = Number(b.reviewCount) || 0;
        if (!ra && !rb) return 0;
        if (!ra) return 1;
        if (!rb) return -1;
        return Number(b.avgScore) - Number(a.avgScore);
      });
    } else if (s === 'goodrate') {
      list.sort((a, b) => {
        const ra = Number(a.reviewCount) || 0, rb = Number(b.reviewCount) || 0;
        if (!ra && !rb) return 0;
        if (!ra) return 1;
        if (!rb) return -1;
        return (Number(b.goodRate) || 0) - (Number(a.goodRate) || 0)
          || (Number(b.avgScore) - Number(a.avgScore));
      });
    } else if (s === 'comments') {
      list.sort((a, b) => (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0));
    }
  },

  // 老师档的筛选：和课程档同一套「精准 / 模糊」逻辑，只是匹配文本换成「姓名 + 学院」。
  // 单独写一份而不是硬塞进 applyFilter —— 两边的字段名、排序口径全不一样，
  // 混在一个函数里，以后改任何一边都得把两边一起想，早晚出错。
  applyTeacherFilter() {
    const kw = this.data.keyword.trim();
    const exact = this.data.mode === 'exact';
    let list = (this._teachers || []).slice();

    let fuzzyCount = 0;
    if (kw) {
      const ranks = {};
      list.forEach((t) => {
        const lv = matchLevel({ name: t.name, major: '', college: t.college }, kw);
        if (lv < 0) return;
        if (exact && lv > MATCH_RANK.contain) return;
        if (lv > MATCH_RANK.contain) fuzzyCount += 1;
        ranks[t.name] = { lv: lv, hit: hitCount(t.name, kw) };
      });
      list = list.filter((t) => ranks[t.name]);
      list.sort((a, b) => {
        const x = ranks[a.name], y = ranks[b.name];
        return (x.lv - y.lv) || (y.hit - x.hit);
      });
    } else if (this.data.sort === 'score') {
      // 按老师分排：还没人打分的沉到底
      list.sort((a, b) => {
        if (!a.count && !b.count) return 0;
        if (!a.count) return 1;
        if (!b.count) return -1;
        return Number(b.avg) - Number(a.avg);
      });
    } else if (this.data.sort === 'goodrate') {
      // 按好评率排：4 星及以上评价的占比，无评价的沉到底，同率再比均分
      list.sort((a, b) => {
        if (!a.count && !b.count) return 0;
        if (!a.count) return 1;
        if (!b.count) return -1;
        return (Number(b.goodRate) || 0) - (Number(a.goodRate) || 0)
          || (Number(b.avg) - Number(a.avg));
      });
    } else if (this.data.sort === 'comments') {
      // 按评价条数排：讨论最多的老师排前面
      list.sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    } else {
      // 综合档：有人评价过的排前面（名录里光有名字的那些，点进去是空的）
      list.sort((a, b) => (b.count ? 1 : 0) - (a.count ? 1 : 0) || b.avg - a.avg || a.name.localeCompare(b.name));
    }
    this._view = list;
    this._fuzzyCount = fuzzyCount;
    this.render(0);
  },

  // 从 start 开始渲染一页
  render(start) {
    const size = start + PAGE_SIZE;
    const slice = this._view.slice(0, size);
    const kw = this.data.keyword.trim();
    if (this.data.scope === 'teacher') {
      this.setData({
        display: slice.map((t) => Object.assign({}, t, {
          // 老师分没人打过就是 0，页面上显示「还没人打分」，不拿课程分冒充
          hasScore: Number(t.avg) > 0
        })),
        total: this._view.length,
        fuzzyCount: kw ? (this._fuzzyCount || 0) : 0,
        hasMore: size < this._view.length
      });
      return;
    }
    this.setData({
      display: slice.map((c) => Object.assign({}, c, {
        starOn: Math.round(Number(c.avgScore))
      })),
      total: this._view.length,
      // 有几门是靠模糊匹配捞回来的，页面要如实说出来，不然同学不知道结果为什么这么杂
      fuzzyCount: kw ? (this._fuzzyCount || 0) : 0,
      hasMore: size < this._view.length
    });
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    this.render(this.data.display.length);
  },

  // 老师档点一条 → 老师评价页；课程档点一条 → 课程详情页
  onTapItem(e) {
    const d = e.currentTarget.dataset;
    if (this.data.scope === 'teacher') {
      if (!d.name) return;
      wx.navigateTo({ url: '/pages/course/teacher/teacher?name=' + encodeURIComponent(d.name) });
      return;
    }
    if (!d.id) return;
    wx.navigateTo({ url: '/pages/course/detail/detail?id=' + d.id });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/course/detail/detail?id=' + e.currentTarget.dataset.id });
  }
});
