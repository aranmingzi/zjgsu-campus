// utils/market.js —— 失物招领与二手交易
//
// 为什么不放进论坛 posts：
//   这两类内容需要「联系方式 + 状态流转」（我捡到了 / 我联系上了 / 已送出），
//   论坛帖没有这些字段，硬塞会让帖子列表变得又长又难看懂。
//
// 三种 type：
//   lost  —— 我丢了东西，捡到的同学按联系方式找我
//   found —— 我捡到了东西，丢东西的同学按联系方式认领
//   sell  —— 二手出售 / 想收，带价格
//
// 结构上和 store.js 一脉相承：本地缓存负责秒开，云端负责全校可见，
// 云函数不可用时自动回落到本地，功能不会中断。
const cloud = require('./cloud.js');
// 精准 / 模糊的搜索内核（全站共用）
const searchCore = require('./search.js');

const KEY = 'zjgsu_market';

// 三种类型的中文名与配色，列表页 / 发布页共用
const TYPES = {
  lost: { label: '寻物', icon: 'search', hint: '我丢了东西，捡到的同学联系我' },
  found: { label: '招领', icon: 'inbox', hint: '我捡到了东西，丢的同学来认领' },
  sell: { label: '闲置', icon: 'shopping-bag️', hint: '分享你的闲置物品信息，可注明参考价' }
};

function read(key, fallback) {
  const v = wx.getStorageSync(key);
  return (v === '' || v === undefined || v === null) ? fallback : v;
}
function write(key, val) {
  try { wx.setStorageSync(key, val); } catch (e) {}
}

function genId() {
  return 'm' + Date.now() + Math.floor(Math.random() * 1000);
}

function typeLabel(type) {
  return (TYPES[type] && TYPES[type].label) || '闲置';
}

// 闲置分类：教材是开学季最强需求，单独拆一栏出来。
// 个人主体不能做在线交易，所以这里只做「信息发布 + 私信联系」，不碰钱。
const CATEGORIES = [
  { key: 'book', label: '教材', icon: 'book-open' },
  { key: 'digital', label: '数码', icon: 'laptop' },
  { key: 'life', label: '生活', icon: 'life-buoy' },
  { key: 'other', label: '其他', icon: 'inbox' }
];

function categoryLabel(key) {
  const hit = CATEGORIES.filter((c) => c.key === key)[0];
  return hit ? hit.label : '其他';
}

function categoryIcon(key) {
  const hit = CATEGORIES.filter((c) => c.key === key)[0];
  return hit ? hit.icon : 'inbox';
}

/* ---------------- 发布 ---------------- */

// item: { type, title, desc, contact, contactType, price, location, images }
async function addMarket(item) {
  const it = item || {};
  const type = TYPES[it.type] ? it.type : 'lost';
  const doc = {
    id: genId(),
    type: type,
    title: String(it.title || '').trim().slice(0, 40),
    desc: String(it.desc || '').trim().slice(0, 500),
    contact: String(it.contact || '').trim().slice(0, 40),
    contactType: it.contactType || 'phone',
    price: type === 'sell' ? String(it.price || '').trim().slice(0, 20) : '',
    location: String(it.location || '').trim().slice(0, 40),
    category: CATEGORIES.some((c) => c.key === it.category) ? it.category : 'other',
    courseName: String(it.courseName || '').trim().slice(0, 30),
    images: Array.isArray(it.images) ? it.images.slice(0, 6) : [],
    author: it.author || '',
    openid: cloud.getOpenid() || it.openid || '',
    time: it.time || today(),
    at: Date.now(),
    status: 'open', // open → done（已经联系上 / 已经出手）
    done: false
  };

  // 本地先落地：云函数还没部署、网络断了，东西也照样发得出去
  const list = read(KEY, []);
  list.unshift(doc);
  write(KEY, list);

  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    await wx.cloud.callFunction({
      name: 'user',
      data: { action: 'marketAdd', item: doc }
    }).catch(() => null);
  }
  return doc;
}

/* ---------------- 列表 ---------------- */

