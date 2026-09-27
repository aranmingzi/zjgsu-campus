// pages/mine/mine —— 我的
const store = require('../../utils/store.js');
const userApi = require('../../utils/user.js');
const cloud = require('../../utils/cloud.js');
const chat = require('../../utils/chat.js');
const privacy = require('../../utils/privacy.js');

// 备忘连续天数：算法跟备忘页一致（今天没写就从昨天往前数）。
// 备忘录页自己算一份，这里只需要给入口卡片显示个数字，不必引入整个模块。
function calcStreak(dates) {
  if (!dates || !dates.length) return 0;
  const set = {};
  dates.forEach((d) => { set[d] = true; });
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const ds = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const cur = new Date();
  if (!set[ds(cur)]) {
    cur.setDate(cur.getDate() - 1);
    if (!set[ds(cur)]) return 0;
  }
  let n = 0;
  while (set[ds(cur)]) {
    n += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return n;
}

Page({
  data: {
    user: {},
    myReviews: [],
    myPosts: [],
    friendCount: 0,
    reqCount: 0,
    hasContact: false,
    registered: false,
    isMod: false, // 在审核员白名单里才会出现「内容审核」入口
    // 下面几项是「我的」页新加的入口数据
    unreadChat: 0,
    favoriteCount: 0,
    draftCount: 0,
    // 「我的备忘」入口上的小提示：连续记了几天，没写过就是 0
    memoStreak: 0
  },

  onShow() {
    const base = store.getUser();
    // 个人资料以 user.js 为准（云端同步过的），store 里的昵称头像作为本地兜底
    const p = userApi.getMyProfile();
    const user = Object.assign({}, base, {
      nickName: p.nickName || base.nickName,
      avatar: p.avatarUrl || base.avatar,
      college: p.college || '',
      motto: p.motto || (p.contactType ? '联系方式：' + (userApi.CONTACT_LABEL[p.contactType] || '') : base.motto),
      avatarText: (p.nickName || base.nickName || '浙').charAt(0)
    });

    // canDelete 提前算好交给 wxml：早期发的帖/评价没有身份字段，也得能删
    const myReviews = store.getMyReviews().map((r) => {
      const c = store.getCourseById(r.courseId);
      return Object.assign({}, r, {
        courseName: c ? c.name : '未知课程',
        starOn: r.score,
        canDelete: store.isMineReview(r)
      });
    });

    const myPosts = store.getMyPosts().map((p) =>
      Object.assign({}, p, {
        canDelete: store.isMinePost(p),
        hidden: !!p.hidden,
        hiddenReason: p.hiddenReason || ''
      })
    );

    const oid = cloud.getOpenid() || p.openid || '';
    this.setData({
      user,
      myReviews,
      myPosts,
      myOpenid: oid,
      registered: !!oid,
      // 比名单要用真实 openid（cloud.getOpenid()）优先 —— 本地资料里的
      // p.openid 可能是换微信 / 换环境之前留下的旧值，拿它比对会误判
      isMod: userApi.isModerator({ openid: oid }),
      unreadChat: this.data.unreadChat || 0,
      favoriteCount: store.getFavorites().length,
      draftCount: store.getDrafts().length,
      // 头像和昵称都没设定过就提示一下：同学按昵称找人，光靠默认名等于"隐身"
      profileIncomplete: !p.avatarUrl
    });
    this.refreshRelation();
    this.loadMemoStreak();
    // 首次进入时 openid 可能还没拿到，晚一点再刷一次，保证「删除」按钮能正常显示
    if (!oid) {
      setTimeout(() => {
        this.setData({
          myPosts: store.getMyPosts(),
          myOpenid: cloud.getOpenid() || ''
        });
      }, 600);
    }
  },

  // 好友数 / 待处理 / 私信未读：云函数没部署时静默跳过，不打断页面
  refreshRelation() {
    // 审核员状态以云端为准（环境变量 MODERATORS），本地 cfg 那份只是兜底。
    // 「内容审核 / 复制身份 ID / 环境自检」这三个开发向入口只有审核员看得到，
    // 普通同学的「我的」页里不该出现这些装修脚手架
    userApi.whoami()
      .then((w) => { if (w && w.isMod) this.setData({ isMod: true }); })
      .catch(() => {});
    // 身份是异步拿的：刚进页面那一刻多半还没回来，拿空 openid 去比名单，
    // 审核员自己的三个入口就会「时有时无」。等身份落地再补算一次
    const oidNow = cloud.getOpenid();
    const oidReady = oidNow ? Promise.resolve(oidNow) : cloud.fetchOpenid();
    oidReady.then((oid) => {
      if (oid && userApi.isModerator({ openid: oid })) this.setData({ isMod: true });
    }).catch(() => {});
    userApi.listFriends()
      .then((list) => { this.setData({ friendCount: (list || []).length }); })
      .catch(() => {});
    userApi.listRequests()
      .then((list) => { this.setData({ reqCount: (list || []).length }); })
      .catch(() => {});
    const p = userApi.getMyProfile();
    this.setData({ hasContact: !!p.contactValue });

    // 私信未读：进「我的」时顺手带出来，红点没人想点两下才看到
    chat.list()
      .then((list) => {
        const n = (list || []).reduce((s, c) => s + (Number(c.unread) || 0), 0);
        this.setData({ unreadChat: n });
      })
      .catch(() => {});

  },

  // 应用说明：这个小程序都能干什么。首次打开小程序会弹窗指过来一次
  onGuide() {
    wx.navigateTo({ url: '/pages/user/guide/guide' });
  },

  onChats() {
    wx.navigateTo({ url: '/pages/user/chats/chats' });
  },

  onFavorites() {
    wx.navigateTo({ url: '/pages/mine/favorites/favorites' });
  },

  onDrafts() {
    wx.navigateTo({ url: '/pages/mine/drafts/drafts' });
  },

  // 我的备忘：连续天数取自本机缓存，读不到就显示「已连续 0 天」
  goMemo() {
    wx.navigateTo({ url: '/pages/tool/memo/memo' });
  },

  // 校园盲盒 / 漂流瓶：tabBar 满了，从「我的」页也能进
  goBlindbox() {
    wx.navigateTo({ url: '/pages/campus/blindbox/blindbox' });
  },

  loadMemoStreak() {
    const list = wx.getStorageSync('zjgsu_memos') || [];
    const dates = [];
    list.forEach((m) => {
      const d = String((m && m.date) || '');
      if (d && dates.indexOf(d) < 0) dates.push(d);
    });
    this.setData({ memoStreak: calcStreak(dates) });
  },

  // 跳蚤市场已经是底部第 3 个 tab，这里的入口已经撤了（见 mine.wxml）

  // 「清除本机缓存」：把本机所有 zjgsu_ 开头的缓存清干净再重进。
  // 只动本机 —— 云端那份数据不会被删。
  // 以前这里叫「演示模式 / 重置为初始状态」，那是给演示用的；
  // 真上架后每个用户都能点，措辞改成目的：解决本机缓存坏了导致的卡顿、数据错乱。
  onClearCache() {
    wx.showModal({
      title: '清除本机缓存',
      content: '会清掉这台手机上的帖子、评价、收藏、草稿和缓存记录。云端的数据不受影响。确定继续吗？',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        let keys = [];
        try { keys = wx.getStorageInfoSync().keys || []; } catch (e) { keys = []; }
        keys.filter((k) => String(k).indexOf('zjgsu_') === 0).forEach((k) => {
          try { wx.removeStorageSync(k); } catch (e) {}
        });
        wx.showToast({ title: '已重置', icon: 'success' });
        // 等 toast 露出再跳，否则进度一走人就看不到反馈了
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/course/list/list' });
        }, 700);
      }
    });
  },

  // 隐私协议必须随时能翻到：微信在首次收集信息前会弹窗，但用户也该有主动查看的入口
  onOpenPrivacy() {
    privacy.openContract();
  },

  // 环境自检：内容发不出去时，先来这儿看看是「云函数没部署」还是「集合没建」。
  // 提示里能给出的信息有限，只有把缺失清单摆出来，用户才知道下一步该干什么。
  async onDiag() {
    wx.showLoading({ title: '检查中', mask: true });
    let r;
    try {
      r = await userApi.diagCloud();
    } catch (e) {
      r = null;
    } finally {
      wx.hideLoading();
    }
    if (!r || r.ok === false) {
      wx.showModal({
        title: '云函数连不上',
        content: '多半是 user 云函数还没重新部署。去开发者工具里右键 cloudfunctions/user → 上传并部署（云端安装依赖），然后再点一次「环境自检」。',
        showCancel: false
      });
      return;
    }
    const missing = Array.isArray(r.missing) ? r.missing : [];
    const lines = [];
    if (missing.length) {
      lines.push('还没创建的集合：' + missing.join('、'));
      lines.push('（在云开发控制台 → 数据库 → 新建集合，建好再重试）');
    } else {
      lines.push('数据库集合：齐全');
    }
    // 内容安全接口没开通只是「发不出通知和官方审核」，不影响发帖，但得说清楚
    lines.push('官方内容安全接口：' + (r.sec === 'ok' ? '正常' : (r.sec || '未开通')));
    if (r.secErr) lines.push('接口返回：' + String(r.secErr).slice(0, 60));
    wx.showModal({
      title: missing.length ? '有 ' + missing.length + ' 个集合没建' : '一切正常',
      content: lines.join('\n'),
      showCancel: false
    });
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/user/profile/profile' });
  },

  onFriends() {
    wx.navigateTo({ url: '/pages/user/friends/friends' });
  },

  // 内容审核：入口常显。白名单留空时，进去还能一键把自己登记成审核员，
  // 不用改代码也不要去控制台翻 openid（云函数那边仍有真校验）
  onModeration() {
    // 入口人人可见（藏在页面最底部），谁点都直接进审核页：
    // 还不是审核员的人进去看到的是「成为审核员」引导卡 —— 有他当前的身份 ID、
    // 前端名单认不认、云函数认不认，三样摆在一起一眼看出卡在哪一环。
    // 之前在这里弹 modal 把人拦住，等于把排查问题的唯一窗口（环境自检）也关了。
    // 真正的门禁在云函数那边（MODERATORS 环境变量），前端这层只是导航
    wx.navigateTo({ url: '/pages/admin/moderation/moderation' });
  },

  // 自己的帖子被自动下架时，在这里直接恢复，不用去找审核员
  onRestorePost(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '恢复展示',
      content: '确认这条内容没有违规吗？恢复后其他同学就能看到。',
      success: (res) => {
        if (!res.confirm) return;
        store.setPostStatus(id, 'normal');
        this.onShow();
        wx.showToast({ title: '已恢复', icon: 'success' });
      }
    });
  },

  goCourse(e) {
    wx.navigateTo({ url: '/pages/course/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  goPost(e) {
    wx.navigateTo({ url: '/pages/forum/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  // 「我的帖子」列表里直接删，不用先进详情页再翻
  onDeletePost(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除帖子',
      content: '删掉后其他人就看不到这条了，确定吗？',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.deletePost(id);
        this.setData({ myPosts: store.getMyPosts().map((p) =>
          Object.assign({}, p, { canDelete: store.isMinePost(p) })) });
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  // 测试帖攒多了，逐条删太麻烦，这里一键清空（本地缓存 + 云端一起删）
  onClearPosts() {
    const list = this.data.myPosts || [];
    if (!list.length) return;
    wx.showModal({
      title: '清空我的帖子',
      content: '将删除你发布的 ' + list.length + ' 条帖子（云端也会一起清掉），确定吗？',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        list.forEach((p) => store.deletePost(p.id));
        this.setData({ myPosts: [] });
        wx.showToast({ title: '已清空', icon: 'success' });
      }
    });
  },

  onDeleteReview(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条评价',
      content: '删掉后其他人就看不到这条了，确定吗？',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.removeReview(id);
        this.setData({
          myReviews: store.getMyReviews().map((r) => Object.assign({}, r, {
            canDelete: store.isMineReview(r)
          }))
        });
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  }
});
