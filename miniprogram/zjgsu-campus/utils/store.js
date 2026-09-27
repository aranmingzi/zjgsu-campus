// utils/store.js —— 数据层（本地存储 + 云开发双模式）
//
// 对外接口（保持兼容）：
//   initStore / getUser / setUser / getCourses / getCourseById / getColleges
//   findCourseByName / addCourse / getReviews / addReview / getMyReviews
//   getBoards / getPosts / getPostById / addPost / addComment / toggleLike / getMyPosts
//
// 本次升级新增：
//   getCourseInsight(courseId) —— 课程「决策卡」数据：均分、评分分布、标签热度、一句话结论；
//   updateReview / removeReview —— 自己发的评价可改可删（本地 + 云端同步）；
//   loadMorePosts() —— 云端分页，触底继续拉，不再一次全量；
//   ensureSeed() —— 云端空库时自动灌入示例内容，解决新用户「进来一片空白」；
//   addPost 支持 images（论坛配图，上传到云存储拿 fileID）。
//
// 隐私：评价默认匿名，展示时统一替换成「匿名同学」；自己那条靠 openid 认领，不做删除后还能被别人改。

const seed = require('../data/seed.js');
const cloud = require('./cloud.js');
// 精准 / 模糊的搜索内核（全站共用）
const searchCore = require('./search.js');

const KEYS = {
  courses: 'zjgsu_courses',
  userCourses: 'zjgsu_user_courses', // 同学自建课程（本地镜像，云端正源）
  reviews: 'zjgsu_reviews',
  boards: 'zjgsu_boards',
  posts: 'zjgsu_posts',
  user: 'zjgsu_user',
  // 赞 / 踩：一份统一的投票记录 { 帖子id: 'like' | 'dislike' }。
  // 早先只有点赞（zjgsu_liked_set，值是 true），加了点踩之后两份数据各写各的、
  // 「我到底赞过还是踩过」就会打架，所以收敛成一份。
  // 老数据里的 liked_set 只在读取时兜一下，写入一律走 voteSet
  likedSet: 'zjgsu_liked_set',
  voteSet: 'zjgsu_votes',
  seedVer: 'zjgsu_seed_version',
  // 删除墓碑：本地已删的内容 id。云端删除失败（没权限/没网）时，
  // 下次同步靠它过滤，否则帖子会「删了重进又回来」
  tomb: 'zjgsu_deleted_ids',
  // 搜索历史：最近搜过的几个词，列表页直接展示，省得用户反复回忆怎么打
  searchHistory: 'zjgsu_search_history',
  // 收藏：本地一份用于秒开，云端一份用于跨设备
  favorites: 'zjgsu_favorites',
  // 草稿：发帖 / 写评价写到一半退出来，下次接着写
  drafts: 'zjgsu_drafts',
  // 我举报过哪些内容：{ 帖子id: true }。
  // 只用来把按钮变成「已举报」——同一个人对同一条内容重复举报，服务端本来就会去重，
  // 但按钮不变的话用户会以为自己没点上，一遍遍地戳
  reportedSet: 'zjgsu_reported',
  // 留言删除墓碑：{ 留言id: true }。
  // 留言是存在帖子里面的，云端那一刀砍的是帖子的 comments 数组；
  // 而手机上的本地缓存只会在同步时整条替换，翻页之外的地方并不会立刻刷新。
  // 少了这块墓碑，一条「多人举报已经自动删掉」的留言会在别人手机上继续挂着，
  // 看起来就像举报功能没生效
  commentTomb: 'zjgsu_removed_comments',
  // 课程类型纠错：{ 课程id: '体育课' | ... }。官网课程目录不带「课程性质」，
  // 类型是按课名猜的，猜错的（比如「实验心理学」被当成通识课）由同学自己纠正。
  // 本机一份立即生效，云端 course_types 集合一份给所有同学共享
  ctypeFix: 'zjgsu_ctype_fixes'
};

// seed 数据版本号：改动 seed 后 +1，即可让所有老用户刷新到新示例数据
// v5：论坛板块新增「闲聊」（发帖页的默认板块）
// v6：新增「社团同好」板块 + 三条起步内容（社团 / 摄影同好 / 考研搭子）
// v7：新增一条「只发主题」的信息墙样板帖（浙工商同好群）——
//     加了新帖型却让老用户看不到，这个功能等于没上线
const SEED_VERSION = '2026-09-26-add-topic-post-v7';

// 论坛一页条数：列表页触底加载，避免一次拉全量导致卡顿和流量浪费
const PAGE_SIZE = 20;

// 课程列表一屏渲染条数：课程库有 900+ 门，一次全渲染会把渲染层压垮
const COURSE_PAGE_SIZE = 30;

// 匿名展示统一用的昵称
const ANON_NAME = '匿名同学';

// 树洞板块名：树洞是独立区域，帖子只进树洞页，主论坛的「全部」和板块筛选里都不出现
const HOLE_BOARD = '树洞';

// 示例内容的 id 索引：KEEP_SEED_CONTENTS=false 时用于在展示层过滤掉示例帖/示例评价
const SEED_POST_IDS = {};
const SEED_REVIEW_IDS = {};
seed.posts.forEach((p) => { SEED_POST_IDS[p.id] = true; });
seed.reviews.forEach((r) => { SEED_REVIEW_IDS[r.id] = true; });
function keepContents() {
  return !!cloud.cfg.KEEP_SEED_CONTENTS;
}

/* ---------------- 删除墓碑 ---------------- */

function tombRead() {
  const t = read(KEYS.tomb, {});
  if (!t.posts) t.posts = {};
  if (!t.reviews) t.reviews = {};
  return t;
}
function addTombstone(type, id) {
  if (!id) return;
  const t = tombRead();
  t[type][id] = true;
  // 防止无限膨胀：超过 500 条时丢掉最早记录的一批
  const keys = Object.keys(t[type]);
  if (keys.length > 500) keys.slice(0, 200).forEach((k) => { delete t[type][k]; });
  write(KEYS.tomb, t);
}
function notTombstoned(type) {
  const t = tombRead();
  return (x) => !t[type][x.id];
}

// 留言删除墓碑的读法。读的时候兜一下脏数据：
// read 拿到的是空字符串时会返回兜底值，但万一里面存了别的东西
// （比如哪次写成了数组），过滤就得按对象来，别把「已删」误判成「没删」
function commentTomb() {
  const t = read(KEYS.commentTomb, {});
  return (t && typeof t === 'object' && !Array.isArray(t)) ? t : {};
}

function read(key, fallback) {
  const v = wx.getStorageSync(key);
  return (v === '' || v === undefined || v === null) ? fallback : v;
}
function write(key, val) {
  wx.setStorageSync(key, val);
}
function myOpenid() {
  return cloud.cfg.USE_CLOUD ? (cloud.getOpenid() || '') : '';
}
function today() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function genId() {
  return 'u' + Date.now() + Math.floor(Math.random() * 1000);
}

// 身份常常比页面晚一步到：login 云函数要跑一个网络来回，
// 用户可能刚进来就发帖。没身份就往云里发，一定被「无法识别用户身份」驳回，
// 用户白写一场。所以这里先等等它，最多 2.5 秒。
async function waitOpenid() {
  if (myOpenid()) return true;
  try {
    await cloud.fetchOpenid();
  } catch (e) {}
  return !!myOpenid();
}

// 身份迟迟拿不到时给页面一份诊断：重试了几次。
// 试了三四回还是空，多半是 login 云函数没部署，这时候让用户「退出重进」没用，
// 该提示的是去控制台部署云函数
function openidTrouble() {
  const t = cloud.openidTrouble ? cloud.openidTrouble() : null;
  return {
    ok: !!(t && t.ok),
    tried: (t && t.tried) || 0,
    msg: (t && !t.ok && t.tried >= 3)
      ? '身份一直没拿到，多半是 login 云函数还没部署。去微信开发者工具右键 cloudfunctions/login 上传部署一次。'
      : ''
  };
}

/* ---------------- 云端同步 ---------------- */

// 云端分页游标：已经从云端「按顺序」取回了多少条，下次接着往下翻
let cloudPulled = 0;

// 从云端分页拉帖子：pages 表示拉几页，返回本次拿到的条数
// 两处性能处理：
//   ① 多页「同时发请求」而不是一页等一页——原来串行两页 = 两轮网络往返，现在一轮；
//   ② 必须把几页「合并后」再写回缓存——之前每页直接覆盖，两页时本地只剩第二页，
//      用户最新发的帖子（第一页）会被冲掉，看起来就是「我的帖子丢了」
// fromTop=true 表示重新从最新一页开始拉（下拉刷新用）
async function fetchPostsFromCloud(pages, fromTop) {
  if (!cloud.ensureCloud()) return 0;
  const n = Math.max(1, pages || 1);
  if (fromTop) cloudPulled = 0;

  const tasks = [];
  for (let i = 0; i < n; i += 1) {
    tasks.push(cloud.db().collection('posts')
      .orderBy('time', 'desc').skip(cloudPulled + i * PAGE_SIZE).limit(PAGE_SIZE).get()
      .catch(() => null));
  }
  const results = await Promise.all(tasks);

  const fetched = [];
  results.forEach((r) => {
    if (r && r.data && r.data.length) fetched.push(...r.data);
  });
  if (!fetched.length) return 0;

  const inCloud = {};
  fetched.forEach((p) => { inCloud[p.id] = true; });
  // 已删的帖子绝不复活：云端删除偶尔会失败（权限/网络），同步时靠墓碑挡住
  const alive = notTombstoned('posts');
  // 示例内容开关关闭时，云端拉回来的示例帖也不进缓存
  const fromCloud = (keepContents() ? fetched : fetched.filter((p) => !SEED_POST_IDS[p.id])).filter(alive);
  if (!fromCloud.length) {
    cloudPulled += fetched.length;
    return 0;
  }
  const localOnly = read(KEYS.posts, []).filter((p) => !inCloud[p.id] && alive(p) && (keepContents() || !SEED_POST_IDS[p.id]));
  write(KEYS.posts, fromCloud.concat(localOnly));
  cloudPulled += fetched.length;
  return fromCloud.length;
}

