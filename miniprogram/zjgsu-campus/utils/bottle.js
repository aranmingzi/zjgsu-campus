// utils/bottle.js —— 校园盲盒 / 漂流瓶（前端数据层）
//
// 数据全部在云端 bottles 集合，前端不缓存正本：瓶子是「捞出来才看得到」的东西，
// 没有秒开列表的需求，也就没必要在本地再存一份和云端打架。
// 云函数不可用时每个动作都会如实返回失败 —— 没部署新版云函数之前这个功能不开放。
const cloud = require('./cloud.js');
const userApi = require('./user.js');

// 三种瓶子类型：和云函数 BOTTLE_KINDS 一一对应
const KINDS = {
  '吐槽': { icon: 'flame', hint: '吐槽期末、吐槽食堂、吐槽早八' },
  '分享': { icon: 'gift', hint: '好听的歌、好看的书、好用的东西' },
  '提问': { icon: 'message-square', hint: '匿名问一个平时不好意思问的问题' }
};

function kindIcon(kind) {
  return (KINDS[kind] && KINDS[kind].icon) || 'inbox';
}

// 每日限捞次数：前端只用于展示（「今天还剩 X 次」），真正的闸在云函数
const DAILY_FETCH = 3;

// 扔瓶子 { kind, content } → { ok, id?, msg? }
function throwBottle(kind, content) {
  return userApi.call('bottleThrow', { kind: kind, content: content })
    .then((r) => r || { ok: false, saved: false, msg: '云端暂时连不上' });
}

// 捞瓶子 {} → { ok, bottle?, left?, msg? }
function fetchBottle() {
  return userApi.call('bottleFetch', {})
    .then((r) => r || { ok: false, saved: false, msg: '云端暂时连不上' });
}

// 回复 { id, content } → { ok, ownerCollege?, msg? } —— 回复成功即解锁对方院系
function replyBottle(id, content) {
  return userApi.call('bottleReply', { id: id, content: content })
    .then((r) => r || { ok: false, saved: false, msg: '云端暂时连不上' });
}

// 我的瓶子 {} → { ok, mine?, left?, fetchedToday? }
function myBottles() {
  return userApi.call('bottleMine', {})
    .then((r) => r || { ok: false, msg: '云端暂时连不上', mine: [], left: DAILY_FETCH });
}

module.exports = { KINDS, kindIcon, DAILY_FETCH, throwBottle, fetchBottle, replyBottle, myBottles };
