// pages/forum/post/post.js
// 发帖带图：选图 → 传云存储拿 fileID → 把 fileID 存进帖子。
// 图片走云存储而不是本地路径，别人打开才能看到；fileID 小程序内可直接当 src 用。
const store = require('../../../utils/store.js');
const moderation = require('../../../utils/moderation.js');
const userApi = require('../../../utils/user.js');
const cloud = require('../../../utils/cloud.js');
const notify = require('../../../utils/notify.js');
// 全站同一套精准 / 模糊搜索
const searchCore = require('../../../utils/search.js');

const COURSE_BOARD = '课程评价';
const MAX_IMAGES = 6;

Page({
  data: {
    boards: [],
    board: '',
    title: '',
    content: '',
    isCourseBoard: false,
    courseKeyword: '',
    courseResults: [], // 命中的候选课程 [{ id, name, college }]
    courseId: '',
    courseName: '',
    images: [], // 云存储 fileID 列表
    uploading: false,
    submitting: false,
    // 这次是恢复哪条草稿来的：发成功之后要把它从草稿箱撤掉
    draftId: '',
    // 匿名发布（树洞）：开了以后列表里只显示代号，服务端仍能追到人
    anonymous: false,
    anonTip: '',
    // 帖子类型：normal（普通帖，有标题有正文）/ topic（主题帖，只有标题，信息收评论区）
    kind: 'normal',
    // 切到主题帖时的说明。放在数据里而不是写死在 wxml，
    // 是因为这句话会随板块变（社团板块说「拉群」，别的板块说法不一样）
    topicTip: '',
    // 第三种发帖模式「发起投票」的面板状态：选项 / 单选多选 / 截止时间 / 匿名
    voteOptions: [
      { id: 'vote-option-1', label: '' },
      { id: 'vote-option-2', label: '' }
    ],
    voteMultiple: false,
    voteDeadline: 72,
    voteAnonymous: true,
    voteFilled: 0,
    optionSeq: 3
  },

  onLoad(options) {
    // 默认板块「闲聊」：不想纠结发哪儿的同学，进来直接写就行
    this.setData({
      boards: store.getBoards().map((b) => b.name),
      // 默认落在「社团同好」：冷启动阶段最想让同学发的是这个板块的内容，
      // 默认值就是最省力的引导。真想发别的，切一下就行
      board: '社团同好',
      contactOk: moderation.CONTACT_OK_BOARDS.indexOf('社团同好') >= 0
    });
    // 从草稿箱进来：把没写完的那篇填回表单，并记住是哪一条，发成功好撤掉
    if (options && options.draftId) {
      const d = store.getDraft(options.draftId);
      if (d) {
        this.setData({ draftId: options.draftId });
        const board = this.data.boards.indexOf(d.board) >= 0 ? d.board : '闲聊';
        this.setData({
          board,
          isCourseBoard: board === COURSE_BOARD,
          // 课程关联一起回填：缺了它恢复完会被「先选一门课程」卡住，看着像草稿坏了
          courseId: d.courseId || '',
          courseName: d.courseName || '',
          title: d.title || '',
          content: d.content || '',
          kind: d.kind === 'topic' ? 'topic' : 'normal',
          images: Array.isArray(d.images) ? d.images : [],
          anonymous: !!d.anonymous
        });
      }
      return;
    }
    // 不是从草稿箱进来的，也自动接上最近一篇没写完的：
    // 写一半直接退出去是最伤的，回来应该接着写，而不是面对一张白纸重新回忆
    const last = store.getDrafts().find((x) => x.type === 'post');
    if (last) {
      // 旧草稿可能挂着「课程评价」却丢了课程关联，恢复完会被「先选一门课程」卡死，
      // 这种宁可直接落到「闲聊」，不让用户对着报错猜
      let board = this.data.boards.indexOf(last.board) >= 0 ? last.board : '闲聊';
      if (board === COURSE_BOARD && !last.courseId) board = '闲聊';
      this.setData({
        draftId: last.id,
        board,
        isCourseBoard: board === COURSE_BOARD,
        courseId: last.courseId || '',
        courseName: last.courseName || '',
        title: last.title || '',
        content: last.content || '',
        kind: last.kind === 'topic' ? 'topic' : 'normal',
        images: Array.isArray(last.images) ? last.images : [],
        anonymous: !!last.anonymous
      });
      wx.showToast({ title: '已接上上次没发完的', icon: 'none', duration: 2000 });
    }
  },

  // 页面离开（返回 / 切后台）时自动存草稿：不用记得点「存草稿」，
  // 下次进来直接接着上次写。存的是同一条（内容没变不攒重复），发布成功后自动清。
  autoSaveDraft() {
    if (this._published) return;
    const d = this.data;
    if (!store.hasDraftText({ title: d.title, content: d.content })) {
      // 内容被清空了还留着旧草稿的话，下次进来又会冒出来 —— 把关联那条删掉
      if (d.draftId) store.removeDraft(d.draftId);
      return;
    }
    const saved = store.saveDraft({
      type: 'post',
      board: d.board,
      title: d.title,
      content: d.content,
      // 类型也存：主题帖的正文是空的，不存的话草稿恢复回来会被当成普通帖，
      // 一点发布就被「写点内容」卡住
      kind: d.kind,
      images: d.images,
      anonymous: d.anonymous
    });
    if (saved && saved.id && saved.id !== d.draftId) this.setData({ draftId: saved.id });
  },

  onHide() { this.autoSaveDraft(); },
  onUnload() { this.autoSaveDraft(); },

  // 兜底：界面重新可见时，如果「发布中」的遮罩还挂着（上次提交被中断的情况），
  // 顺手收掉。遮罩是盖满整个页面的，留着会让所有按钮都点不动，
  // 表现就是「点了完全没反应」——而用户根本不知道罪魁是那个遮罩。
  onShow() {
    if (this.data.submitting) {
      const hadStuck = true;
      this.setData({ submitting: false });
      wx.hideLoading();
      if (hadStuck) {
        wx.showToast({ title: '上一条没发完，已复位，可以再试', icon: 'none' });
      }
    }
  },

  // 写一半退出去最伤，这里留个退路：点一下存草稿，什么时候回来都还在
  onSaveDraft() {
    const d = this.data;
    if (!store.hasDraftText({ title: d.title, content: d.content })) {
      wx.showToast({ title: '还没写内容', icon: 'none' });
      return;
    }
    store.saveDraft({
      type: 'post',
      board: d.board,
      title: d.title,
      content: d.content
    });
    // 提示要说清去哪儿找：只说「已保存」，用户回头找不到地方，就会以为草稿丢了
    wx.showToast({ title: '草稿已存，在「我的 → 草稿箱」', icon: 'none', duration: 2500 });
  },

  onBoard(e) {
    const board = e.currentTarget.dataset.b;
    // 切板块时重置课程选择，避免把课程挂到无关板块上
    this.setData({
      board,
      isCourseBoard: board === COURSE_BOARD,
      // 这个板块能不能留联系方式：提示文案要不要出现，由它决定
      contactOk: moderation.CONTACT_OK_BOARDS.indexOf(board) >= 0,
      courseId: '',
      courseName: '',
      courseKeyword: '',
      courseResults: []
    });
  },

  onCourseSearch(e) {
    const raw = e.detail.value;
    this.setData({ courseKeyword: raw });
    const kw = raw.trim();
    if (!kw) {
      this.setData({ courseResults: [] });
      return;
    }
    // 选课程也走同一套精准 / 模糊：同学把课程名打错一个字，
    // 不该在候选列表里彻底搜不到、只能放弃关联课程
    const hits = store
      .getCourses()
      .filter((c) => searchCore.matchFields([c.name, c.major, c.college], kw) >= 0)
      .slice(0, 12)
      .map((c) => ({ id: c.id, name: c.name, college: c.college }));
    this.setData({ courseResults: hits });
  },

  pickCourse(e) {
    this.setData({
      courseId: e.currentTarget.dataset.id,
      courseName: e.currentTarget.dataset.name,
      courseResults: [],
      courseKeyword: ''
    });
  },

  clearCourse() {
    this.setData({ courseId: '', courseName: '', courseResults: [] });
  },

  onTitle(e) {
    this.setData({ title: e.detail.value });
  },

  // 换帖子类型。
  //
  // 主题帖只有标题、正文要留空，所以切过去的第一件事是把正文框里的内容搬走 ——
  // 不然同学写了两百字的正文，切一下发现空格没了，还以为是被吃了。
  // 但搬走也要留个记号，不能默默清空，下次切回来他能找回来。
  onKind(e) {
    const kind = e.currentTarget.dataset.kind === 'topic' ? 'topic' : 'normal';
    if (kind === this.data.kind) return;
    const kept = this.data.content;
    this.setData({
      kind,
      content: kind === 'topic' ? '' : kept,
      // 切回普通帖时，正文确实是他自己写的，得让原话回到框里
      topicTip: kind === 'topic'
        ? '这是一个主题：只写标题。具体信息（群号、地点、报名方式等）留给评论区，'
          + '有需要的同学进来自己看。'
        : ''
    });
  },

  /* ---------------- 发起投票模式（UI 面板） ---------------- */

  onVoteOption(e) {
    const i = Number(e.currentTarget.dataset.i || 0);
    const label = e.detail.value;
    const options = this.data.voteOptions.slice();
    if (!options[i]) return;
    options[i] = Object.assign({}, options[i], { label });
    this.setData({
      voteOptions: options,
      // 有效选项数：至少填 2 个才发得出去
      voteFilled: options.filter((o) => String(o.label || '').trim()).length
    });
  },

  addVoteOption() {
    if (this.data.voteOptions.length >= 8) {
      wx.showToast({ title: '最多 8 个选项', icon: 'none' });
      return;
    }
    const id = 'vote-option-' + this.data.optionSeq;
    this.setData({
      voteOptions: this.data.voteOptions.concat([{ id, label: '' }]),
      optionSeq: this.data.optionSeq + 1
    });
  },

  removeVoteOption(e) {
    if (this.data.voteOptions.length <= 2) return;
    const i = Number(e.currentTarget.dataset.i || 0);
    this.setData({ voteOptions: this.data.voteOptions.filter((o, idx) => idx !== i) });
  },

  moveVoteOption(e) {
    const i = Number(e.currentTarget.dataset.i || 0);
    const offset = Number(e.currentTarget.dataset.d || 0);
    const to = i + offset;
    const list = this.data.voteOptions.slice();
    if (to < 0 || to >= list.length) return;
    const moved = list.splice(i, 1)[0];
    list.splice(to, 0, moved);
    this.setData({ voteOptions: list });
  },

  onVoteMode(e) {
    this.setData({ voteMultiple: e.currentTarget.dataset.m === 'true' });
  },

  onVoteDeadline(e) {
    this.setData({ voteDeadline: Number(e.currentTarget.dataset.h || 72) });
  },

  onVoteAnonymous() {
    this.setData({ voteAnonymous: !this.data.voteAnonymous });
  },

  // 匿名开关：只是「对同学隐藏」，不是「对平台隐身」——
  // 违规内容照样能追到人，这句话必须让用户看见
  toggleAnonymous() {
    const on = !this.data.anonymous;
    this.setData({
      anonymous: on,
      anonTip: on ? '已匿名：别人只看到「匿名·xxxx」，你仍能在「我的」里找到它' : ''
    });
  },

  onContent(e) {
    this.setData({ content: e.detail.value });
  },

  // 选图：本地只留一份临时路径，真正用的是上传后的 fileID
  chooseImages() {
    // 上一批还在传就别再开相册：既会重复计费上传，界面上也只会让人觉得「点了没反应」
    if (this.data.uploading) {
      wx.showToast({ title: '图片还在上传，稍等一下', icon: 'none' });
      return;
    }
    const rest = MAX_IMAGES - this.data.images.length;
    if (rest <= 0) {
      wx.showToast({ title: '最多 ' + MAX_IMAGES + ' 张', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: rest,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map((f) => f.tempFilePath);
        this.uploadImages(files);
      },
      // 用户自己从相册退出来不算错误，静默即可；
      // 真出错（没授权 / 设备不支持）必须说话，否则界面上就是「点了完全没反应」
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('cancel') >= 0) return;
        wx.showToast({ title: '选图没打开，检查下相册权限', icon: 'none' });
      }
    });
  },

  async uploadImages(files) {
    if (!cloud.ensureCloud()) {
      wx.showToast({ title: '云存储未开启，图片这次发不出去', icon: 'none' });
      return;
    }
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中', mask: true });
    // 几张图同时传：原来一张等一张，6 张图就是 6 倍时间，这里改成一次并发
    const tasks = files.map((f) => {
      const ext = (f.split('.').pop() || 'jpg').toLowerCase();
      const cloudPath = 'forum/' + (cloud.getOpenid() || 'me') + '_' + Date.now() + '_'
        + Math.floor(Math.random() * 1000) + '.' + ext;
      return wx.cloud.uploadFile({ cloudPath, filePath: f }).catch(() => null);
    });
    const results = await Promise.all(tasks);
    const done = results.filter((r) => r && r.fileID).map((r) => r.fileID);
    wx.hideLoading();
    this.setData({
      images: this.data.images.concat(done),
      uploading: false
    });
    if (files.length && !done.length) {
      wx.showToast({ title: '图片上传失败，帖子仍可发出', icon: 'none' });
    }
  },

  removeImage(e) {
    const i = e.currentTarget.dataset.i;
    const images = this.data.images.slice();
    images.splice(i, 1);
    this.setData({ images });
  },

  previewImage(e) {
    wx.previewImage({ current: e.currentTarget.dataset.src, urls: this.data.images });
  },

  async submit() {
    // 上一次提交卡住时（云函数超时、被强退）submitting 会留在 true，
    // 按钮看着能点、实则每次进来都在这里被静默吃掉 —— 用户看到的就是「点了没反应」。
    // 必须说清楚，否则用户只会以为程序坏了。
    if (this.data.submitting) {
      wx.showToast({ title: '还在发上一条，稍等一下', icon: 'none' });
      return;
    }
    // 不选板块也能发：兜底归进「闲聊」，不再拦着（ board 正常流程在 onLoad 就有默认值）
    const board = this.data.board || '闲聊';
    if (this.data.isCourseBoard && !this.data.courseId) {
      wx.showToast({ title: '先选一门课程', icon: 'none' });
      return;
    }
    const title = this.data.title.trim();
    const content = this.data.content.trim();
    // 投票帖不带正文，和主题帖一样放行（store.addPost 仍按自己的字段落库）
    const kind = this.data.kind === 'topic' || this.data.kind === 'vote' ? this.data.kind : 'normal';
    if (!title) {
      wx.showToast({ title: kind === 'topic' ? '给这个主题起个名字' : '写个标题', icon: 'none' });
      return;
    }
    // 主题帖和投票帖的定义就是「不带正文」，所以这里反过来：正文有内容才要拦。
    // 普通帖仍然坚持「正文不能空」—— 发个光秃秃的标题占个位置，对看的人没有意义
    if (kind === 'topic') {
      if (content) {
        wx.showToast({ title: '主题帖不写正文', icon: 'none' });
        return;
      }
    } else if (kind === 'normal' && !content) {
      wx.showToast({ title: '写点内容', icon: 'none' });
      return;
    }
    // 投票帖必须有两个以上填了字儿的选项，否则发出去是一张投不了票的空卡
    if (kind === 'vote' && this.data.voteFilled < 2) {
      wx.showToast({ title: '至少填写 2 个投票选项', icon: 'none' });
      return;
    }
    // 带上板块：社团同好 / 活动组队里留群号联系方式是正常内容，不该被屏蔽词挡住。
    // 主题帖的正文是空的，过 guardText 的前提是拼接串里至少要有东西可查
    if (!moderation.guardText(title + ' ' + content, '帖子', this.data.board)) return;

    // 点下去立刻给反馈：云函数校验要跑一个来回，之前这一步没反馈，用户以为卡住了
    this.setData({ submitting: true });
    wx.showLoading({ title: '发布中', mask: true });
    let r;
    try {
      // 身份预热：和下面这轮服务端校验并行跑。
      // login 云函数没部署时 fetchOpenid 要等满 5 秒兜底，而 addPost 内部判断
      // 「还没拿到 openid」时会再等一轮 —— 串起来就是两次满 5 秒，点一下要干等十几秒。
      // 这里先并行跑掉，等 addPost 走到那一步通常已经缓存好了，直接跳过等待。
      if (cloud.cfg.USE_CLOUD && cloud.ensureCloud()) {
        cloud.fetchOpenid().catch(() => {});
      }
      // 服务端权威校验（本地词表只是提示，拦截权在云函数）
      const safe = await userApi.checkText({ title: title, content: content });
      if (safe && safe.ok === false) {
        wx.showToast({ title: safe.msg || '内容不合适', icon: 'none' });
        return;
      }
      // 等云端审完再报结果：内容被驳回时直接把人留下，别让他带着「发布成功」的错觉走掉
      r = await store.addPost({
        board: board,
        title,
        content,
        kind,
        courseId: this.data.courseId,
        courseName: this.data.courseName,
        images: this.data.images,
        anonymous: this.data.anonymous
      });
    } catch (e) {
      // 网络超时 / 云函数崩了：转圈必须收掉，否则界面永久停在「发布中」，用户什么都点不了
      r = { ok: false, saved: false, msg: '网络好像不太稳，内容先存在本机了' };
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
    if (!r || r.ok === false) {
      // 云端存不住时内容还在本机，说清楚「到底发没发出去」，别让人反复重写一遍
      wx.showToast({ title: (r && r.msg) || '内容没能发出去', icon: 'none', duration: 3000 });
      return;
    }
    wx.showToast({ title: '发布成功', icon: 'success' });
    // 发成功了就别让 onUnload 再自动存一遍草稿（不然刚发的内容又进草稿箱）
    this._published = true;
    // 从草稿箱恢复着发的，发完就把那条草稿撤掉，
    // 否则草稿箱里会留一条跟刚发的帖子一模一样的东西，看着像出了错
    if (this.data.draftId) store.removeDraft(this.data.draftId);
    // 刚发完帖子是「最想要被回复」的时刻，这时候要授权通过率最高；
    // 没配模板 ID 就静默跳过
    notify.request('reply');
    // 400ms 就返回：够看清「发布成功」，又不用干等
    setTimeout(() => {
      wx.navigateBack();
    }, 400);
  }
});
