// utils/event.js —— 校园活动
//
// 为什么单开一个数据层：活动有「时间 / 地点 / 人数上限 / 报名」这些字段，
// 论坛帖没有；而且它是唯一带「报名」这种可撤销状态的功能，
// 塞进 store.js 会让那个文件再长一截。
//
// 结构和 store.js / market.js 一脉相承：本地缓存负责秒开，云端负责全校可见，
// 云函数不可用时自动回落到本地，发布和报名都不会卡死。
const cloud = require('./cloud.js');

const KEY = 'zjgsu_events';

// 四种活动类型。选这几个是因为它们都是「有明确时间地点、会有人想一起去」的事，
// 顺便 / 吐槽这类内容更适合丢进论坛
const TYPES = {
  lecture: { label: '讲座', icon: 'megaphone️', hint: '讲座 / 宣讲 / 经验交流会' },
  contest: { label: '比赛', icon: 'award', hint: '学科竞赛 / 演讲比赛 / 答辩' },
  team: { label: '组队', icon: 'users-round', hint: '大创 / 挑战杯 / 数学建模找队友' },
  other: { label: '其他', icon: 'sparkles', hint: '社团活动 / 志愿活动 / 聚餐' }
};

function typeLabel(type) {
  return (TYPES[type] && TYPES[type].label) || '其他';
}

function typeIcon(type) {
  return (TYPES[type] && TYPES[type].icon) || 'sparkles';
}

function read(key, fallback) {
  const v = wx.getStorageSync(key);
  return (v === '' || v === undefined || v === null) ? fallback : v;
}
function write(key, val) {
  try { wx.setStorageSync(key, val); } catch (e) {}
}

function genId() {
  return 'ev' + Date.now() + Math.floor(Math.random() * 1000);
}

function nowText() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// 云函数统一入口在 cloud.js，这里只转发
const call = cloud.callFunction;

/* ---------------- 发布 ---------------- */

// item: { type, title, desc, location, date, time, capacity, contact, contactType }
async function addEvent(item) {
  const it = item || {};
  const doc = {
    id: genId(),
    type: TYPES[it.type] ? it.type : 'other',
    title: String(it.title || '').trim().slice(0, 40),
    desc: String(it.desc || '').trim().slice(0, 500),
    location: String(it.location || '').trim().slice(0, 40),
    // date / time 两个 picker 拼成一个字符串，WXML 里直接显示，不用再拆
    start: (String(it.date || '').trim() + ' ' + String(it.time || '').trim()).trim(),
    capacity: Math.max(0, Math.min(500, Math.round(Number(it.capacity) || 0))),
    contact: String(it.contact || '').trim().slice(0, 40),
    contactType: it.contactType || 'wechat',
    author: it.author || '',
    openid: cloud.getOpenid() || '',
    time: nowText(),
    at: Date.now(),
    joinedCount: 0
  };

  // 本地先落地：云函数还没重新部署的时候，活动也照样发得出去
  const list = read(KEY, []);
  list.unshift(doc);
  write(KEY, list);

  const r = await call('eventAdd', { event: doc });
  // 云端明确说「存不住」时，本地这份要撤掉，否则列表里会出现一条云端没有的幽灵活动
  // （下次同步时它会被顶掉，同学看到的就是「刚发的活动没了」）
  if (r && r.ok === false) {
    if (r.saved === false) {
      write(KEY, read(KEY, []).filter((x) => x.id !== doc.id));
    }
    return r;
  }
  if (r && r.event) {
    const list2 = read(KEY, []).map((x) => (x.id === doc.id ? r.event : x));
    write(KEY, list2);
  }
  return r && r.ok ? { ok: true } : { ok: true };
}

/* ---------------- 列表 ---------------- */

function sortByTime(list) {
  return list.slice().sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
}

// 本地缓存（秒开用）
function getEvents() {
  return sortByTime(read(KEY, []));
}

function getCloudEvents() {
  return sortByTime(read(KEY, []).filter((e) => e.fromCloud === true));
}

// 从云端拉一页并写回本地缓存：本地缓存只是镜像，云端才是全校共享的那份
async function fetchEvents(page) {
  if (!cloud.cfg.USE_CLOUD || !cloud.ensureCloud()) return 0;
  const p = Math.max(1, page || 1);
  const res = await call('eventList', { page: p });
  const list = res && Array.isArray(res.list) ? res.list : null;
  if (!list) return 0;

  const cache = read(KEY, []);
  const seen = {};
  list.forEach((e) => { seen[e.id] = true; e.fromCloud = true; });
  const localOnly = cache.filter((e) => !seen[e.id]);
  write(KEY, list.concat(localOnly));
  return list.length;
}

function getEventById(id) {
  return read(KEY, []).find((e) => e.id === id) || null;
}

/* ---------------- 报名 ---------------- */

// 报名：云端写库成功才算数。这里不打本地补丁再删，
// 前面 addEvent 已经为了「云函数没部署也能发」写了本地，
// 但报名不涉及「新内容」，本地缓存改不动别人的活动，失败了就如实说。
async function joinEvent(id) {
  const r = await call('eventJoin', { id: id });
  if (r === null) return { ok: false, saved: false, msg: '云端连不上，报名没记上' };
  return r;
}

// 取消报名（报给自己取消，不影响别人）
async function cancelJoin(id) {
  const r = await call('eventCancel', { id: id });
  if (r === null) return { ok: false, saved: false, msg: '云端连不上，没能取消' };
  return r;
}

/* ---------------- 删除 ---------------- */

// 只能删自己发的：删了之后本地那条也一并清掉，
// 不然「云端删了、本地还留着」，下次进列表又冒出来一条看不了的活动
async function removeEvent(id) {
  const r = await call('eventRemove', { id: id });
  if (r === null) return { ok: false, msg: '云端连不上，没能删掉' };
  if (r.ok === false) return r;
  write(KEY, read(KEY, []).filter((e) => e.id !== id));
  return { ok: true };
}

/* ---------------- 我的 ---------------- */

function getMyEvents() {
  const me = cloud.getOpenid() || '';
  return read(KEY, []).filter((e) => e.openid && me && e.openid === me);
}

module.exports = {
  TYPES,
  KEY,
  typeLabel,
  typeIcon,
  nowText,
  addEvent,
  getEvents,
  getCloudEvents,
  fetchEvents,
  getEventById,
  joinEvent,
  cancelJoin,
  removeEvent,
  getMyEvents
};