// 手动再来一遍云端同步。详情页找不到课程时用它自救：
// 数据没同步全（换设备、刚清过缓存）时，重拉一次多半就回来了。
function syncNow() {
  if (!cloud.ensureCloud()) return Promise.resolve(false);
  return syncFromCloud().catch(() => false);
}

// 启动后从云端拉取评价与帖子，并把“我点赞过的帖子”标记下来
async function syncFromCloud() {
  if (!cloud.ensureCloud()) return;
  try {
    const db = cloud.db();
    const oid = myOpenid();

    // 四条互不依赖的查询并行发出，原来串行要等三轮网络往返
    const [revRes, crsRes, likeRes, disRes] = await Promise.all([
      db.collection('reviews').limit(500).get().catch(() => null),
      // 同学自建课程单独容错：集合还没建时不影响评价/帖子同步
      db.collection('courses').limit(500).get().catch(() => null),
      // 「我赞过」的去向：以前读 likes 集合，可投票早就收口到服务端了，
      // 那个集合现在没人往里写 —— 换手机、清缓存后绿心永远回不来。
      // 改成问帖子自己：数组字段包含匹配，正好只取得到跟我有关的那些
      oid
        ? db.collection('posts').where({ likedBy: oid }).limit(100).get().catch(() => null)
        : Promise.resolve(null),
      oid
        ? db.collection('posts').where({ dislikedBy: oid }).limit(100).get().catch(() => null)
        : Promise.resolve(null)
    ]);

    if (revRes && revRes.data) {
      // 示例评价开关关闭时，云端拉回来的示例评价不进缓存；已删的评价靠墓碑挡住
      const alive = notTombstoned('reviews');
      const revs = (keepContents() ? revRes.data : revRes.data.filter((r) => !SEED_REVIEW_IDS[r.id])).filter(alive);
      write(KEYS.reviews, revs);
    }
    if (crsRes && crsRes.data) write(KEYS.userCourses, crsRes.data);
    // 写进统一的投票记录：老版本的 liked_set 只记 true，用来认「点过赞」。
    // 摊平在新列里，升级后既不会丢点赞状态，也不会和点踩打架
    if (likeRes && likeRes.data || disRes && disRes.data) {
      const set = read(KEYS.voteSet, {});
      (likeRes && likeRes.data || []).forEach((p) => { set[p.id] = 'like'; });
      (disRes && disRes.data || []).forEach((p) => { set[p.id] = 'dislike'; });
      write(KEYS.voteSet, set);
    }

    refreshCourses();
    // 首屏只拉一页就先渲染：原来一上来拉两页，等于多等一轮网络往返才出内容
    await fetchPostsFromCloud(1);
  } catch (e) {
    // 云端读取失败不阻塞本地使用
  }
  // 冷启动兜底：云端一条内容都没有时，把示例内容补进去
  ensureSeed();
}

// 触底加载：再拉一页帖子（fromTop 传给下拉刷新用）
function loadMorePosts(fromTop) {
  return fetchPostsFromCloud(1, !!fromTop).then((n) => n > 0);
}

// 冷启动种子：云端 posts 为空时，让云函数把示例内容写进去（只做一次）
// KEEP_SEED_CONTENTS=false 时整段跳过——不再往云端灌示例
function ensureSeed() {
  if (!keepContents()) return Promise.resolve(false);
  if (!cloud.cfg.USE_CLOUD || !cloud.ensureCloud()) return Promise.resolve(false);
  const localPosts = read(KEYS.posts, []);
  if (localPosts.length > 0) return Promise.resolve(false);
  try {
    return wx.cloud.callFunction({
      name: 'user',
      data: {
        action: 'ensureSeed',
        reviews: seed.reviews,
        posts: seed.posts
      }
    }).then((res) => !!(res && res.result && res.result.ok)).catch(() => false);
  } catch (e) {
    return Promise.resolve(false);
  }
}

// 课程的「身份证」必须是唯一的，否则后面全乱：同一条课在列表里出现两次、
// 点进去找不到（详情页白屏）、删课删错对象。
// 老数据云端只给了 _id，前端那个 id 是空 —— 这里补一个稳定的，并且写回本地，
// 下次同步接着用同一个，不会一条课变出好几个身份。
function ensureCourseId(c) {
  if (!c) return '';
  if (c.id) return c.id;
  if (c._id) { c.id = String(c._id); return c.id; }
  c.id = 'u' + Date.now() + Math.floor(Math.random() * 1000);
  return c.id;
}

// 课程目录 = 官方 seed 课程 + 同学自建课程（自建排在前，避免被官方目录吞掉）
function refreshCourses() {
  const mine = read(KEYS.userCourses, []);
  // 顺手把缺 id 的自建课补上 id 并落盘：只补在内存里的话，
  // 下次读缓存又是没 id 的那条，白屏会一直复发
  let patched = false;
  mine.forEach((c) => {
    if (!c) return;
    if (!c.id) { ensureCourseId(c); patched = true; }
  });
  if (patched) write(KEYS.userCourses, mine);

  const seen = {};
  const out = [];
  mine.forEach((c) => { if (c && !seen[c.id]) { seen[c.id] = true; out.push(c); } });
  seed.courses.forEach((c) => { if (!seen[c.id]) { seen[c.id] = true; out.push(c); } });
  write(KEYS.courses, out);
}

function initStore() {
  // seed 升级时刷新板块/示例帖：只补进官方示例，同学自己发的帖不会被覆盖
  if (wx.getStorageSync(KEYS.seedVer) !== SEED_VERSION) {
    write(KEYS.boards, seed.boards);
    const oldPosts = read(KEYS.posts, []);
    const oldReviews = read(KEYS.reviews, []);
    if (keepContents()) {
      const seedIds = {};
      seed.posts.forEach((p) => { seedIds[p.id] = true; });
      const minePosts = oldPosts.filter((p) => !seedIds[p.id]);
      write(KEYS.posts, seed.posts.concat(minePosts));
      // 评价也补：老用户能把新示例评价刷下来
      const revIds = {};
      oldReviews.forEach((r) => { revIds[r.id] = true; });
      const mineReviews = oldReviews.filter((r) => !revIds[r.id]);
      write(KEYS.reviews, seed.reviews.concat(mineReviews));
    } else {
      // 示例内容关闭：把示例帖/评价从本地清掉（同学自己发的都保留）
      write(KEYS.posts, oldPosts.filter((p) => !SEED_POST_IDS[p.id]));
      write(KEYS.reviews, oldReviews.filter((r) => !SEED_REVIEW_IDS[r.id]));
    }
    write(KEYS.seedVer, SEED_VERSION);
  }
  refreshCourses();
  if (!wx.getStorageSync(KEYS.reviews)) write(KEYS.reviews, []);
  if (!wx.getStorageSync(KEYS.posts)) write(KEYS.posts, []);
  if (cloud.cfg.USE_CLOUD) {
    syncFromCloud();
    // 换设备后把云端那侧收藏补回本地；本机刚收藏的排前面，云端旧的往后靠
    pullFavorites().then((list) => { if (list) mergeFavorites(list); });
  }
}

// 云端收藏合并回本地：本机已有的不动（刚点的更实时），只补本机没有的部分
function mergeFavorites(remote) {
  if (!Array.isArray(remote) || !remote.length) return;
  const local = getFavorites();
  const has = {};
  local.forEach((f) => { has[f.type + '|' + f.id] = true; });
  const add = remote
    .filter((f) => f && f.id && !has[f.type + '|' + f.id])
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  if (!add.length) return;
  write(KEYS.favorites, local.concat(add).slice(0, FAV_MAX));
}

/* ---------------- 用户 ---------------- */

function getUser() {
  return read(KEYS.user, { nickName: '浙小商', avatar: '', motto: '浙江工商大学 · 在读' });
}
function setUser(user) {
  write(KEYS.user, user);
}

/* ---------------- 课程评价 ---------------- */

