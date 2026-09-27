// pages/market/edit/edit.js —— 发布失物 / 招领 / 二手
// 图片必须上传到云存储换成 fileID：本地临时路径换设备就没了，别人也打不开。
const cloud = require('../../../utils/cloud.js');
const market = require('../../../utils/market.js');
const store = require('../../../utils/store.js');

const MAX_IMAGES = 6;
const TYPES = [
  { key: 'lost', label: '我丢了东西', icon: '🔍' },
  { key: 'found', label: '我捡到东西', icon: '📦' },
  { key: 'sell', label: '闲置分享', icon: '🛍️' }
];

function catMap(current) {
  const m = {};
  market.CATEGORIES.forEach((c) => { m[c.key] = c.key === current; });
  return m;
}

Page({
  data: {
    types: TYPES,
    type: 'lost',
    // 切换类型靠 map：WXML 里写不了函数，选中态只能靠数据表达
    typeMap: { lost: true, found: false, sell: false },
    title: '',
    desc: '',
    location: '',
    price: '',
    contact: '',
    contactType: 'phone',
    contactTypes: [
      { key: 'phone', label: '手机号' },
      { key: 'wechat', label: '微信号' },
      { key: 'qq', label: 'QQ号' },
      { key: 'other', label: '其他' }
    ],
    contactTypeMap: { phone: true, wechat: false, qq: false, other: false },
    images: [],
    uploading: false,
    showPrice: false,
    // 闲置分类（教材 / 数码 / 生活 / 其他）+ 教材对应的课程名
    cats: market.CATEGORIES,
    category: 'other',
    catMap: catMap('other'),
    courseName: '',
    showCategory: false
  },

  onLoad(options) {
    const t = options.type || 'lost';
    if (market.TYPES[t]) this.setType(t);
    // 带上自己的联系方式默认值，减少一次输入
    const u = store.getUser();
    if (u && u.nickName) this.setData({ contact: u.contact || '' });

    // 从草稿箱进来：草稿里的联系方式要覆盖上面的默认值，所以放在它后面
    if (options.draftId) {
      const d = store.getDraft(options.draftId);
      if (d) {
        if (market.TYPES[d.board]) this.setType(d.board);
        this.setData({
          title: d.title || '',
          desc: d.content || '',
          location: d.location || '',
          price: d.price || '',
          contact: d.contact || ''
        });
      }
    }
  },

  setType(t) {
    const typeMap = {};
    const contactTypeMap = {};
    TYPES.forEach((x) => { typeMap[x.key] = x.key === t; });
    const ct = this.data.contactType;
    ['phone', 'wechat', 'qq', 'other'].forEach((k) => { contactTypeMap[k] = k === ct; });
    this.setData({
      type: t,
      typeMap,
      contactTypeMap,
      showPrice: t === 'sell',
      showCategory: t === 'sell'
    });
  },

  onCategory(e) {
    const k = e.currentTarget.dataset.k || 'other';
    this.setData({ category: k, catMap: catMap(k) });
  },

  onType(e) {
    this.setType(e.currentTarget.dataset.k);
  },

  onContactType(e) {
    const k = e.currentTarget.dataset.k;
    const contactTypeMap = {};
    ['phone', 'wechat', 'qq', 'other'].forEach((x) => { contactTypeMap[x] = x === k; });
    this.setData({ contactType: k, contactTypeMap });
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k;
    const patch = {};
    patch[k] = e.detail.value;
    this.setData(patch);
  },

  /* ---------------- 图片 ---------------- */

  chooseImages() {
    if (this.data.uploading) return;
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
        this.uploadImages((res.tempFiles || []).map((f) => f.tempFilePath));
      },
      fail: () => {}
    });
  },

  async uploadImages(files) {
    if (!cloud.ensureCloud()) {
      wx.showToast({ title: '云存储未开启，图片这次发不出去', icon: 'none' });
      return;
    }
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中', mask: true });
    // 几张图并发传，别一张一张等
    const tasks = files.map((f) => {
      const ext = (f.split('.').pop() || 'jpg').toLowerCase();
      const cloudPath = 'market/' + (cloud.getOpenid() || 'me') + '_' + Date.now() + '_'
        + Math.floor(Math.random() * 1000) + '.' + ext;
      return wx.cloud.uploadFile({ cloudPath, filePath: f }).catch(() => null);
    });
    const results = await Promise.all(tasks);
    const done = results.filter((r) => r && r.fileID).map((r) => r.fileID);
    wx.hideLoading();
    this.setData({ images: this.data.images.concat(done), uploading: false });
    if (files.length && !done.length) {
      wx.showToast({ title: '图片上传失败，仍可发布', icon: 'none' });
    }
  },

  removeImage(e) {
    const i = e.currentTarget.dataset.i;
    const images = this.data.images.slice();
    images.splice(i, 1);
    this.setData({ images });
  },

  /* ---------------- 保存 ---------------- */

  async onSubmit() {
    if (this.data.uploading) {
      wx.showToast({ title: '图片还在上传', icon: 'none' });
      return;
    }
    const d = this.data;
    if (!d.title.trim()) {
      wx.showToast({ title: '标题不能为空', icon: 'none' });
      return;
    }
    if (!d.contact.trim()) {
      wx.showToast({ title: '留个联系方式，别人才找得到你', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发布中', mask: true });
    await market.addMarket({
      type: d.type,
      title: d.title,
      desc: d.desc,
      location: d.location,
      price: d.price,
      contact: d.contact,
      contactType: d.contactType,
      category: d.type === 'sell' ? d.category : 'other',
      courseName: d.type === 'sell' ? d.courseName : '',
      images: d.images,
      author: store.getUser().nickName
    });
    wx.hideLoading();
    wx.showToast({ title: '已发布', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 600);
  },

  // 草稿：写一半退出去，回来还在
  async onDraft() {
    const d = this.data;
    if (!store.hasDraftText({ title: d.title, content: d.desc })) return;
    store.saveDraft({
      type: 'market',
      board: d.type,
      title: d.title,
      content: d.desc,
      location: d.location,
      price: d.price,
      contact: d.contact
    });
    wx.showToast({ title: '草稿已保存', icon: 'success' });
  }
});
