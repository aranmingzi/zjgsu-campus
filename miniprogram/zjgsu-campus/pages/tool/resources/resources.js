// pages/tool/resources/resources.js —— 学习资料共享
//
// 文件本体存云存储，云端只存元数据（resources 集合）。
// 下载走两条路：先试 wx.cloud.downloadFile（fileID 直连，不用配域名白名单），
// 失败再让云函数签临时链接兜底。哪条通了都能打开。
//
// 「感谢」是唯一的激励：个人主体不能做支付、不能搞积分提现，
// 用一句「感谢」把「白嫖党」变成「也会上传的人」最现实。
const cloud = require('../../../utils/cloud.js');
const userApi = require('../../../utils/user.js');

const CATS = ['笔记', '真题', '讲义', '其他'];

Page({
  data: {
    cats: ['全部'].concat(CATS),
    category: '全部',
    catMap: {},
    list: [],
    keyword: '',
    loading: true,
    uploading: false,
    // 上传表单
    form: { title: '', courseName: '', desc: '', category: '笔记', fileID: '', fileName: '', size: 0 },
    catFormMap: {},
    showForm: false
  },

  onLoad() {
    this.setData({ catMap: this.buildCatMap('全部'), catFormMap: this.buildCatFormMap('笔记') });
    this.load();
  },

  buildCatMap(cur) {
    const m = {};
    this.data.cats.forEach((c) => { m[c] = c === cur; });
    return m;
  },

  buildCatFormMap(cur) {
    const m = {};
    CATS.forEach((c) => { m[c] = c === cur; });
    return m;
  },

  async load() {
    const list = await userApi.resourceList({
      category: this.data.category === '全部' ? '' : this.data.category,
      courseName: this.data.keyword
    });
    this.setData({
      list: (list || []).map((r) => Object.assign({}, r, {
        // WXML 里不能调方法，这些派生字段都在这里算好
        catIcon: r.category === '笔记' ? 'notebook-pen' : (r.category === '真题' ? 'file-text' : (r.category === '讲义' ? 'book-open' : 'inbox')),
        ext: String(r.fileName || '').split('.').pop().toUpperCase() || '文件'
      })),
      loading: false
    });
  },

  onCategory(e) {
    const c = e.currentTarget.dataset.c || '全部';
    this.setData({ category: c, catMap: this.buildCatMap(c) });
    this.load();
  },

  onSearch(e) {
    const kw = e.detail.value;
    this.setData({ keyword: kw });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.load(), 300);
  },

  /* ---------------- 上传 ---------------- */

  onToggleForm() {
    this.setData({ showForm: !this.data.showForm });
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k;
    const form = Object.assign({}, this.data.form);
    form[k] = e.detail.value;
    this.setData({ form: form });
  },

  onFormCategory(e) {
    const c = e.currentTarget.dataset.c;
    const form = Object.assign({}, this.data.form, { category: c });
    this.setData({ form: form, catFormMap: this.buildCatFormMap(c) });
  },

  // 从聊天记录里选文件（PDF / Word / PPT 都能选），比相册更适合传资料
  chooseFile() {
    if (this.data.uploading) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const f = (res.tempFiles || [])[0];
        if (!f) return;
        if (f.size && f.size > 20 * 1024 * 1024) {
          wx.showToast({ title: '文件太大了，20MB 以内', icon: 'none' });
          return;
        }
        this.upload(f);
      },
      fail: () => {}
    });
  },

  async upload(file) {
    if (!cloud.ensureCloud()) {
      wx.showToast({ title: '云存储未开启，传不了', icon: 'none' });
      return;
    }
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中', mask: true });
    const ext = String(file.name || file.path || '').split('.').pop() || 'dat';
    const cloudPath = 'resources/' + (cloud.getOpenid() || 'me') + '_' + Date.now() + '.' + ext;
    const up = await wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: file.path }).catch(() => null);
    wx.hideLoading();
    this.setData({ uploading: false });
    if (!up || !up.fileID) {
      wx.showToast({ title: '上传失败，再试一次', icon: 'none' });
      return;
    }
    const form = Object.assign({}, this.data.form, {
      fileID: up.fileID,
      fileName: file.name || '',
      size: file.size || 0,
      title: this.data.form.title || String(file.name || '').replace(/\.[^.]+$/, '')
    });
    this.setData({ form: form });
    wx.showToast({ title: '文件已就绪，补个名字就能发', icon: 'none' });
  },

  async onSubmit() {
    const f = this.data.form;
    if (!f.fileID) {
      wx.showToast({ title: '先选一个文件', icon: 'none' });
      return;
    }
    if (!f.title.trim()) {
      wx.showToast({ title: '给资料起个名字', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '发布中', mask: true });
    const r = await userApi.resourceAdd({
      title: f.title.trim(),
      desc: f.desc,
      category: f.category,
      courseName: f.courseName,
      fileID: f.fileID,
      fileName: f.fileName,
      size: f.size
    });
    wx.hideLoading();
    if (!r || r.ok === false) {
      wx.showToast({ title: (r && r.msg) || '发布失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已发布，谢谢分享', icon: 'success' });
    this.setData({
      showForm: false,
      form: { title: '', courseName: '', desc: '', category: '笔记', fileID: '', fileName: '', size: 0 }
    });
    this.load();
  },

  /* ---------------- 下载 / 感谢 ---------------- */

  async onOpen(e) {
    const item = this.data.list[e.currentTarget.dataset.i];
    if (!item) return;
    wx.showLoading({ title: '打开中', mask: true });
    // 先直连 fileID：云开发通道，不需要配域名白名单
    let path = await wx.cloud.downloadFile({ fileID: item.fileID })
      .then((r) => r.tempFilePath)
      .catch(() => '');
    // 兜底：让云函数签一个临时链接（文件权限收紧时也打得开）
    if (!path) {
      const r = await userApi.resourceUrl(item.id);
      if (!r || !r.url) {
        wx.hideLoading();
        wx.showToast({ title: '这个文件打不开了', icon: 'none' });
        return;
      }
      const d = await wx.downloadFile({ url: r.url }).catch(() => null);
      path = d && d.tempFilePath ? d.tempFilePath : '';
    }
    wx.hideLoading();
    if (!path) {
      wx.showToast({ title: '下载失败', icon: 'none' });
      return;
    }
    wx.openDocument({
      filePath: path,
      fileType: this.guessType(item.fileName),
      showMenu: true,
      fail: () => wx.showToast({ title: '这个文件类型打不开', icon: 'none' })
    });
  },

  guessType(name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].indexOf(ext) >= 0) return 'doc';
    if (['xls', 'xlsx'].indexOf(ext) >= 0) return 'xls';
    if (['ppt', 'pptx'].indexOf(ext) >= 0) return 'ppt';
    return '';
  },

  async onThanks(e) {
    const i = e.currentTarget.dataset.i;
    const item = this.data.list[i];
    if (!item || item.isMine) return;
    const r = await userApi.resourceThanks(item.id);
    if (r && r.ok !== false) {
      const list = this.data.list.slice();
      list[i] = Object.assign({}, item, {
        thanked: !!r.thanked,
        thanksCount: r.thanksCount || (item.thanked ? item.thanksCount - 1 : item.thanksCount + 1)
      });
      this.setData({ list: list });
    }
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删掉这份资料？',
      content: '已经下载过的同学不受影响',
      success: async (r) => {
        if (!r.confirm) return;
        await userApi.resourceRemove(id);
        this.load();
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '商砖小站 · 学长学姐的笔记和真题都在这儿',
      path: '/pages/tool/resources/resources'
    };
  }
});