// 平均分实时由评价列表计算（跨设备一致），不再依赖课程对象里的计数器
function calcStats(course, reviews) {
  const cr = reviews.filter((r) => r.courseId === course.id);
  const avg = cr.length
    ? (cr.reduce((s, r) => s + Number(r.score), 0) / cr.length).toFixed(1)
    : '0.0';

  // 分布 + 标签热度一次遍历算完：原来要扫 6 遍评价数组，900 门课时直接把 JS 线程跑满
  const buckets = {};
  const heat = {};
  cr.forEach((r) => {
    const s = Number(r.score);
    buckets[s] = (buckets[s] || 0) + 1;
    (r.tags || []).forEach((t) => { heat[t] = (heat[t] || 0) + 1; });
  });
  const dist = [];
  for (let s = 5; s >= 1; s -= 1) {
    dist.push({ star: s, count: buckets[s] || 0 });
  }
  const tagList = Object.keys(heat).map((k) => ({ name: k, count: heat[k] }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  return {
    avgScore: avg,
    reviewCount: cr.length,
    starOn: Math.round(Number(avg)),
    dist,
    tags: tagList,
    hotTag: tagList.length ? tagList[0].name : ''
  };
}

// 课程页顶部的「决策卡」：让查课的同学直接看到结论，而不是自己去翻评论
function getCourseInsight(courseId) {
  const course = getCourseById(courseId);
  if (!course) return null;
  const reviews = read(KEYS.reviews, []);
  const stats = calcStats(course, reviews);
  if (!stats.reviewCount) {
    return Object.assign({}, course, stats, { summary: '还没有人评价，做第一个吧' });
  }
  let summary;
  if (stats.reviewCount < 3) {
    // 样本太少不下结论，只陈述事实，免得误导后面选课的人
    summary = '综合 ' + stats.avgScore + ' 分，目前只有 ' + stats.reviewCount + ' 条评价，样本还少，建议看看原文';
  } else if (Number(stats.avgScore) >= 4) {
    summary = '综合 ' + stats.avgScore + ' 分，' + stats.reviewCount + ' 条评价里多数人提到「' + stats.hotTag + '」';
  } else {
    summary = '综合 ' + stats.avgScore + ' 分，评价偏谨慎，' + stats.reviewCount + ' 条里常提到「' + stats.hotTag + '」，选课前建议看看原文';
  }
  return Object.assign({}, course, stats, { summary });
}

// 课程列表用的轻量统计：只算均分 / 评价数 / 星级 / 最热标签，不整块重算分布
// 列表页要渲染几十门课，逐门跑 calcStats 会在低端机上明显掉帧
// 结果按「评价数组的引用」缓存：评价没变就不重算，搜索框每敲一个字也不再反复扫 900 门课
//
// goodRate（好评率）= 打 4 星及以上的评价占比（百分比整数，四舍五入）。
// 「评分高」和「多数人说好」是两件事：一门 3.8 分但人人都说「还行」的课，
// 比一门 4.2 分但一半人给 1 星的课更值得选，排序时这是独立的一档。
let _statsCache = null;
function courseStatsMap() {
  const reviews = read(KEYS.reviews, []);
  if (_statsCache && _statsCache.src === reviews) return _statsCache.map;
  const map = {};
  reviews.forEach((r) => {
    const id = r.courseId;
    if (!id) return;
    let s = map[id];
    if (!s) {
      s = map[id] = { sum: 0, count: 0, good: 0, heat: {} };
    }
    s.sum += Number(r.score) || 0;
    s.count += 1;
    if ((Number(r.score) || 0) >= 4) s.good += 1;
    (r.tags || []).forEach((t) => { s.heat[t] = (s.heat[t] || 0) + 1; });
  });
  Object.keys(map).forEach((id) => {
    const s = map[id];
    const avg = s.sum / s.count;
    const hot = Object.keys(s.heat).sort((a, b) => s.heat[b] - s.heat[a])[0] || '';
    map[id] = {
      avgScore: avg.toFixed(1),
      reviewCount: s.count,
      starOn: Math.round(avg),
      hotTag: hot,
      goodRate: Math.round((s.good / s.count) * 100)
    };
  });
  _statsCache = { src: reviews, map: map };
  return map;
}

// 没有评价时的空统计（goodRate 用 -1 表示「还没人评，没有好评率」）
const EMPTY_STATS = { avgScore: '0.0', reviewCount: 0, starOn: 0, hotTag: '', goodRate: -1 };

// 课程类型（专业必修 / 专业选修 / 通识课 / 体育课 / 思政课）。
// 老用户的本地课程缓存没有 ctype 字段（该字段是后加的），存储不能整份重写，
// 所以展示层统一在这里补：有 ctype 的照用，没有的按课名推断并缓存。
// 推断函数全站只有 seed.js 那一份，改判据只动那里。
const _ctypeCache = {};
// 课程类型纠错表：课程 id → 同学纠正后的类型。
// 缓存一份在内存里，setCourseType 写完置空，下次读库自动生效
let _ctypeFixes = null;
function ctypeFixMap() {
  if (_ctypeFixes) return _ctypeFixes;
  _ctypeFixes = read(KEYS.ctypeFix, {});
  return _ctypeFixes;
}

function attachCourseType(c) {
  // 同学纠正过的类型优先级最高：不管课名像什么，以纠错为准。
  // 这是「按类型筛选」能不能让人信得过的关键 —— 猜错了还没处改，筛选就废了
  const fixed = ctypeFixMap()[c.id];
  if (fixed) return Object.assign({}, c, { ctype: fixed });
  if (c.ctype) return c;
  if (_ctypeCache[c.name]) {
    return Object.assign({}, c, { ctype: _ctypeCache[c.name] });
  }
  const t = seed.guessCourseType(c.name);
  _ctypeCache[c.name] = t;
  return Object.assign({}, c, { ctype: t });
}

// 同学纠正一门课的类型：本机立即生效，云端异步存（所有同学共享这份纠正）。
// 返回云端结果 —— 云端没存住要如实说，别让改的人以为全校都已经看到
function setCourseType(id, ctype) {
  if (!id) return Promise.resolve({ ok: false, msg: '课程 id 丢了，改不了' });
  const t = seed.pickCourseType(ctype, '');
  const map = read(KEYS.ctypeFix, {});
  map[id] = t;
  write(KEYS.ctypeFix, map);
  _ctypeFixes = null;
  return require('./user.js').courseTypeSet(id, t)
    .then((r) => r || { ok: false, saved: false, msg: '云端连不上，先记在你手机上' });
}

// 开机拉一次全校的课程类型纠正，跟本机的合并。
// 一次就够：纠错数据很小，改动频率低，每次进页面都拉是浪费
let _ctypeSynced = false;
function syncCourseTypes() {
  if (_ctypeSynced) return;
  if (!cloud.cfg.USE_CLOUD || !cloud.ensureCloud()) return;
  _ctypeSynced = true;
  require('./user.js').courseTypeList().then((r) => {
    if (!r || r.ok === false || !r.fixes) return;
    const map = read(KEYS.ctypeFix, {});
    Object.keys(r.fixes).forEach((k) => { map[k] = r.fixes[k]; });
    write(KEYS.ctypeFix, map);
    _ctypeFixes = null;
  }).catch(() => { _ctypeSynced = false; });
}

function getCourses() {
  const stats = courseStatsMap();
  return read(KEYS.courses, []).map((c) => attachCourseType(Object.assign({}, c, stats[c.id] || EMPTY_STATS)));
}

function getCourseById(id) {
  const list = read(KEYS.courses, []);
  const c = list.find((x) => x.id === id);
  if (!c) return null;
  const stats = courseStatsMap()[c.id] || EMPTY_STATS;
  return attachCourseType(Object.assign({}, c, stats));
}

function getColleges() {
  return seed.colleges;
}

// 按课程名查重：避免同学把同一门课重复添加多次
function findCourseByName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const list = read(KEYS.courses, []);
  return list.find((c) => c.name === n) || null;
}

// 同学自建课程：官方目录覆盖不到的课由同学互助补齐，写入云端供全校共享
function addCourse({ name, college, major, credit, ctype }) {
  const course = {
    id: 'u' + Date.now() + Math.floor(Math.random() * 1000),
    name: String(name || '').trim(),
    college: college || '其他学院',
    major: major || '未分类',
    credit: Number(credit) || 3,
    tags: ['同学共建'],
    description: '同学互助添加的课程，还没有人写描述～ 快来补一条真实评价帮到学弟学妹。',
    builtin: false,
    // 课程类型：加课的人在页面上挑了就以他挑的为准，没挑才按课名推断
    // （官方目录几乎全是专业课，光看名字推不出体育课 / 思政课）
    ctype: seed.pickCourseType(ctype, name),
    // 谁加的必须记下来：不然误加了想删的时候，认不出这门课归谁，
    // 就只能删所有人的课（危险）或者谁都删不掉（就是之前的状况）
    openid: myOpenid()
  };
  const list = read(KEYS.userCourses, []);
  list.unshift(course);
  write(KEYS.userCourses, list);
  refreshCourses();

    if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
      // 走云函数：课程名也会被拿来塞广告，服务端一并过审
      try { require('./user.js').courseAdd(course); } catch (e) {}
    }
    return course;
}

// 这门课是不是「我加的」：
// ① 官方课程（builtin === true）谁都删不了；
// ② 双方 openid 都在手 → 严格比对，这是最可靠的一档；
// ③ 我是新加的课但本地还没拿到 openid（冷启动）→ 按 builtin === false 放行，
//    否则用户会碰上「自己刚加的课删不掉」；
// ④ 课上有别人的 openid 而我没有 → 不放行。
function isMineCourse(c) {
  if (!c) return false;
  if (c.builtin === true) return false;
  const oid = myOpenid();
  const owner = c.openid || c._openid || '';
  if (oid && owner) return owner === oid;
  if (owner && !oid) return false;   // 是别人加的，我还没拿到身份也不能删
  return c.builtin === false;        // 没有归属信息的旧数据：自建课程放行
}