// 本地缓存（秒开用）：不传 type 拿全部
function getMarkets(type) {
  let list = read(KEY, []).slice();
  if (type && TYPES[type]) list = list.filter((m) => m.type === type);
  return list.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
}

// 本地关键词搜索：标题 / 描述 / 地点 / 发布人 / 课程名
function searchMarkets(type, keyword, exact) {
  const kw = String(keyword || '').trim().toLowerCase();
  // 搜本地全量而不是「只搜已同步云端的」：刚发出去还没同步上的那条，
  // 列表里看得见、一搜却搜不到会让人以为没发出去
  const all = getMarkets(type);
  if (!kw) return all;
  // 和论坛、课程用同一套精准 / 模糊判定：把关键字打错一个字也该搜得到，
  // 在哪个板块的体验都该一样
  return all.filter((m) => searchCore.passLevel(searchCore.matchFields(
    [m.title, m.desc, m.location, m.author, m.courseName], kw
  ), !!exact));
}

// 按分类筛（教材 / 数码 / 生活 / 其他）：只在闲置 tab 里用
function filterByCategory(list, category) {
  const c = String(category || '');
  if (!c || c === 'all') return list;
  return list.filter((m) => (m.category || 'other') === c);
}

// 从云端拉一页并写回本地缓存：本地缓存只是镜像，云端才是全校共享的那份
async function fetchMarkets(page, fromTop) {
  if (!cloud.cfg.USE_CLOUD || !cloud.ensureCloud()) return 0;
  const p = Math.max(1, page || 1);
  const res = await wx.cloud.callFunction({
    name: 'user',
    data: { action: 'marketList', page: p }
  }).catch(() => null);
  const list = res && res.result && Array.isArray(res.result.list) ? res.result.list : null;
  if (!list) return 0;

  const cache = read(KEY, []);
  // 云端那条先落地并打上标记，本地没同步上去的（自己刚发的）原样保留
  const seen = {};
  list.forEach((m) => { seen[m.id] = true; m.fromCloud = true; });
  const localOnly = cache.filter((m) => !seen[m.id]);
  write(KEY, list.concat(localOnly));
  return list.length;
}

function getCloudMarkets(type) {
  let list = read(KEY, []).filter((m) => m.fromCloud === true).slice();
  if (type && TYPES[type]) list = list.filter((m) => m.type === type);
  return list.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
}

/* ---------------- 详情 / 状态 ---------------- */

function getMarketById(id) {
  return read(KEY, []).find((m) => m.id === id) || null;
}

// 认领 / 成交：Mark 一下，别人列表里能看到「已经解决了」，避免抢同一件东西
async function markDone(id) {
  const list = read(KEY, []);
  const hit = list.find((m) => m.id === id);
  if (!hit) return null;
  hit.status = hit.status === 'done' ? 'open' : 'done';
  hit.done = hit.status === 'done';
  write(KEY, list);
  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    await wx.cloud.callFunction({
      name: 'user',
      data: { action: 'marketDone', id: id, done: hit.done }
    }).catch(() => null);
  }
  return hit;
}

// 删除（自己的）
async function removeMarket(id) {
  write(KEY, read(KEY, []).filter((m) => m.id !== id));
  if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
    await wx.cloud.callFunction({
      name: 'user',
      data: { action: 'marketRemove', id: id }
    }).catch(() => null);
  }
  return true;
}

/* ---------------- 我的 ---------------- */

function getMyMarkets() {
  const me = cloud.getOpenid() || '';
  const name = (function () {
    const u = wx.getStorageSync('zjgsu_user');
    return (u && u.nickName) || '';
  })();
  return read(KEY, []).filter((m) => (m.openid && me ? m.openid === me : m.author === name));
}

function today() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

module.exports = {
  TYPES,
  KEY,
  CATEGORIES,
  typeLabel,
  categoryLabel,
  categoryIcon,
  filterByCategory,
  addMarket,
  getMarkets,
  getCloudMarkets,
  searchMarkets,
  fetchMarkets,
  getMarketById,
  markDone,
  removeMarket,
  getMyMarkets
};
