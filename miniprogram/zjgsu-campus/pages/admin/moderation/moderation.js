// pages/admin/moderation —— 内容审核
//
// 设计前提：日常绝大部分举报由服务端自动处理（达到阈值就下架），
// 这里只处理「系统拿不准」的少数，并且一律用批量按钮，不做逐条判断。
//
//  1. 想进本页面，得先把自己的身份 ID 填进云函数环境变量 MODERATORS
//     （「我的」页里有「复制我的身份 ID」），填完重新部署云函数
//  2. 若提示「缺少集合」，按提示去云开发控制台建一下（建完回来刷新即可）
//  3. 队列清空后，日常基本不用再管
const store = require('../../../utils/store.js');
const userApi = require('../../../utils/user.js');
const cloud = require('../../../utils/cloud.js');
const CFG = require('../../../utils/config.js');

// 「观察期」这三个字在服务端和前端各写了一份，这里取前端那一份当展示文案
const ABUSER_BADGE = (CFG && CFG.MODERATION && CFG.MODERATION.ABUSER_BADGE) || '观察期';

// 环境自检结果缓存：云函数默认超时 3 秒，反复进出页面跑全量自检容易撞上
// 真机上的 Timeout。5 分钟内直接复用上一次的结果，下拉刷新才强制重跑。
const DIAG_CACHE_MS = 5 * 60 * 1000;
const DIAG_KEY = 'zjgsu_mod_diag';

// 自检发现缺什么，直接说人话，别让用户对着报错猜
const DIAG_HINT = {
  users: '数据库还没建「用户库」，个人资料用不了。',
  posts: '数据库还没建「帖子库」，论坛用不了。',
  reviews: '数据库还没建「评价库」，课程评价用不了。',
  contacts: '数据库还没建「好友库」，同学广场用不了。',
  reports: '数据库还没建「举报库」，举报功能用不了。',
  admins: '数据库还没建「审核员名册」，自助登记审核员用不了。',
  favs: '数据库还没建「收藏库」，收藏用不了。',
  market: '数据库还没建「失物招领库」，失物招领用不了。',
  chats: '数据库还没建「私信库」，私信用不了。',
  resources: '数据库还没建「学习资料库」，学习资料用不了。',
  calendar: '数据库还没建「校历库」，校历倒计时用不了。',
  places: '数据库还没建「校园地点库」，校园地图用不了。',
  memos: '数据库还没建「备忘录库」（集合名 memos），我的备忘用不了。',
  app_config: '数据库还没建「配置库」（集合名 app_config），改动通知模板 ID、一键导入校历会失败。'
};