// 删除同学自己误加的课程。
// 比删帖子多一道顾虑：这门课可能已经有人写过评价了，不能把别人的内容一起弄丢。
// 所以先查有没有评价，有就拦下来问清楚，由调用方决定要不要继续。
async function removeCourse(id, opts) {
  const force = !!(opts && opts.force);
  const course = read(KEYS.courses, []).find((c) => c.id === id);
  if (!course) return { ok: false, msg: '这门课找不到了' };
  if (course.builtin === true) return { ok: false, msg: '官方课程不能删除' };
  if (!isMineCourse(course)) return { ok: false, msg: '只能删除自己添加的课程' };

  // 有人评价过：除非明确说 force，否则先告诉调用方，别默默把别人的评价变成孤儿
  const used = read(KEYS.reviews, []).filter((r) => r.courseId === id);
  if (used.length && !force) {
    return { ok: false, needConfirm: true, reviewCount: used.length, msg: '这门课下已经有 ' + used.length + ' 条评价' };
  }

  // 先删云端再删本地：云端留一份没删掉的话，下次同步那门误加的课又会冒出来
  // （跟「删了重进还在」是同一个坑）。云端确认删掉了，本地才清。
  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    try {
      const r = await require('./user.js').courseRemove(id, course.name);
      if (r && r.ok === false) {
        return { ok: false, saved: false, msg: r.msg || '云端没能删掉', detail: r.detail || '' };
      }
    } catch (e) {
      return { ok: false, saved: false, msg: '云端暂时连不上，稍后再删', detail: String((e && e.message) || e || '') };
    }
  }

  write(KEYS.userCourses, read(KEYS.userCourses, []).filter((c) => c.id !== id));
  refreshCourses();
  // 连评价一起清：课程都没了，挂在它下面的评价点进去是无主页面
  if (used.length) {
    write(KEYS.reviews, read(KEYS.reviews, []).filter((r) => r.courseId !== id));
  }
  return { ok: true, reviewCount: used.length };
}

// 只清本地那份。用在「申请删除」凑够票的场景：
// 云端那边已经由云函数删掉了，前端再调一次 courseRemove 只会得到「只能删除自己添加的课程」，
// 所以这里不走权限校验，纯粹是把本地这份镜像丢掉，评价也一起清（否则点进去是无主页面）。
function dropCourseLocal(id) {
  const n = read(KEYS.reviews, []).filter((r) => r.courseId === id).length;
  write(KEYS.userCourses, read(KEYS.userCourses, []).filter((c) => c.id !== id));
  if (n) write(KEYS.reviews, read(KEYS.reviews, []).filter((r) => r.courseId !== id));
  refreshCourses();
  return { ok: true, reviewCount: n };
}

// 判断某条评价是不是「我」发的：和帖子一套逻辑（见 isMinePost 的说明）
function isMineReview(r) {
  const myOid = myOpenid();
  const rOid = r.openid || r._openid || '';
  if (myOid && rOid) return rOid === myOid;
  return !!r.nickName && r.nickName === getUser().nickName;
}

// 评价展示：匿名的一律显示成「匿名同学」，真名只留在数据里给自己看
function decorateReview(r) {
  const showName = (r.anonymous || (!r.openid && !r.nickName))
    ? ANON_NAME
    : (r.nickName || ANON_NAME);
  return Object.assign({}, r, {
    showName: showName,
    isMine: isMineReview(r)
  });
}

function getReviews(courseId) {
  const list = read(KEYS.reviews, []);
  return list
    .filter(notTombstoned('reviews'))
    .filter((r) => r.courseId === courseId)
    .filter((r) => {
      if (!r.status || r.status === 'normal') return true;
      // 被下架的评价：作者本人和审核员还能看到，其余人看不到
      return isMineReview(r) || isModerator();
    })
    .sort((a, b) => (a.time < b.time ? 1 : -1))
    .map(decorateReview);
}

// 按 id 取一条评价：收藏里存了评价 id，得能拿回内容才知道标题是什么
function getReviewById(id) {
  const r = read(KEYS.reviews, []).find((x) => x.id === id);
  return r ? decorateReview(r) : null;
}

// 全部本地评价（含下架的）。老师聚合、跨课程看某位老师的评价都要遍历它，
// 不然同学补充的任课老师会和课程评价割裂成两拨数据。
function getAllReviews() {
  return read(KEYS.reviews, [])
    .filter(notTombstoned('reviews'))
    .map(decorateReview);
}

// 一门课里出现过的任课老师（同学填的 teacher 字段聚合出来的）
//
// 老师分和课程分必须分开算，这是两个意思：
// 「课给 5 分、老师给 2 分」是常态（课好、老师差），混在一起算，这位老师永远看不出问题。
// teacherScore 为 0 表示「这位同学没给老师打分」，不参与老师均分，但课程分照常计入。
const NO_TEACHER_SCORE = 0;

function scoreAvg(list) {
  if (!list.length) return 0;
  return Math.round((list.reduce((s, v) => s + v, 0) / list.length) * 10) / 10;
}

function getCourseTeachers(courseId) {
  const map = {};
  getAllReviews().forEach((r) => {
    const t = String(r.teacher || '').trim();
    if (!t || r.courseId !== courseId) return;
    if (!map[t]) {
      map[t] = {
        name: t, count: 0, verified: false,
        teacherScores: [],   // 同学们给这位老师的分，一条一个，不去重（同分两条就是两个人的意见）
        courseScores: [],    // 同一批评价里的课程分，两摊数据各算各的
        explicit: 0          // 有几个人是认认真真打了老师分的（老数据没有这个字段）
      };
    }
    const it = map[t];
    const score = Number(r.score) || 0;
    const ts = Number(r.teacherScore) || NO_TEACHER_SCORE;
    it.count += 1;
    it.courseScores.push(score);
    if (ts) {
      it.teacherScores.push(ts);
      it.explicit += 1;
    } else {
      // 老评价没填过老师分，拿课程分顶上：不然这些人的意见凭空消失，均分会一直偏低
      it.teacherScores.push(score);
    }
    // 命中过官方名录那条就一直留着勾：后续同学补充的失误不会把它抹掉
    if (r.teacherVerified) it.verified = true;
  });
  return Object.keys(map).map((k) => {
    const it = map[k];
    const avg = scoreAvg(it.teacherScores);
    return {
      name: it.name,
      count: it.count,
      verified: it.verified,
      // 老师分：没人单独打过分就先给 0，页面上显示「还没人打分」
      avg: avg,
      avgRound: Math.round(avg),
      scoredCount: it.explicit,
      // 课程分：回答「提到这位老师的这些评价里，课本身是什么水平」
      courseAvg: scoreAvg(it.courseScores)
    };
  }).sort((a, b) => b.avg - a.avg || b.count - a.count);
}

// 全站老师口碑总表：课程列表页「老师评价」那一档就靠它。
//
// 为什么不在页面里自己算：老师档要的是「按人聚合」，而评价是一条条课程评价，
// 每个人名都要把课程分和老师分两摊分开算一遍，散在页面里改起来容易一处漏。
// 口径和课程详情页「老师评价」那一栏保持一致（老数据没打老师分的拿课程分顶上）。
function getTeacherBoard() {
  const map = {};
  getAllReviews().forEach((r) => {
    const t = String(r.teacher || '').trim();
    if (!t) return;
    if (!map[t]) {
      map[t] = { name: t, count: 0, tScores: [], cScores: [], good: 0, explicit: 0, verified: false, courses: [] };
    }
    const it = map[t];
    const score = Number(r.score) || 0;
    const ts = Number(r.teacherScore) || NO_TEACHER_SCORE;
    it.count += 1;
    it.cScores.push(score);
    if (score >= 4) it.good += 1;
    if (ts) { it.tScores.push(ts); it.explicit += 1; } else { it.tScores.push(score); }
    if (r.teacherVerified) it.verified = true;
    if (r.courseId && it.courses.indexOf(r.courseId) < 0) it.courses.push(r.courseId);
  });
  return Object.keys(map).map((k) => {
    const it = map[k];
    const avg = scoreAvg(it.tScores);
    const courseAvg = scoreAvg(it.cScores);
    // 课程名在这里查好：WXML 里拿不到 id 对应的课名，列表上只显示个课程 id 没人看得懂
    const names = it.courses
      .map((cid) => (getCourseById(cid) || {}).name)
      .filter(Boolean)
      .slice(0, 2);
    return {
      name: it.name,
      count: it.count,
      verified: it.verified,
      avg: avg,
      avgRound: Math.round(avg),
      courseAvg: courseAvg,
      courseCount: it.courses.length,
      courseNames: names.join('、'),
      scoredCount: it.explicit,
      // 好评率：这门课的打分里 4 星及以上的占比；课程分与老师分共用一套口径
      goodRate: it.count ? Math.round((it.good / it.count) * 100) : -1
    };
  }).sort((a, b) => b.avg - a.avg || b.count - a.count || a.name.localeCompare(b.name));
}

// 按老师名筛评价。courseId 传了就只看这门课，不传就是全站搜这位老师。
function getReviewsByTeacher(name, courseId) {
  const n = String(name || '').trim();
  if (!n) return [];
  return getAllReviews().filter((r) => {
    if (String(r.teacher || '').trim() !== n) return false;
    if (courseId && r.courseId !== courseId) return false;
    return !r.status || r.status === 'normal' || isMineReview(r) || isModerator();
  });
}

