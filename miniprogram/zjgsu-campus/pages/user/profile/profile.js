// pages/user/profile —— 我的个人资料
// 这里填什么 = 别人能看到的全部。联系方式不填就谁也看不到。
const store = require('../../../utils/store.js');
const userApi = require('../../../utils/user.js');
const cloud = require('../../../utils/cloud.js');
const haptic = require('../../../utils/haptic.js');

const CONTACT_TYPES = [
  { key: 'wechat', label: '微信号' },
  { key: 'phone', label: '手机号' },
  { key: 'qq', label: 'QQ号' },
  { key: '', label: '暂不公开' }
];

Page({
  data: {
    nickName: '',
    avatarUrl: '',
    avatarText: '浙',
    colleges: [],
    collegeIdx: 0,
    motto: '',
    contactTypes: CONTACT_TYPES,
    contactTypeIdx: 0,
    contactValue: '',
    contactPlaceholder: '填上微信号，同学才能找到你',
    openidTip: ''
  },

  onLoad() {
    const p = userApi.getMyProfile();
    const colleges = store.getColleges();
    const ci = Math.max(0, colleges.indexOf(p.college));
    const ti = Math.max(0, CONTACT_TYPES.findIndex((t) => t.key === p.contactType));
    this.setData({
      nickName: p.nickName || '',
      avatarUrl: p.avatarUrl || '',
      avatarText: (p.nickName || '浙').charAt(0),
      colleges: colleges,
      collegeIdx: ci,
      motto: p.motto || '',
      contactTypeIdx: ti,
      contactValue: p.contactValue || '',
      contactPlaceholder: CONTACT_TYPES[ti].label + '（不填谁也看不到）'
    });
    // 云端回滚：换设备 / 重装后本地是默认资料，从云端把「我」的资料读回来
    const oid = cloud.getOpenid();
    if (oid) {
      userApi.getProfile(oid).then((r) => {
        const prof = r && r.profile;
        if (prof && prof.nickName) {
          const t2 = Math.max(0, CONTACT_TYPES.findIndex((t) => t.key === prof.contactType));
          this.setData({
            nickName: prof.nickName,
            avatarUrl: prof.avatarUrl,
            avatarText: prof.nickName.charAt(0),
            college: prof.college || '',
            motto: prof.motto || '',
            contactTypeIdx: t2,
            contactValue: prof.contactValue || ''
          });
        }
      });
    }
    // 身份 ID 不打码：这是「我的资料」页，只有本人看得到，而添加新审核员
    // 就得靠每个人把自己这串完整 ID 复制出来上交 —— 打码了就没法配名单。
    // 打开页面时身份多半还在路上，等它落地再补一次，不然这里会一直空着
    const showOid = (v) => {
      if (v) this.setData({ openidTip: '你的身份 ID：' + v + '（点一下复制）' });
    };
    showOid(oid);
    if (!oid) {
      cloud.fetchOpenid().then(showOid).catch(() => {});
    }
  },

  // 点一下弹窗确认再复制。之前是静默 setClipboardData，成功只有一闪而过的
  // 底部 toast，模拟器里几乎看不见，用户点完以为没反应。弹窗先把完整 ID
  // 摆在眼前（还能长按选中手动复制），点「复制」才是真正写剪贴板
  onCopyOpenid() {
    const oid = cloud.getOpenid();
    if (!oid) {
      wx.showToast({ title: '身份还没拿到，等一秒再点', icon: 'none', duration: 2000 });
      return;
    }
    wx.showModal({
      title: '你的身份 ID',
      content: oid,
      confirmText: '复制',
      cancelText: '关闭',
      success: (r) => {
        if (!r.confirm) return;
        wx.setClipboardData({
          data: oid,
          success: () => {
            haptic.ok();
            wx.showToast({ title: '已复制，可以粘贴了', icon: 'success' });
          }
        });
      }
    });
  },

  // 选完头像顺手传云存储：chooseAvatar 给的是本机临时路径，
  // 直接存下来只有自己看得见，别人打开是空的。
  //
  // 另一件事：原来选完还得记得点「保存资料」才算数，忘了点等于白选，
  // 对真实用户来说这是个隐形坏体验。现在改成选完就存，立刻生效。
  async onChooseAvatar(e) {
    const temp = e.detail && e.detail.avatarUrl;
    if (!temp) return;
    this.setData({ avatarUrl: temp, avatarText: '' });

    // 拿不到 openid 时不能上传：文件名按 openid 命名，
    // 用兜底名会让所有人的头像互相覆盖；这种情况就先存在本机。
    const oid = cloud.getOpenid();
    if (!cloud.ensureCloud() || !oid) {
      this.setData({ avatarUrl: temp });
      await this.persist('头像已更新（仅本机）');
      return;
    }

    wx.showLoading({ title: '上传头像', mask: true });
    // 文件名按 openid 固定，重复选只覆盖不堆积
    const r = await wx.cloud.uploadFile({
      cloudPath: 'avatars/' + oid + '.jpg',
      filePath: temp
    }).catch(() => null);
    wx.hideLoading();

    if (r && r.fileID) {
      this.setData({ avatarUrl: r.fileID });
      await this.persist('头像已更新');
    } else {
      wx.showToast({ title: '头像没传到云端，点「保存资料」再试一次', icon: 'none' });
    }
  },

  // 静默保存当前资料：昵称没填时不再拦着——头像本来就该能单独先换。
  // 昵称为空时沿用 app.js 里的默认值，保证同学看见的不是空白。
  persist(okMsg) {
    const nick = String(this.data.nickName || '').trim() || '浙小商';
    const ct = CONTACT_TYPES[this.data.contactTypeIdx];
    return userApi.saveProfile({
      nickName: nick,
      avatarUrl: this.data.avatarUrl,
      college: this.data.colleges[this.data.collegeIdx] || '',
      motto: String(this.data.motto || '').trim(),
      contactType: ct.key,
      contactValue: String(this.data.contactValue || '').trim()
    }).then(() => {
      // 同步一份到 store（zjgsu_user）：发帖/评价的作者头像取自这里
      store.setUser(Object.assign({}, store.getUser(), {
        nickName: nick,
        avatar: this.data.avatarUrl
      }));
      wx.showToast({ title: okMsg, icon: 'success' });
      haptic.ok();
    }).catch(() => {
      wx.showToast({ title: '头像没存住，点「保存资料」再试一次', icon: 'none' });
    });
  },

  onNick(e) {
    const v = e.detail.value;
    this.setData({ nickName: v, avatarText: v ? v.charAt(0) : '' });
  },
  onMotto(e) {
    this.setData({ motto: e.detail.value });
  },
  onContactValue(e) {
    this.setData({ contactValue: e.detail.value });
  },

  onCollege(e) {
    this.setData({ collegeIdx: Number(e.detail.value) });
  },
  onContactType(e) {
    const i = Number(e.detail.value);
    this.setData({
      contactTypeIdx: i,
      contactPlaceholder: CONTACT_TYPES[i].label + '（不填谁也看不到）'
    });
  },

  onSave() {
    const nickName = this.data.nickName.trim();
    if (!nickName) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    const ct = CONTACT_TYPES[this.data.contactTypeIdx];
    const cv = this.data.contactValue.trim();
    if (ct.key && !cv) {
      wx.showToast({ title: '填一下' + ct.label, icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中', mask: true });
    userApi.saveProfile({
      nickName,
      avatarUrl: this.data.avatarUrl,
      college: this.data.colleges[this.data.collegeIdx] || '',
      motto: this.data.motto.trim(),
      contactType: ct.key,
      contactValue: cv
    }).then(() => {
      // 同步一份到 store 的用户存储（zjgsu_user）：发帖/评价的作者名取自这里，
      // 两处昵称不一致时，「我的帖子/评价」按昵称兜底认领会全部失灵
      store.setUser(Object.assign({}, store.getUser(), {
        nickName: nickName,
        avatar: this.data.avatarUrl,
        motto: this.data.motto.trim()
      }));
      wx.hideLoading();
      haptic.ok();
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，试试重来', icon: 'none' });
    });
  },

  onReset() {
    wx.showModal({
      title: '要改回默认资料吗',
      content: '昵称、头像、联系方式都会重置',
      success: (r) => {
        if (!r.confirm) return;
        this.setData({
          nickName: '浙小商', avatarUrl: '', avatarText: '浙',
          collegeIdx: 0, motto: '浙江工商大学 · 在读',
          contactTypeIdx: 0, contactValue: ''
        });
      }
    });
  }
});
