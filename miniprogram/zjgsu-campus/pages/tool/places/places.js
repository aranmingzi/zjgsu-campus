// pages/tool/places/places.js —— 校园地点
//
// 不做底图，只做「地点列表 + 一键在地图里看」：
//   ① 手画底图要找图、要标注，成本高还容易过期；
//   ② 经纬度一律用 wx.chooseLocation 在真实地图上点出来，
//      手写坐标一定会偏，openLocation 会把同学导航到隔壁学校去。
const userApi = require('../../../utils/user.js');

const CATS = ['教学楼', '食堂', '宿舍', '快递', '运动', '其他'];

Page({
  data: {
    cats: ['全部'].concat(CATS),
    category: '全部',
    catMap: {},
    list: [],
    loading: true,
    showForm: false,
    form: { name: '', category: '其他', desc: '', address: '', latitude: 0, longitude: 0 },
    catFormMap: {},
    picked: false,
    // 地图标记由 load() 从 list 的经纬度算出来；markerId 和 list 下标一一对应
    markers: [],
    // 半屏抽屉：点列表项 / 点地图标记时打开，里面选「步行路线 / 呼叫校车」
    navOpen: false,
    sheetPlace: null
  },

  onLoad() {
    this.setData({ catMap: this.buildMap('全部', this.data.cats), catFormMap: this.buildMap('其他', CATS) });
    this.load();
  },

  buildMap(cur, list) {
    const m = {};
    (list || []).forEach((c) => { m[c] = c === cur; });
    return m;
  },

  async load() {
    const list = await userApi.placeList(this.data.category === '全部' ? '' : this.data.category);
    this.setData({
      list: (list || []).map((p) => Object.assign({}, p, {
        catIcon: p.category === '教学楼' ? 'graduation-cap' : (p.category === '食堂' ? 'utensils'
          : (p.category === '宿舍' ? 'home' : (p.category === '快递' ? 'inbox'
            : (p.category === '运动' ? 'dumbbell' : 'pin'))))
      })),
      loading: false,
      markers: this.buildMarkers(list || [])
    });
  },

  // map 组件的 markers 只认数字 id，所以这里用「下标 + 1」当 markerId，
  // onMarkerTap 再按这个 id 反查回地点
  buildMarkers(list) {
    return (list || []).map((p, i) => ({
      id: i + 1,
      latitude: Number(p.latitude) || 0,
      longitude: Number(p.longitude) || 0,
      name: p.name || '',
      width: 32,
      height: 32
    })).filter((m) => m.latitude && m.longitude);
  },

  placeByMarkerId(markerId) {
    const p = this.data.list[Number(markerId) - 1];
    return p || null;
  },

  openSheet(p) {
    if (!p) return;
    this.setData({ sheetPlace: p, navOpen: true });
  },

  onCategory(e) {
    const c = e.currentTarget.dataset.c || '全部';
    this.setData({ category: c, catMap: this.buildMap(c, this.data.cats) });
    this.load();
  },

  /* ---------------- 添加 ---------------- */

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
    this.setData({ form: form, catFormMap: this.buildMap(c, CATS) });
  },

  // 在真实地图上选点：经纬度由地图给出，绝不用手填
  pickLocation() {
    wx.chooseLocation({
      success: (res) => {
        const form = Object.assign({}, this.data.form, {
          latitude: res.latitude,
          longitude: res.longitude,
          address: res.address || '',
          name: this.data.form.name || res.name || ''
        });
        this.setData({ form: form, picked: true });
      },
      fail: () => {}
    });
  },

  async onSubmit() {
    const f = this.data.form;
    if (!f.name.trim()) {
      wx.showToast({ title: '地点名字得写一下', icon: 'none' });
      return;
    }
    if (!f.latitude || !f.longitude) {
      wx.showToast({ title: '点上面那行，在地图上选一下位置', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    const r = await userApi.placeAdd({
      name: f.name.trim(),
      category: f.category,
      desc: f.desc,
      address: f.address,
      latitude: f.latitude,
      longitude: f.longitude
    });
    wx.hideLoading();
    if (!r || r.ok === false) {
      wx.showToast({ title: (r && r.msg) || '保存失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已添加', icon: 'success' });
    this.setData({
      showForm: false,
      picked: false,
      form: { name: '', category: '其他', desc: '', address: '', latitude: 0, longitude: 0 }
    });
    this.load();
  },

  /* ---------------- 使用 ---------------- */

  // 点列表里的「导航」：不再直接跳地图，先弹抽屉让同学自己选到达方式
  onOpen(e) {
    this.openSheet(this.data.list[e.currentTarget.dataset.i]);
  },

  // 点地图上的标记：同上，弹同一个抽屉
  onMarkerTap(e) {
    this.openSheet(this.placeByMarkerId(e.markerId));
  },

  onSheetClose() {
    this.setData({ navOpen: false });
  },

  // 步行路线还是走 openLocation —— 微信内置地图能直接算步行路径，
  // 比在小程序里塞一个只会转圈的路径页靠谱
  onWalkRoute() {
    const p = this.data.sheetPlace;
    if (!p) return;
    wx.openLocation({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      name: p.name,
      address: p.address || p.desc || '',
      scale: 18
    });
  },

  // 校车热线要走审核才能接进小程序，没配好之前不说假话，只给一个明确的出口
  onCallBus() {
    const hotline = String(this.data.busHotline || '').replace(/\s/g, '');
    if (!hotline) {
      wx.showToast({ title: '校车热线待配置，先用上面的地图导航过去', icon: 'none', duration: 2600 });
      return;
    }
    wx.makePhoneCall({ phoneNumber: hotline, fail: () => {} });
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删掉这个地点？',
      success: async (r) => {
        if (!r.confirm) return;
        await userApi.placeRemove(id);
        this.load();
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '商砖小站 · 校园地点速查（教学楼/食堂/快递点）',
      path: '/pages/tool/places/places'
    };
  }
});