// teacher 是同学自己填的任课老师名（可选）。选填——很多人就是想吐槽整门课，
// 强制填会把评价卡在半路；但填了就能按老师聚合，别人查老师时找得到。
// teacherScore 是「给这位老师的分」，和上面的 score（给课程的分）是两码事：
// 同学想说「课 5 分、老师 2 分」时，两栏都会记下自己的数字，不会互相污染。
// 留 0 表示这位同学没单独给老师打分，别人看那位老师时不会把他算进去。
async function addReview({ courseId, score, content, tags, anonymous = false, teacher = '', teacherVerified = false, teacherScore = 0 }) {
  const review = {
    id: genId(),
    courseId,
    nickName: getUser().nickName,
    anonymous: !!anonymous,
    score: Number(score),
    content,
    time: today(),
    tags: tags || [],
    teacher: String(teacher || '').trim(),
    teacherVerified: !!teacherVerified,
    teacherScore: Math.max(0, Math.min(5, Math.round(Number(teacherScore) || 0)))
  };
  const oid = myOpenid();
  if (oid) review.openid = oid;

  // 本地先落地，断网也能看得到自己刚写的那条（见 addPost 的说明）
  const reviews = read(KEYS.reviews, []);
  reviews.unshift(review);
  write(KEYS.reviews, reviews);

  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    // 同 addPost：客户端拿不到 openid 不再拦着不发 —— 服务端身份来自微信 context，
    // 跟 login 云函数部署与否无关。等一轮只为本地「我的评价」能马上认领。
    if (!myOpenid()) await waitOpenid();
    // 走云函数：服务端过审，绕过云函数直接写库躲不过去
    try {
      const r = await require('./user.js').reviewAdd(review);
      if (r && r.ok === false) {
        // 同 addPost：审核驳回才撤本地；云端存不进去 / 云端侧问题必须留下用户写的那条
        const cloudSide = r.saved === false || /无法识别用户身份|未知操作/.test(String(r.msg || ''));
        if (!cloudSide) {
          write(KEYS.reviews, read(KEYS.reviews, []).filter((x) => x.id !== review.id));
          return { ok: false, msg: r.msg || '评价没能发出去', review: review };
        }
        return {
          ok: false,
          saved: false,
          msg: '已存在本机，但没能同步到云端（' + (r.msg || '写入失败') + '）',
          detail: r.detail || '',
          review: review
        };
      }
      // 发布成功：服务端回传的 doc 带真实 openid，补到本地这条上，「我的评价」立刻认领得上
      if (r && r.review && r.review.openid && !review.openid) {
        const cur = read(KEYS.reviews, []);
        const t = cur.find((x) => x.id === review.id);
        if (t) { t.openid = r.review.openid; write(KEYS.reviews, cur); }
        review.openid = r.review.openid;
      }
      // 名录核实以云端为准：本地是照「没查过」先写的，云端命中名录会补一个 true。
      // 不同步回来的话，作者自己看到的结果会和别人看到的不一样。
      if (r && r.review && r.review.teacherVerified && !review.teacherVerified) {
        review.teacherVerified = true;
        const cur2 = read(KEYS.reviews, []);
        const t2 = cur2.find((x) => x.id === review.id);
        if (t2) { t2.teacherVerified = true; write(KEYS.reviews, cur2); }
      }
    } catch (e) {
      return {
        ok: false,
        saved: false,
        msg: '已存在本机，云端暂时连不上',
        detail: String((e && e.message) || e || ''),
        review: review
      };
    }
  }
  return { ok: true, review: decorateReview(review) };
}

// 改自己那条评价（匿名设置跟随修改一起生效，云端同步）
function updateReview(id, patch) {
  const reviews = read(KEYS.reviews, []);
  const idx = reviews.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const oid = myOpenid();
  if (oid && reviews[idx].openid && reviews[idx].openid !== oid) return null;

  if (!isMineReview(reviews[idx])) return null;
  const next = Object.assign({}, reviews[idx], patch, { updatedAt: today() });
  reviews[idx] = next;
  write(KEYS.reviews, reviews);

  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    // where().update() 在客户端安全规则下会打空，统一走云函数
    try { require('./user.js').patchContent('review', id, patch); } catch (e) {}
  }
  return decorateReview(next);
}

// 删自己那条评价（云端也删，别人不会还看到你那条）
function removeReview(id) {
  const reviews = read(KEYS.reviews, []);
  const oid = myOpenid();
  const hit = reviews.find((r) => r.id === id);
  if (!hit || !isMineReview(hit)) return false;
  write(KEYS.reviews, reviews.filter((r) => r.id !== id));
  addTombstone('reviews', id);
  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    // 和 deletePost 同理：删除走云函数，客户端直连删不掉
    try { require('./user.js').delContent('review', id); } catch (e) {}
  }
  return true;
}

// 我的评价：云模式下按 openid 认领，匿名发出去也能找到自己那条
function getMyReviews() {
  const reviews = read(KEYS.reviews, []).filter(notTombstoned('reviews'));
  const oid = myOpenid();
  const mine = oid
    ? reviews.filter((r) => r.openid === oid)
    : reviews.filter((r) => r.nickName === getUser().nickName);
  return mine.sort((a, b) => (a.time < b.time ? 1 : -1)).map(decorateReview);
}

/* ---------------- 校园论坛 ---------------- */

function getBoards() {
  return read(KEYS.boards, []);
}

// 审核员白名单：和云函数里的 MODERATORS 一致，这里只决定「我能不能看到被下架的内容」
function isModerator() {
  const list = (cloud.cfg.MODERATORS) || [];
  const oid = myOpenid();
  return !!oid && Array.isArray(list) && list.indexOf(oid) >= 0;
}

// 内容可见性：被下架的内容，只有作者本人和审核员还能看到（方便申诉恢复）
function visibleToMe(p) {
  if (!p.status || p.status === 'normal') return true;
  return isMinePost(p) || isModerator();
}

// 我在这条帖子上的投票：'like' / 'dislike' / ''（没投过）。
// 老版本只存了「赞没赞」的布尔值，这里读的时候顺手认下来，升级后不会丢点赞状态
function myVote(postId) {
  const votes = read(KEYS.voteSet, {});
  if (votes[postId]) return votes[postId] === 'dislike' ? 'dislike' : 'like';
  const old = read(KEYS.likedSet, {});
  return old[postId] ? 'like' : '';
}

// 给帖子补上 liked / disliked 标记与图片兜底（老帖没有 images 字段）
// 云端写库会自动补一个 _openid，这里统一成 openid，避免「我的帖子」认不出来
function decoratePost(p) {
  const oid = p.openid || p._openid || p.authorOpenid || '';
  const status = p.status || 'normal';
  const vote = myVote(p.id);
  // 匿名帖：昵称换成代号、头像留空。WXML 的 {{}} 里不能调方法，
  // 所以代号必须在这里算好再交给模板。
  const anon = !!p.anonymous;
  const tail = String(oid).slice(-4) || String(p.author || '').slice(-2) || '同学';
  const anonCode = '匿名·' + tail;
  const tomb = commentTomb();
  // 被删掉的留言（多人举报自动删 / 帖主手动删）要在展示层挡掉：
  // 云端那一刀砍的是帖子的 comments 数组，本地缓存却只在同步时整条替换，
  // 不同步的页面上那条留言就会一直挂着，看着像举报没生效
  const shown = (p.comments || []).filter((c) => !c.removed && !tomb[c.id]);
  return Object.assign({}, p, {
    openid: oid,
    status: status,
    hidden: status !== 'normal',
    // 帖子类型：'topic' 是「只发标题」的主题帖，信息收在评论区。
    // 老帖没有这个字段，一律按 'normal' 当普通帖处理
    kind: p.kind === 'topic' ? 'topic' : 'normal',
    // 留言条数单独给一份：信息墙页面上「N 条信息」是标题的一部分，
    // 让模板去数 comments.length 既啰嗦又容易和「N 条评论」看串
    commentCount: shown.length,
    liked: vote === 'like',
    disliked: vote === 'dislike',
    dislikes: Number(p.dislikes) || 0,
    comments: shown,
    images: p.images || [],
    anonymous: anon,
    anonCode: anonCode,
    showAuthor: anon ? anonCode : (p.author || '浙小商'),
    showAvatar: anon ? '' : (p.avatarUrl || ''),
    // 置顶帖由审核员在云端设置，这里只负责带到界面上显示徽标
    pinned: !!p.pinned,
    // 热榜排行号由页面算好传进来，这里只留热度分
    hotScore: hotScore(p)
  });
}

// 热度 =（点赞 - 点踩 + 评论×2）× 时间衰减。
// 只按点赞排会让「上学期的高赞帖」永远霸榜，新帖永远出不了头，
// 所以 72 小时外的帖衰减到两成，热榜才天天有新东西。
// 点踩进分子：踩得多的帖子热度往下掉，热门榜才不会长期被同一批人霸着。
function hotScore(p) {
  const at = Number(p.at) || 0;
  const hours = at ? (Date.now() - at) / 3600000 : 999;
  const decay = Math.max(0.2, 1 - hours / 72);
  const likes = Number(p.likes) || 0;
  const dislikes = Number(p.dislikes) || 0;
  const comments = (p.comments || []).length;
  return Math.round((likes - dislikes + comments * 2) * decay * 10) / 10;
}