Page({
  data: {
    // 三个分区：举报队列 / 置顶管理 / 通知与数据
    tab: 'reports',
    queue: [],
    checked: [],
    checkedMap: {},
    pending: 0,
    hasAbuse: false,     // 队列里有没有「观察期」的票，需要你亲自判
    abuseBadge: ABUSER_BADGE,
    myOpenid: '',
    isMod: false,
    // 诊断用：前端名单（config.js）认不认当前 ID / 云函数到底答没答复。
    // 「配了 MODERATORS 还说不是审核员」的问题，十有八九能从这两行看出卡在哪一环
    localOk: false,
    diagDone: false,
    diagHint: '',
    loading: true,
    tip: '',
    needSetup: false,   // 环境没就绪（集合没建 / 云函数没部署）
    setupSteps: [],
    // 置顶管理
    pinList: [],
    pinnedCount: 0,
    // 通知设置（订阅消息模板 ID）
    submsg: { reply: '', chat: '' },
    submsgInput: { reply: '', chat: '' },
    submsgFromEnv: { reply: false, chat: false },
    cfgTip: ''
  },

  onShow() {
    const oid = cloud.getOpenid() || '';
    this.setData({
      myOpenid: oid,
      // 前端名单（config.js）认不认当前 ID。和云函数侧的判定分开摆，
      // 两边不一致就是「环境变量没生效」，一致但不认就是「ID 本身配错了」
      localOk: !!oid && userApi.isModerator({ openid: oid })
    });
    this.refreshDiagHint();
    // 先跑快通道（身份 + 举报队列），全量自检放后台：
    // 每次进页面都跑一遍 9 个集合的探测，真机上会撞云函数 3 秒超时
    this.loadQueue();
    this.checkEnv();
    // 进通知分区时才拉配置，别的分区不多这一趟网络请求
    if (this.data.tab === 'notice') this.loadCfg();
    if (this.data.tab === 'pin') this.loadPinList();
  },

  // 把「前端名单 vs 云函数」两边的判定合成一句人话，写进引导卡。
  // 只有两边都认时才用不上这段话（那时页面走绿条分支）
  refreshDiagHint() {
    const oid = this.data.myOpenid;
    const localOk = !!this.data.localOk;
    const cloudOk = !!this.data.isMod;   // isMod 由 whoami / diag 写入，都是云函数侧的判定
    const done = !!this.data.diagDone;   // 云函数到底有没有答话
    let hint = '';
    if (!oid) {
      hint = '身份还没拿到，多半是 login 云函数没部署：右键 cloudfunctions/login →「上传并部署：云端安装依赖」。';
    } else if (localOk && !cloudOk) {
      hint = done
        ? '前端名单里有你，但云函数还不认 —— 说明环境变量 MODERATORS 没保存上，或改了没重新部署。去控制台核对值（区分大小写），保存后右键 user 云函数 →「上传并部署」，再下拉刷新本页。'
        : '云函数还在应答，等一秒再看…';
    } else if (!localOk && cloudOk) {
      hint = '云函数已经认你了。回到「我的」页重新进来一次就全绿了。';
    } else if (!localOk && !cloudOk) {
      hint = done
        ? '两边名单都没有你当前这串 ID —— 常见于换过微信登录开发者工具 / 换过云环境，openid 变了。把上面这串新 ID 重新填进环境变量 MODERATORS（区分大小写），保存后重新部署 user。'
        : '云函数还没连上：右键 cloudfunctions/user →「上传并部署：云端安装依赖」，部署完下拉刷新。';
    }
    this.setData({ diagHint: hint });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab: tab, cfgTip: '' });
    // 切过去才加载对应分区的数据，页面首屏少两个请求
    if (tab === 'notice') this.loadCfg();
    if (tab === 'pin') this.loadPinList();
  },

  /* ---------------- 置顶管理 ---------------- */

  // 列表取本地缓存（云端同步回来的帖子在本地也有一份），
  // 点赞置顶都要走云端，别人手机上立刻能看到效果
  loadPinList() {
    const list = store.getPosts({ sort: 'latest' }).slice(0, 30).map((p) => ({
      id: p.id,
      title: p.title || '（无标题）',
      board: p.board,
      pinned: !!p.pinned,
      likes: p.likes || 0,
      comments: (p.comments || []).length,
      time: p.time
    }));
    this.setData({
      pinList: list,
      pinnedCount: list.filter((p) => p.pinned).length
    });
  },

  async togglePin(e) {
    if (!this.data.isMod) {
      wx.showToast({ title: '还不是审核员，先登记一下', icon: 'none' });
      return;
    }
    const id = e.currentTarget.dataset.id;
    const item = (this.data.pinList || []).find((p) => p.id === id);
    const next = !(item && item.pinned);
    wx.showLoading({ title: next ? '置顶中' : '取消中', mask: true });
    const r = await store.setPostPinned(id, next).catch(() => ({ ok: false, msg: '网络异常' }));
    wx.hideLoading();
    if (!r || r.ok === false) {
      wx.showToast({ title: (r && r.msg) || '操作失败', icon: 'none' });
      this.loadPinList();
      return;
    }
    wx.showToast({ title: r.msg || (next ? '已置顶' : '已取消置顶'), icon: 'success' });
    this.loadPinList();
  },

  /* ---------------- 通知设置（订阅消息模板 ID） ---------------- */

  // 模板 ID 从云端读（审核员存到 app_config 集合），读不到就是还没配
  loadCfg() {
    userApi.cfgGet().then((r) => {
      if (!r) return;
      this.setData({
        submsg: r.submsg || { reply: '', chat: '' },
        submsgFromEnv: r.fromEnv || { reply: false, chat: false }
      });
      const ids = r.submsg || {};
      // 已配的先带出来，审核员不用重新粘贴一遍
      this.setData({
        submsgInput: {
          reply: String(ids.reply || ''),
          chat: String(ids.chat || '')
        }
      });
    }).catch(() => {});
  },

  onCfgInput(e) {
    const k = e.currentTarget.dataset.k || '';
    const input = Object.assign({}, this.data.submsgInput);
    input[k] = e.detail.value;
    this.setData({ submsgInput: input, cfgTip: '' });
  },

  saveCfg() {
    if (!this.data.isMod) {
      wx.showToast({ title: '还不是审核员', icon: 'none' });
      return;
    }
    const submsg = {
      reply: String((this.data.submsgInput.reply || '').trim()),
      chat: String((this.data.submsgInput.chat || '').trim())
    };
    if (!submsg.reply && !submsg.chat) {
      this.setData({ cfgTip: '两个都留空 = 关闭订阅消息提醒，其他功能不受影响。' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    userApi.cfgSave(submsg).then((r) => {
      wx.hideLoading();
      if (!r || r.ok === false) {
        wx.showToast({ title: (r && r.msg) || '保存失败', icon: 'none' });
        return;
      }
      this.setData({ cfgTip: r.msg || '已保存', submsg: submsg });
      wx.showToast({ title: '已保存', icon: 'success' });
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  copyTemplateGuide() {
    wx.showModal({
      title: '去哪拿模板 ID',
      content: 'mp 后台 → 功能 → 订阅消息 → 公共模板库：评论类选「评论回复通知」，私信类选「新信件提醒」。关键词按说明里的顺序勾（顺序就是字段编号，提交后锁死）。提交后在「我的模板」→ 详情里复制模板 ID，粘回上面的输入框保存即可。',
      showCancel: false
    });
  },

  /* ---------------- 官方校历一键导入 ---------------- */

  importCalendar() {
    if (!this.data.isMod) {
      wx.showToast({ title: '还不是审核员', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '导入官方校历',
      content: '会用教务处 2026-2027 学年第一学期的时间节点整体替换现有校历（期中、四六级、考研、期末、寒暑假）。确定吗？',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '导入中', mask: true });
        userApi.calendarReset().then((r) => {
          wx.hideLoading();
          wx.showToast({
            title: (r && r.ok) ? '已导入官方校历' : ((r && r.msg) || '导入失败'),
            icon: 'none'
          });
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '导入失败，稍后再试', icon: 'none' });
        });
      }
    });
  },

  // 环境自检：云函数能不能通 + 集合齐不齐 + 我算不算审核员。
  // force = 下拉刷新进来，跳过缓存强制重跑 —— 刚在控制台改完 MODERATORS /
  // 建完集合的人靠它立刻看到新状态，不能再吃 5 分钟的旧缓存
  checkEnv(force) {
    // 云函数默认超时 3 秒，自检要探一遍集合，反复进出页面最容易撞上真机上的
    // Timeout。跑通过的结果在本机缓存 5 分钟，下拉刷新强制重跑。
    let cached = null;
    if (!force) {
      try {
        const c = wx.getStorageSync(DIAG_KEY);
        if (c && c.at && Date.now() - c.at < DIAG_CACHE_MS) cached = c.value;
      } catch (e) { cached = null; }
    }

    if (cached) {
      this.applyDiag(cached);
      return Promise.resolve(cached.missing || []);
    }

    return userApi.diagCloud()
      .then((d) => {
        if (d && d.ok !== false) {
          try { wx.setStorageSync(DIAG_KEY, { at: Date.now(), value: d }); } catch (e) {}
          this.applyDiag(d);
        }
        return (d && d.missing) || [];
      })
      .catch(() => {
        // 云函数根本没部署：整个页面只能显示「先去部署云函数」
        this.setData({
          loading: false,
          needSetup: true,
          tip: '云函数还没部署。在开发者工具里右键 cloudfunctions\\user →「上传并部署：云端安装依赖」，部署完回来刷新这个页面就行。'
        });
        return null;
      });
  },

  // 把自检结果写进页面：集合有没有建 + 我算不算审核员。
  // whoami 和 diag 是并行发的两个请求，谁后到谁说了算 —— 但 diag 晚到且确认
  // 「你是审核员」时，必须把 whoami 早先留下的「还不是审核员」黄条一起收掉，
  // 不然页面会出现绿条「你是审核员」和黄条「还不是」同时挂着的精分现场
  applyDiag(d) {
    const missing = (d && d.missing) || [];
    const mod = !!(d && d.isMod);
    this.setData({
      isMod: mod,
      diagDone: true,
      needSetup: missing.length > 0 || !mod,
      setupSteps: missing.map((n) => DIAG_HINT[n] || '数据库还没建「' + n + '」集合。'),
      tip: mod ? '' : this.data.tip
    });
    this.refreshDiagHint();
  },

  loadQueue() {
    this.setData({ loading: true });
    Promise.all([userApi.whoami(), userApi.getModerationQueue()])
      .then(([me, q]) => {
        const isMod = !!(me && me.isMod);
        const list = (q && q.list) || [];
        this.setData({
          isMod: isMod,
          diagDone: true,
          queue: isMod ? list : [],
          // 队列里有没有「观察期」那种需要人工判的票。WXML 里跑不了数组方法，
          // 所以这个标记得在这儿算好
          hasAbuse: isMod ? list.some((x) => x.reviewOnly) : false,
          pending: isMod ? list.length : 0,
          loading: false,
          tip: isMod
            ? ''
            : (this.data.needSetup ? '' : '当前账号还不是审核员。云端已关闭自助登记，请把上面复制到的身份 ID 填进云函数的 MODERATORS 环境变量。')
        });
        this.refreshDiagHint();
      })
      .catch(() => {
        this.setData({ loading: false, tip: '读取队列失败，稍后下拉重试。' });
        this.refreshDiagHint();
      });
  },


  onPullDownRefresh() {
    // eslint-disable-next-line no-undef
    wx.stopPullDownRefresh();
    this.checkEnv(true).then(() => this.loadQueue());
  },

  toggleCheck(e) {
    const id = e.currentTarget.dataset.rep;
    const checked = this.data.checked.slice();
    const checkedMap = Object.assign({}, this.data.checkedMap);
    const idx = checked.indexOf(id);
    if (idx >= 0) {
      checked.splice(idx, 1);
      delete checkedMap[id];
    } else {
      checked.push(id);
      checkedMap[id] = true;
    }
    // 注意 wxml 里不能用 checked.indexOf()（不支持函数调用，整页会崩），
    // 渲染层判断一律走 checkedMap
    this.setData({ checked: checked, checkedMap: checkedMap });
  },

  // 最常用的一刀切：队列里全驳回，同时把自动下架的内容恢复展示
  rejectAll() {
    const n = this.data.pending;
    if (!n) {
      wx.showToast({ title: '队列是空的', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '批量驳回',
      content: '把 ' + n + ' 条待处理举报全部判定为「证据不足」？被自动下架的内容会一并恢复展示。',
      confirmColor: '#1a5fb4',
      success: (res) => {
        if (!res.confirm) return;
        userApi.resolveReports([], 'reject', true)
          .then((r) => {
            wx.showToast({ title: '已驳回 ' + ((r && r.handled) || 0) + ' 条', icon: 'success' });
            this.setData({ checked: [], checkedMap: {} });
            this.loadQueue();
          })
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
      }
    });
  },

  // 只驳回勾选出来的那几条（同类别的一起清掉）
  rejectChecked() {
    const ids = this.data.checked;
    if (!ids.length) {
      wx.showToast({ title: '先勾选要驳回的', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '批量驳回',
      content: '把勾选的 ' + ids.length + ' 条判定为「证据不足」？',
      confirmColor: '#1a5fb4',
      success: (res) => {
        if (!res.confirm) return;
        userApi.resolveReports(ids, 'reject')
          .then((r) => {
            wx.showToast({ title: '已驳回 ' + ((r && r.handled) || 0) + ' 条', icon: 'success' });
            this.setData({ checked: [], checkedMap: {} });
            this.loadQueue();
          })
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
      }
    });
  },

  // 确认违规：内容直接删除，不可恢复
  confirmOne(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '确认违规',
      content: '确认这条属于违规内容？确认后将被删除，不可恢复。',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        userApi.resolveReports([item.repId], 'confirm')
          .then(() => {
            // 本地缓存同步删掉，免得审核员在自己手机上还看到
            if (item.targetType === 'review') {
              const reviews = wx.getStorageSync('zjgsu_reviews') || [];
              wx.setStorageSync('zjgsu_reviews', reviews.filter((r) => r.id !== item.targetId));
            } else {
              store.deletePost(item.targetId, true);
            }
            wx.showToast({ title: '已删除', icon: 'success' });
            this.setData({ checked: [], checkedMap: {} });
            this.loadQueue();
          })
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
      }
    });
  },

  // 审核员手动恢复一条
  restoreOne(e) {
    const item = e.currentTarget.dataset.item;
    userApi.setContentStatus(item.targetId, 'normal', item.targetType)
      .then((r) => {
        wx.showToast({ title: (r && r.msg) || '已恢复', icon: 'success' });
        this.loadQueue();
      })
      .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
  },

  // 把当前身份 ID 复制出来，万一哪天需要贴到代码里
  onCopyOpenid() {
    const oid = this.data.myOpenid;
    if (!oid) return;
    wx.setClipboardData({
      data: oid,
      success: () => wx.showToast({ title: '已复制', icon: 'none' })
    });
  }
});
