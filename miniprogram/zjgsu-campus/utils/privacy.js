// utils/privacy.js —— 微信「用户隐私保护指引」授权
//
// 小程序里只要用到用户个人信息（这里是昵称、头像、学院、联系方式），
// 就必须在 mp 后台如实填报《用户隐私保护指引》，并在首次收集前弹窗告知。
// app.json 里 __usePrivacyCheck__: true 打开这项检查，这里负责弹窗与跳转。
//
// 注意：mp 后台的填报动作仍需你本人去 mp.weixin.qq.com 完成，
// 只改代码不行——微信审核会看后台配置。

function getPrivacyName() {
  return new Promise((resolve) => {
    if (!wx.getPrivacySetting) return resolve('《用户隐私保护指引》');
    wx.getPrivacySetting({
      resolveWithDetail: true,
      success: (res) => resolve(res.privacyContractName || '《用户隐私保护指引》'),
      fail: () => resolve('《用户隐私保护指引》')
    });
  });
}

// 是否已经授权过（授权状态由微信侧保留）
function isAuthorized() {
  return new Promise((resolve) => {
    if (!wx.getPrivacySetting) return resolve(true);
    wx.getPrivacySetting({
      resolveWithDetail: true,
      success: (res) => resolve(!res.needAuthorization),
      fail: () => resolve(true)
    });
  });
}

// 打开微信提供的协议原文页（微信托管，不用自己写网页）
function openContract() {
  wx.openPrivacyContract({
    fail: () => wx.showToast({ title: '协议页打不开', icon: 'none' })
  });
}

// 注册授权监听：需要授权时会被回调，弹窗后必须调 resolve 告诉用户的选择
function setup(resolver) {
  if (!wx.onNeedPrivacyAuthorization) return;
  wx.onNeedPrivacyAuthorization((resolve) => {
    getPrivacyName().then((name) => {
      wx.showModal({
        title: '用户隐私保护提示',
        content: '为了让你能正常使用同学名片与联系方式交换，需要同意《' + name + '》。我们不会向任何第三方提供你的信息。',
        confirmText: '同意并继续',
        cancelText: '暂不同意',
        success: (res) => {
          if (res.confirm) {
            // 同意：无参 resolve 表示用户已授权
            resolve();
          } else {
            // 不同意：给回执，微信会停在触发点等用户操作
            resolve({ eventType: 'cancel' });
            wx.showToast({ title: '未同意则无法使用相关功能', icon: 'none', duration: 2000 });
          }
        },
        fail: () => resolve({ eventType: 'cancel' })
      });
    });
    if (typeof resolver === 'function') resolver();
  });
}

module.exports = { getPrivacyName, isAuthorized, openContract, setup };