// 判断某条帖子是不是「我」发的：
// ① 我的 openid 和帖子的 openid 都在手 → 严格比对，这是最可靠的一档；
// ② 其中一边还没有身份（我的 openid 没取回来 / 老帖没身份字段）→ 按作者昵称兜底。
//    之前「帖子带 _openid 但我的 openid 还没拿到」时直接判否，
//    结果云端同步回来的自己的帖子反而认不出，变成「无人贴」、删除按钮也消失
function isMinePost(p) {
  const myOid = myOpenid();
  const pOid = p.openid || p._openid || p.authorOpenid || '';
  if (myOid && pOid) return pOid === myOid;
  return !!p.author && p.author === getUser().nickName;
}

// 公开列表只看正常内容：任何被下架的（不管是自己的还是别人的）都不进列表，
// 但作者本人 / 审核员仍能通过 getPostById 打开它，方便申诉和恢复
// hole=true 表示树洞页要数据：只出树洞板块；默认主论坛：树洞帖一律不混入
function getPosts({ board = '全部', sort = 'latest', courseId = '', hole = false } = {}) {
  let list = read(KEYS.posts, []).map(decoratePost)
    .filter(notTombstoned('posts'))
    .filter((p) => !p.hidden);
  if (hole) {
    list = list.filter((p) => p.board === HOLE_BOARD);
  } else if (!board || board === '全部') {
    list = list.filter((p) => p.board !== HOLE_BOARD);
  } else {
    list = list.filter((p) => p.board === board);
  }
  if (courseId) {
    list = list.filter((p) => p.courseId === courseId);
  }
  // 排序：最新 / 热门（带时间衰减）/ 最多赞 / 最多踩 / 最多评论。
  // 认不出的 sort 一律退回「最新」，不静默按热门排 —— 排错了用户一眼能看出来
  const s = SORTS[sort] ? sort : 'latest';
  list = list.slice().sort(SORTS[s]);
  // 置顶是运营位：无论哪种排序，都压在列表最上面
  list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return list;
}

// 几种排法。时间相同时按 id 兜底，免得两条内容顺序在每次刷新之间乱跳
const SORTS = {
  latest: (a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : (a.id < b.id ? -1 : 1)),
  hot: (a, b) => ((b.hotScore || 0) - (a.hotScore || 0)) || (a.time < b.time ? 1 : -1),
  likes: (a, b) => ((Number(b.likes) || 0) - (Number(a.likes) || 0)) || (a.time < b.time ? 1 : -1),
  dislikes: (a, b) => ((Number(b.dislikes) || 0) - (Number(a.dislikes) || 0)) || (a.time < b.time ? 1 : -1),
  comments: (a, b) => ((b.comments || []).length - (a.comments || []).length) || (a.time < b.time ? 1 : -1)
};

// 树洞页数据源：只出匿名树洞帖
function getHolePosts(sort) {
  return getPosts({ board: HOLE_BOARD, sort: sort === 'hot' ? 'hot' : 'latest', hole: true });
}

// 被举报暂停展示的内容（不含已经被自动删除的，那个是真没了）。
// ⚠️ 这东西是为了「第 4、5 票」存在的：一条内容被 3 票就藏起来了，
// 藏起来之后学校里没人看得见它，第 4、5 票就永远收不到，
// 「24 小时内 5 人举报自动删除」这条规则等于永远触发不了。
// 所以被下架的内容必须留一个人人都能进的公开出口，让同学还能补充举报。
function getHiddenPosts() {
  return read(KEYS.posts, [])
    .map(decoratePost)
    .filter((p) => p.status === 'hidden')
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
}

function getPostById(id) {
  const list = read(KEYS.posts, []);
  const p = list.find((x) => x.id === id);
  if (!p) return null;
  const d = decoratePost(p);
  if (!notTombstoned('posts')(p)) return null;
  return visibleToMe(d) ? d : null;
}

// 内容状态：'normal'（正常）/ 'hidden'（暂停展示）/ 'deleted'（已被系统删除）
// 举报自动处置走 deleted —— 列表里看不见，但作者和审核员仍能在详情页把它恢复回来。
// 只改本地标记，等下次云端同步会被云端状态覆盖 —— 云端那侧才是最终态
const POST_STATUS_TEXT = {
  hidden: '被举报后暂停展示',
  deleted: '24 小时内被多名同学举报，已自动删除'
};

function setPostStatus(postId, status) {
  const posts = read(KEYS.posts, []);
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx < 0) return false;
  const next = status === 'hidden' || status === 'deleted' || status === 'normal' ? status : 'normal';
  posts[idx].status = next;
  posts[idx].hiddenReason = POST_STATUS_TEXT[next] || '';
  write(KEYS.posts, posts);
  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    // 走云函数而不是直接改库：审核员恢复别人的内容时，客户端没有写权限
    try {
      require('./user.js').setContentStatus(postId, next, 'post');
    } catch (e) {
      cloud.db().collection('posts').where({ id: postId })
        .update({ data: { status: next.status, hiddenReason: next.hiddenReason } })
        .catch(() => {});
    }
  }
  return true;
}

// 返回 Promise：等云端审完再决定要不要带用户离开当前页。
// 之前是「本地写完就报成功」，云端违规内容会晚几秒才冒出来，用户会以为是bug。
//
// kind: 'normal'（默认，普通帖）| 'topic'（主题帖）。
// 主题帖只有标题没有正文，信息全部收在评论区 —— 发「浙工商同好群」这类贴用得上。
// ⚠️ 正文留空是这类帖的定义本身，所以本地这边不能拿「正文为空」当失败条件；
//    真正拦内容的是云函数的词表，客户端只是别自作聪明把空正文拦下来。
async function addPost({ board, title, content = '', courseId = '', courseName = '', images = [], anonymous = false, kind = 'normal' }) {
  const post = {
    id: genId(),
    board,
    title,
    content,
    kind: kind === 'topic' ? 'topic' : 'normal',
    author: getUser().nickName,
    time: today(),
    at: Date.now(),
    likes: 0,
    comments: [],
    images: images || [],
    courseId: courseId || '',
    courseName: courseName || '',
    anonymous: !!anonymous,
    // 发帖人的 openid：别人点作者名就能进名片，进而「想认识」
    authorOpenid: myOpenid(),
    // openid 用来认领「这是我的帖子」，deletePost / 详情页删除按钮都靠它
    openid: myOpenid()
  };
  // 本地先落地：云函数没部署、断网的时候照样发得出去，不会白写
  const posts = read(KEYS.posts, []);
  posts.unshift(post);
  write(KEYS.posts, posts);

  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    // 客户端拿不到 openid 不再拦着不发。云函数的身份来自微信平台注入的 context
    // （getWXContext().OPENID），跟客户端有没有拿到 openid 毫无关系 ——
    // login 云函数只是「让客户端知道自己是谁」，它不部署，帖子照样发得出去。
    // 之前拦在这儿的结果就是「预览正常、体验版全废」：login 没部署时论坛/评价永远
    // 被「身份还没拿到」卡死，而不检查身份的闲置却一直能发。
    // 这里等一轮只是为了让本地「我的帖子」能马上认领，等不到也照发。
    if (!myOpenid()) await waitOpenid();
    // 走云函数而不是直接写库：服务端要过屏蔽词和微信官方内容安全接口，
    // 客户端直连写库等于把审核绕过去 —— 真上架时这是必须堵死的口子。
    try {
      const r = await require('./user.js').postAdd(post);
      if (r && r.ok === false) {
        // 失败必须分类型处理，以前一律删本地，用户看到的就是「写完好好的一转头没了」：
        //   ① 内容被审核驳回（命中屏蔽词）→ 撤掉本地，别把违规内容留在界面上；
        //   ② 云端存不进去（集合没建/没权限/网络）→ 本地必须留着，并如实告诉用户；
        //   ③ 「无法识别用户身份」「未知操作（云函数版本太老）」是云端的问题，
        //      不是内容违规 —— 同样按 ② 处理，别把用户写的东西撤掉。
        const cloudSide = r.saved === false || /无法识别用户身份|未知操作/.test(String(r.msg || ''));
        if (!cloudSide) {
          write(KEYS.posts, read(KEYS.posts, []).filter((x) => x.id !== post.id));
          return { ok: false, msg: r.msg || '内容没能发出去' };
        }
        return {
          ok: false,
          saved: false,
          msg: '已存在本机，但没能同步到云端（' + (r.msg || '写入失败') + '）',
          detail: r.detail || ''
        };
      }
      // 发布成功：服务端用微信 context 认人，回传的 doc 带着真实 openid。
      // 本地这条如果还空着身份就顺手补上，「我的帖子」立刻认得出，不用等下次全量同步。
      if (r && r.post && r.post.openid && !post.openid) {
        const cur = read(KEYS.posts, []);
        const t = cur.find((x) => x.id === post.id);
        if (t) {
          t.openid = r.post.openid;
          t.authorOpenid = r.post.authorOpenid || r.post.openid;
          write(KEYS.posts, cur);
        }
      }
    } catch (e) {
      // 云函数自己崩了 / 调不通：本地那份留着，别让人白写一场
      return {
        ok: false,
        saved: false,
        msg: '已存在本机，云端暂时连不上',
        detail: String((e && e.message) || e || '')
      };
    }
  }
  return { ok: true };
}

