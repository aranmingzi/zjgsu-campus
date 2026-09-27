// app.js
const cloud = require('./utils/cloud.js');
const privacy = require('./utils/privacy.js');

// 应用说明的欢迎弹窗只弹一次，看没看过记在这个本机缓存键里
const GUIDE_KEY = 'zjgsu_guide_shown';

App({
  globalData: {
    // 主题色：浙商大蓝
    themeColor: '#1a5fb4',
    userInfo: null,
    openid: ''
  },

  onLaunch() {
    // 隐私授权：需要在收集信息前先得到用户同意，微信会回调过来
    privacy.setup();

    // 初始化一个本地模拟用户（无真实登录；云开发下 openid 用于区分“我的”）
    const user = wx.getStorageSync('zjgsu_user');
    if (user && user.nickName) {
      this.globalData.userInfo = user;
    } else {
      const defaultUser = {
        nickName: '浙小商',
        avatar: '',
        motto: '浙江工商大学 · 在读'
      };
      wx.setStorageSync('zjgsu_user', defaultUser);
      this.globalData.userInfo = defaultUser;
    }
    // 云开发提前初始化：原来要等第一次发帖/点赞时才 init，第一次点发布会多卡一下
    if (cloud.cfg.USE_CLOUD) cloud.ensureCloud();

    // 初始化存储（云模式下会把云端数据拉到本地缓存，页面仍读本地，无需改动）
    const store = require('./utils/store.js');
    store.initStore();

    // 云开发：异步获取 openid（开关关闭时自动跳过）
    // openid 是全校唯一的身份 ID，拿到之后顺手把「我」的资料登记到云端
    if (cloud.cfg.USE_CLOUD) {
      cloud.fetchOpenid().then((id) => {
        this.globalData.openid = id;
        if (id) {
          require('./utils/user.js').initUser();
        }
      });

      // 冷启动预热：云函数部署完的第一次调用要初始化 SDK，真机上常常超过默认的
      // 3 秒超时，用户碰到就是「点一下没反应」或直接 Timeout。这里在启动时空跑
      // 一次最轻的 whoami，把这次开销提前付掉（超时失败也无所谓，不影响任何功能）。
      wx.cloud.callFunction({ name: 'user', data: { action: 'whoami' } })
        .then(() => {})
        .catch(() => {});
    }

    this.showGuideOnce();
  },

  // 第一次打开小程序时提示一次「应用说明在哪」。
  // 只弹一次：点完就写进本机缓存，以后不再拦路 —— 每次打开都弹的欢迎窗最招人烦。
  // onLaunch 只在冷启动时跑（后台切回来走的是 onShow），所以切回来不会再弹一次。
  showGuideOnce() {
    let seen = false;
    try { seen = !!wx.getStorageSync(GUIDE_KEY); } catch (e) { seen = false; }
    if (seen) return;

    // 延迟弹：onLaunch 时首页还在渲染，立刻弹窗会和页面动画、隐私授权窗撞在一起
    setTimeout(() => {
      wx.showModal({
        title: '欢迎来到商砖小站',
        content: '五个底部标签和五个小工具都是干什么的，都写在应用说明里了。在「我的」页点「应用说明」随时能翻。',
        confirmText: '去看看',
        cancelText: '知道了',
        success: (r) => {
          // 取消也算看过：不看的意愿同样值得尊重，别二次打扰
          try { wx.setStorageSync(GUIDE_KEY, 1); } catch (e) {}
          if (r.confirm) {
            wx.navigateTo({ url: '/pages/user/guide/guide' });
          }
        },
        fail: () => {}
      });
    }, 1200);
  }
});
