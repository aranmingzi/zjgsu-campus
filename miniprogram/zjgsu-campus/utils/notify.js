// utils/notify.js —— 订阅消息授权（一次性）
//
// 微信规定：小程序要先取得用户的一次性授权，云函数才能给他推一条通知。
// 所以这里是「要授权」，真正发消息在云函数里（cloudfunctions/user 的 sendSubMsg）。
//
// 模板 ID 填在 utils/config.js 的 SUBMSG 里：
//   mp 后台 → 订阅消息 → 公共模板库 → 选用后复制模板 ID
// 没填就整段静默跳过，任何功能都不受影响。
//
// 只在「用户刚做完一件值得被通知的事」之后弹授权：
// 一进小程序就弹，通过率极低，还惹人烦。
const cfg = require('./config.js');

function tmplIds(kind) {
  const s = (cfg && cfg.SUBMSG) || {};
  const id = String(s[kind] || '').trim();
  return id ? [id] : [];
}

// 返回 Promise<是否同意>。没配模板 / 用户拒绝 都只是 false，不抛错
function request(kind) {
  const ids = tmplIds(kind);
  if (!ids.length) return Promise.resolve(false);
  if (typeof wx === 'undefined' || !wx.requestSubscribeMessage) return Promise.resolve(false);
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: (res) => {
        // 返回值是「模板ID: accept/reject/ban」，ban 表示被永久拒绝（在设置页关了）
        const v = res && res[ids[0]];
        resolve(v === 'accept');
      },
      fail: () => resolve(false)
    });
  });
}

module.exports = { request, tmplIds };
