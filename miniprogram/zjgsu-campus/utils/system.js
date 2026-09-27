// utils/system.js —— 自定义导航栏用到的系统信息
// 迁移自 Web 版 AppHeader.vue（window.innerHeight / 胶囊尺寸）。
// 小程序拿不到 window/document，改走 wx.getSystemInfoSync + 胶囊 API。

let cached = null;

function read() {
  try {
    const info = wx.getSystemInfoSync();
    const capsule = wx.getMenuButtonBoundingClientRect
      ? wx.getMenuButtonBoundingClientRect()
      : null;

    const statusBarHeight = info.statusBarHeight || 20;
    // 胶囊高度（没有胶囊时给一个 iPhone SE 的近似值）
    const capsuleHeight = capsule && capsule.height ? capsule.height : 32;
    const capsuleTop = capsule && capsule.top ? capsule.top : statusBarHeight + 4;

    return {
      statusBarHeight,
      capsuleHeight,
      capsuleTop,
      // 导航栏内容区高度：胶囊上下各留一点呼吸空间
      navBarHeight: (capsuleTop - statusBarHeight) * 2 + capsuleHeight,
      // 胶囊右边距，用来对齐标题位置
      capsuleRight: capsule && capsule.right ? info.windowWidth - capsule.right : 12,
      windowWidth: info.windowWidth || 375,
      windowHeight: info.windowHeight || 667,
      safeBottom: info.safeArea && info.safeArea.bottom
        ? Math.max(0, info.windowHeight - info.safeArea.bottom)
        : 0,
      platform: info.platform || 'devtools',
    };
  } catch (e) {
    return {
      statusBarHeight: 20,
      capsuleHeight: 32,
      capsuleTop: 24,
      navBarHeight: 44,
      capsuleRight: 12,
      windowWidth: 375,
      windowHeight: 667,
      safeBottom: 0,
      platform: 'devtools',
    };
  }
}

function system() {
  if (!cached) cached = read();
  return cached;
}

module.exports = {
  system,
  //  vibrate：把 VoteCard / 按钮的 navigator.vibrate 换成小程序官方 API
  vibrateShort() {
    try {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail() {} });
    } catch (e) { /* 不支持就算了，不能因为震动报错打断流程 */ }
  },
};