function addComment(postId, content) {
  const posts = read(KEYS.posts, []);
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx < 0) return null;
  const comment = {
    id: genId(),
    author: getUser().nickName,
    content,
    time: today(),
    // 云端那份评论带 authorOpenid / at，本地这份先落地时也要带上：
    // 「谁留的、什么时候留的」是信息墙的基本信息，缺了它本地和云端对不上号，
    // 后面要删也认不出是哪一条
    authorOpenid: myOpenid(),
    at: Date.now()
  };
  posts[idx].comments = posts[idx].comments || [];
  posts[idx].comments.push(comment);
  write(KEYS.posts, posts);

  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    // 走云函数：服务端过一遍审核，顺便给作者推「有人回复你」的订阅消息。
    // 被驳回就把本地这条撤掉，别让违规评论留在界面上
    require('./user.js').postComment(postId, content).then((r) => {
      if (r && r.ok === false) {
        const cur = read(KEYS.posts, []);
        const i = cur.findIndex((x) => x.id === postId);
        if (i >= 0) {
          cur[i].comments = (cur[i].comments || []).filter((c) => c.id !== comment.id);
          write(KEYS.posts, cur);
        }
        wx.showToast({ title: r.msg || '评论没能发出去', icon: 'none' });
      }
    }).catch(() => {});
  }
  return comment;
}

// 删掉一条留言（信息墙专用）。
//
// 普通帖的评论区删不删都无所谓，信息墙不行：群号会过期、群会满、有人留错群、
// 还有人往里塞广告 —— 这些都得等帖主自己动手清掉。
// 帖主是唯一有动力维护这面墙的人，没有这个口子，墙三个月就烂成垃圾堆了。
// 云端校验在 commentRemove 里（留言作者本人 / 帖主 / 审核员都能删），
// 这边只负责把本地那份同步撤掉，别让界面上留着一条刚被删掉的留言。
function removeComment(postId, commentId) {
  if (!postId || !commentId) return false;
  const posts = read(KEYS.posts, []);
  const i = posts.findIndex((p) => p.id === postId);
  if (i < 0) return false;
  const before = (posts[i].comments || []).length;
  const after = (posts[i].comments || []).filter((c) => c.id !== commentId);
  if (after.length === before) return false;
  posts[i].comments = after;
  // 光改本地那份还不够：留言是长在帖子里的，本地缓存只在同步时整条替换，
  // 不同步的页面上那条留言会一直挂着，看着像没删掉。墓碑跟缓存无关
  markCommentRemoved(commentId);
  write(KEYS.posts, posts);
  return true;
}

// 留言删除墓碑：记下这条留言已经没了。
// 留言不是一条独立内容，而是帖子里的一个元素；云端那一刀改的是帖子的 comments 数组，
// 手机上的本地缓存却只在同步时整条替换 —— 不同步的页面上那条留言就会一直挂着，
// 举报的人会以为系统没反应。墓碑让「已经删掉」这件事跟缓存有没有刷新无关，
// 见 decoratePost 里的过滤。
function markCommentRemoved(commentId) {
  if (!commentId) return false;
  const t = read(KEYS.commentTomb, {});
  if (t[commentId]) return true;
  t[commentId] = true;
  write(KEYS.commentTomb, t);
  return true;
}

// 赞 / 踩：一个人对一条帖子只能占一个位置，赞和踩互斥。
// kind 传 'like'（默认）或 'dislike'，再点一次同一个就是取消。
function toggleVote(postId, kind) {
  const k = kind === 'dislike' ? 'dislike' : 'like';
  const posts = read(KEYS.posts, []);
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx < 0) return null;
  const p = posts[idx];

  const votes = read(KEYS.voteSet, {});
  const was = votes[postId] === 'dislike' ? 'dislike' : (votes[postId] ? 'like' : '');
  // 同一个再点一次 = 取消；点另一边 = 换边
  const next = was === k ? '' : k;
  if (next) votes[postId] = next;
  else delete votes[postId];
  write(KEYS.voteSet, votes);

  // 计数只在这里加/减一次。之前 if/else 里加了一次、下面又加一次，
  // 点一下变 +2，等云端权威值回来前界面一直显示双倍 —— 就是「点赞一次有两个」的根源。
  const mine = k === 'dislike' ? 'dislikes' : 'likes';
  if (next === '') {
    p[mine] = Math.max(0, (p[mine] || 0) - 1);
  } else {
    // 落在这一侧：自己 +1；
    // 如果原先占着的是另一边（换边），那一侧必须先退回去 ——
    // 少减这一下，「先赞后踩」就会同时留下一个赞和一个踩，谁也说不清这人什么态度
    p[mine] = (p[mine] || 0) + 1;
    if (was && was !== k) {
      const other = k === 'dislike' ? 'likes' : 'dislikes';
      p[other] = Math.max(0, (p[other] || 0) - 1);
    }
  }
  p.liked = next === 'like';
  p.disliked = next === 'dislike';
  write(KEYS.posts, posts);

  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    // 赞踩挪到服务端：客户端直连写库能无限刷，
    // 而且客户端 SDK 不允许 where().remove() 批量删，取消点赞会往 likes 集合里留垃圾
    try {
      require('./user.js').voteToggle(postId, k).then((r) => {
        if (r && r.ok) {
          const cur = read(KEYS.posts, []);
          const t = cur.find((x) => x.id === postId);
          if (t) {
            t.likes = r.likes;
            t.dislikes = r.dislikes;
            t.liked = r.liked;
            t.disliked = r.disliked;
            write(KEYS.posts, cur);
          }
        }
      }).catch(() => {});
    } catch (e) {}
  }
  return p;
}

// 老接口：点个赞。留着是为了别处不用跟着改
function toggleLike(postId) {
  return toggleVote(postId, 'like');
}

// 我举报过这条内容吗？只看本地那份记录（服务端才是权威，这边只管按钮状态）
function hasReported(id) {
  return !!read(KEYS.reportedSet, {})[id];
}

// 记下「我举报过了」。只记本地：云端 reports 集合里已经有权威记录，
// 同一个人重复举报云端会返回「已经举报过了」，本地这份纯粹是给按钮用的
function markReported(id) {
  if (!id) return false;
  const set = read(KEYS.reportedSet, {});
  set[id] = true;
  write(KEYS.reportedSet, set);
  return true;
}

// 同一套记录，只是多带一个帖子 id：留言长在帖子里面，
// 光靠留言自己的 id 认人，换一条帖子就有可能认错
function commentReportKey(postId, commentId) {
  return String(postId || '') + '#' + String(commentId || '');
}
function hasReportedComment(postId, commentId) {
  return !!read(KEYS.reportedSet, {})[commentReportKey(postId, commentId)];
}
function markReportedComment(postId, commentId) {
  const key = commentReportKey(postId, commentId);
  if (key === '#') return false;
  const set = read(KEYS.reportedSet, {});
  if (set[key]) return true;
  set[key] = true;
  write(KEYS.reportedSet, set);
  return true;
}

// 审核员置顶 / 取消置顶：本地先改（点了马上就有徽标），云端同步（别人手机上也看得到）。
// 云端会再验一次是不是审核员，所以前端改不了别人的帖子。
function setPostPinned(postId, pinned) {
  const posts = read(KEYS.posts, []);
  const hit = posts.find((p) => p.id === postId);
  if (!hit) return Promise.resolve({ ok: false, msg: '帖子不存在' });
  hit.pinned = !!pinned;
  hit.pinnedAt = pinned ? Date.now() : 0;
  write(KEYS.posts, posts);
  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    return Promise.resolve(require('./user.js').postPin(postId, !!pinned)).catch(() => ({ ok: true }));
  }
  return Promise.resolve({ ok: true });
}

function getMyPosts() {
  return read(KEYS.posts, [])
    .map(decoratePost)
    .filter(notTombstoned('posts'))
    .filter(isMinePost)
    .sort((a, b) => (a.time < b.time ? 1 : -1));
}

// force=true 表示审核员删除他人内容（跳过归属校验）
function deletePost(postId, force) {
  const posts = read(KEYS.posts, []);
  const oid = myOpenid();
  const hit = posts.find((p) => p.id === postId);
  // 云端帖子上来时字段是 _openid / authorOpenid，本地新帖是 openid，三种都认
  const hitOpenid = hit ? (hit.openid || hit._openid || hit.authorOpenid || '') : '';
  if (!force && hit && oid && hitOpenid && hitOpenid !== oid) return false;
  write(KEYS.posts, posts.filter((p) => p.id !== postId));
  addTombstone('posts', postId);
  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    // 必须走云函数删：客户端 SDK 在安全规则下不允许 where().remove() 批量删除，
    // 而示例帖的 _openid 是空的，「仅创建者可写」权限下前端一条都删不掉，
    // 本地删了云端还在，下次同步又回来——这就是「删了重进还在」的根源
    try { require('./user.js').delContent('post', postId); } catch (e) {}
  }
  return true;
}

// 评价下架 / 恢复：被举报的评价自动下架后，这里能给作者一个申诉入口
function setReviewStatus(reviewId, status) {
  const reviews = read(KEYS.reviews, []);
  const idx = reviews.findIndex((r) => r.id === reviewId);
  if (idx < 0) return false;
  reviews[idx].status = status === 'hidden' ? 'hidden' : 'normal';
  write(KEYS.reviews, reviews);
    if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
      // 改状态走云函数：客户端在「仅创建者可写」权限下改不动云端记录，
      // 本地改了云端没改，下次同步又被覆盖回去
      try {
        require('./user.js').patchContent('review', reviewId, { status: reviews[idx].status });
      } catch (e) {}
    }
    return true;
}

