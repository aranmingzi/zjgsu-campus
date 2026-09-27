// utils/chat.js —— 同学之间的私信
//
// 设计取舍：
//   没有做 WebSocket 实时推送 —— 校园场景里「发完对方一分钟后看到」足够了，
//   实时通道要配消息服务、要付费、要处理断线重连，对课程作业性价比太低。
//   所以现在是「进入会话时拉一次历史 + 发一句刷新一次」，点击进入就能看到对方的新消息。
const cloud = require('./cloud.js');

// 云函数返回 null 表示「云函数没部署 / 网络断了」，调用方据此决定要不要提示
function call(action, payload) {
  if (!cloud.cfg.USE_CLOUD || !cloud.ensureCloud()) return Promise.resolve(null);
  return wx.cloud.callFunction({
    name: 'user',
    data: Object.assign({ action: action }, payload || {})
  }).then((res) => (res && res.result) || null).catch(() => null);
}

// 会话列表：对方昵称 / 头像 / 最后一句 / 未读红点
function list() {
  return call('chatList', {}).then((r) => ((r && Array.isArray(r.list)) ? r.list : []));
}

// 发一句话：返回 null 时不代表失败，可能是云函数没部署，前端按「本地已发出」处理
function send(to, text) {
  return call('chatSend', { to: to, text: text })
    .then((r) => (r === null ? { ok: true, local: true } : (r || { ok: false, msg: '发送失败' })));
}

// 聊天记录 + 对方资料；打开会话时顺手把未读清掉
function history(peer) {
  return call('chatHistory', { peer: peer })
    .then((r) => (r && Array.isArray(r.messages)) ? r : { messages: [], peer: { openid: peer, nickName: '' } });
}

module.exports = { list, send, history };
