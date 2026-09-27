// utils/haptic.js —— 轻震动反馈（真机有效，开发者工具里是空操作，不影响调试）
//
// 只给「结果确认」类动作用：复制成功、保存成功、发布成功。
// 别每个 tap 都震 —— 点哪震哪很快就会让人烦，按压态（.tap 类的缩放）负责
// 「我点到了」，这里只负责「事情成了」。
function ok() {
  try {
    // type: 'light' 基础库 2.13.0+ 才认，旧机型走 fail 兜底，不报错
    wx.vibrateShort({ type: 'light', fail: () => {} });
  } catch (e) { /* 极旧基础库没有这个 API，静默跳过 */ }
}

module.exports = { ok };