/* ---------------- 论坛搜索 ---------------- */

// 搜索历史最多留几条：再多就变成「信息噪音」，用户根本不会往下翻
const HISTORY_MAX = 6;
// 热门词：新用户不知道搜什么时，点一下就能看到这个圈子里都在讨论什么
const HOT_KEYWORDS = ['选课', '食堂', '图书馆', '宿舍', '社团', '实习'];

function getSearchHistory() {
  const list = read(KEYS.searchHistory, []);
  return Array.isArray(list) ? list : [];
}

function pushSearchHistory(keyword) {
  const k = String(keyword || '').trim();
  if (!k) return getSearchHistory();
  let list = getSearchHistory().filter((x) => x !== k);
  list.unshift(k);
  if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
  write(KEYS.searchHistory, list);
  return list;
}

function clearSearchHistory() {
  write(KEYS.searchHistory, []);
  return [];
}

function getHotKeywords() {
  return HOT_KEYWORDS.slice();
}

// 把一段文字按关键词切成若干片段，标记命中的位置。
// 必须在 JS 里算好：WXML 的模板表达式不支持任何函数调用，高亮逻辑放模板里会整页崩溃。
function buildParts(text, kw) {
  const t = String(text || '');
  if (!kw) return [{ idx: 0, t: t, hit: false }];
  const lower = t.toLowerCase();
  const parts = [];
  let from = 0;
  let idx = lower.indexOf(kw);
  while (idx >= 0) {
    if (idx > from) parts.push({ idx: parts.length, t: t.slice(from, idx), hit: false });
    parts.push({ idx: parts.length, t: t.slice(idx, idx + kw.length), hit: true });
    from = idx + kw.length;
    idx = lower.indexOf(kw, from);
  }
  if (from < t.length) parts.push({ idx: parts.length, t: t.slice(from), hit: false });
  return parts.length ? parts : [{ idx: 0, t: t, hit: false }];
}

function matchPost(p, kw) {
  // 标题、正文、板块、作者、课程名任一命中即算搜到，逐条扫一遍本地缓存即可，不用联网。
  // 命中判定走全站共用的那套（精准 / 模糊），而不是这里再写一次 indexOf：
  // 同学把标题打错一个字，本来是该搜得到的。
  // 这里必须把「等级」原样返回，压成 true/false 的话精准档就形同虚设了
  // （passLevel 拿到 true 只会放行，永远挡不住打错字的结果）
  return searchCore.matchFields([p.title, p.content, p.board, p.author, p.courseName], kw);
}

// 按关键词找帖子。kw 已经转小写；不传关键词返回空数组，由调用方决定退回普通列表。
// exact 传 true 只找完全一致的（精准档），默认模糊档 —— 打错字也搜得到
function searchPosts(keyword, exact) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return [];
  const alive = notTombstoned('posts');
  return read(KEYS.posts, [])
    .filter(alive)
    .filter((p) => visibleToMe(decoratePost(p)))
    .filter((p) => searchCore.passLevel(matchPost(p, kw), exact))
    .sort((a, b) => (a.time < b.time ? 1 : -1))
    .map((p) => {
      const d = decoratePost(p);
      d.titleParts = buildParts(d.title, kw);
      d.contentParts = buildParts(d.content, kw);
      return d;
    });
}

/* ---------------- 收藏 ---------------- */

// 收藏最多留 200 条：再多没人会去翻，却要拖慢每次读取
const FAV_MAX = 200;

function getFavorites() {
  const list = read(KEYS.favorites, []);
  return Array.isArray(list) ? list : [];
}

// 收藏同一个开关：已在收藏里就移除，不在就加上
// item: { type: 'post'|'review'|'course'|'market', id, title }
function toggleFavorite(item) {
  const it = item || {};
  const type = String(it.type || '');
  const id = String(it.id || '');
  if (!type || !id) return { ok: false, favorited: false };
  const before = getFavorites();
  const adding = !before.some((f) => f.type === type && f.id === id);
  let list = before.filter((f) => !(f.type === type && f.id === id));
  if (adding) {
    list.unshift({
      type: type,
      id: id,
      title: String(it.title || '').slice(0, 60),
      at: Date.now()
    });
  }
  if (list.length > FAV_MAX) list = list.slice(0, FAV_MAX);
  write(KEYS.favorites, list);
  pushFavoritesToCloud(list);
  return { ok: true, favorited: adding };
}

function isFavorited(type, id) {
  return getFavorites().some((f) => f.type === type && f.id === id);
}

function removeFavorite(type, id) {
  const list = getFavorites().filter((f) => !(f.type === type && f.id === id));
  write(KEYS.favorites, list);
  pushFavoritesToCloud(list);
  return list;
}

// 收藏是「我」的私有数据，整份覆盖写即可，没有并发冲突
function pushFavoritesToCloud(list) {
  if (!cloud.cfg.USE_CLOUD || !cloud.ensureCloud()) return Promise.resolve(false);
  try {
    return require('./user.js').saveFavorites(list).then(() => true).catch(() => false);
  } catch (e) {
    return Promise.resolve(false);
  }
}

// 换设备 / 重装后把云端那份收藏拉回来，本地那份作为兜底
function pullFavorites() {
  if (!cloud.cfg.USE_CLOUD || !cloud.ensureCloud()) return Promise.resolve(null);
  try {
    return require('./user.js').getFavorites()
      .then((r) => ((r && Array.isArray(r.list) && r.list.length) ? r.list : null))
      .catch(() => null);
  } catch (e) {
    return Promise.resolve(null);
  }
}

/* ---------------- 草稿 ---------------- */

function getDrafts() {
  const list = read(KEYS.drafts, []);
  return Array.isArray(list) ? list : [];
}

// 标题和正文都空的东西不算草稿：连着误触点两下会攒出一堆垃圾
function hasDraftText(d) {
  return !!(String((d && d.title) || '').trim() || String((d && d.content) || '').trim());
}

// draft: { type:'post'|'review', board, courseId, courseName, title, content, tags }
// 有 id 就更新原来那条，没有就新建；同一个「类型+业务 id」永远只留一份
function saveDraft(draft) {
  const d = Object.assign({}, draft || {});
  if (!hasDraftText(d)) return getDrafts();
  // 课程关联必须一起存。以前只存了 board，恢复草稿后课程链接丢了，
  // 用户改完一切点发布，被「先选一门课程」卡住 —— 表现就是「草稿恢复后来发不出去」
  d.courseId = String(d.courseId || '');
  d.courseName = String(d.courseName || '');
  d.type = d.type || 'post';
  d.title = String(d.title || '');
  d.content = String(d.content || '');
  // 页面每次点「存草稿」都新建，不带 id。所以除了按 id 认人，
  // 还得按「类型+标题+正文」认：连点两下、或者改了又改回来，
  // 都该更新原来那条，而不是在草稿箱里攒出一堆看起来一模一样的重复条目。
  const exist = getDrafts().find((x) => x.id && x.id === d.id)
    || getDrafts().find((x) => x.type === d.type && x.title === d.title && x.content === d.content);
  d.id = exist ? exist.id : ('d' + Date.now() + Math.floor(Math.random() * 1000));
  d.updatedAt = Date.now();
  const rest = getDrafts().filter((x) => x.id !== d.id);
  rest.unshift(d);
  // 草稿上限 20 条：再多说明是反复犹豫，留着反而碍事
  write(KEYS.drafts, rest.slice(0, 20));
  return d;
}

function getDraft(id) {
  return getDrafts().find((d) => d.id === id) || null;
}

function removeDraft(id) {
  write(KEYS.drafts, getDrafts().filter((d) => d.id !== id));
  return true;
}

function clearDrafts() {
  write(KEYS.drafts, []);
  return [];
}

const PAGE = { SIZE: PAGE_SIZE, ANON: ANON_NAME };

module.exports = {
  initStore,
  syncNow,
  openidTrouble,
  getUser,
  setUser,
  getCourses,
  getCourseById,
  getCourseInsight,
  setCourseType,
  syncCourseTypes,
  getColleges,
  refreshCourses,
  findCourseByName,
  addCourse,
  removeCourse,
  dropCourseLocal,
  isMineCourse,
  getReviews,
  getReviewById,
  getAllReviews,
  getCourseTeachers,
  getReviewsByTeacher,
  getTeacherBoard,
  addReview,
  updateReview,
  removeReview,
  getMyReviews,
  getBoards,
  getPosts,
  getHolePosts,
  getHiddenPosts,
  HOLE_BOARD,
  getPostById,
  addPost,
  addComment,
  removeComment,
  toggleVote,
  toggleLike,
  myVote,
  hasReported,
  markReported,
  hasReportedComment,
  markReportedComment,
  markCommentRemoved,
  deletePost,
  getMyPosts,
  isMinePost,
  isMineReview,
  setPostStatus,
  setReviewStatus,
  setPostPinned,
  isModerator,
  loadMorePosts,
  fetchPostsFromCloud,
  ensureSeed,
  PAGE,
  searchPosts,
  getSearchHistory,
  pushSearchHistory,
  clearSearchHistory,
  getHotKeywords,
  // 收藏
  getFavorites,
  isFavorited,
  toggleFavorite,
  removeFavorite,
  pullFavorites,
  // 草稿
  getDrafts,
  hasDraftText,
  saveDraft,
  getDraft,
  removeDraft,
  clearDrafts
};
