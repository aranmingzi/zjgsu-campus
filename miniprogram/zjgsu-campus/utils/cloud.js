// utils/cloud.js —— 微信云开发辅助（懒初始化 + openid 获取）
const cfg = require('./config.js');

let _db = null;
let _openid = '';
// 试了几次还没拿到身份。连着失败基本不是网不好，是 login 云函数没部署 ——
// 重试再多也没用，得让页面把话说清楚，别让用户以为是自己手机有问题
let _tries = 0;

function ensureCloud() {
  if (!cfg.USE_CLOUD || !cfg.CLOUD_ENV) return false;
  if (typeof wx === 'undefined' || !wx.cloud) return false;
  if (!_db) {
    wx.cloud.init({ env: cfg.CLOUD_ENV, traceUser: true });
    _db = wx.cloud.database();
  }
  return true;
}

function db() {
  return _db;
}

function getOpenid() {
  return _openid;
}

// 通过 login 云函数拿到当前用户 openid（用于标记“我的”和点赞归属）
// 失败自动重试一次：冷启动时偶发超时，openid 拿不到会让「我的」认领全线失灵
//
// ⚠️ 每次 callFunction 都套了 5 秒兜底超时：login 没部署 / 网络黑洞时，
// callFunction 的 promise 会挂很久。发帖链路（addPost → waitOpenid）在等这个函数，
// 没有超时的话用户点「投进树洞」后按钮会长时间卡在「投放中…」，看起来就像坏了。
const LOGIN_TIMEOUT_MS = 5 * 1000;

function loginOnce() {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, LOGIN_TIMEOUT_MS);
    wx.cloud.callFunction({ name: 'login' }).then((res) => {
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(() => {
      if (!done) { done = true; clearTimeout(timer); resolve(null); }
    });
  });
}

async function fetchOpenid() {
  if (!ensureCloud()) return '';
  // 冷启动时 login 偶发超时，一次拿不到不代表这次会话就没戏；
  // 但也就试三回 —— 连着三回都不成，八成是 login 云函数压根没部署，重试没意义
  for (let i = 0; i < 3; i += 1) {
    _tries += 1;
    const res = await loginOnce();
    _openid = (res && res.result && res.result.openid) || '';
    if (_openid) {
      _tries = 0;
      break;
    }
  }
  return _openid;
}

// 拿不到身份时，页面能据此给一句有用的话，而不是笼统的「请重进」
function openidTrouble() {
  return { openid: _openid, tried: _tries, ok: !!_openid };
}

module.exports = { ensureCloud, db, getOpenid, fetchOpenid, openidTrouble, cfg };
