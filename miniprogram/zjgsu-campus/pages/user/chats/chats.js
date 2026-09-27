// pages/user/chats/chats.js —— 私信会话列表
// 时间、未读这些展示用的字段都在 JS 里算好：WXML 的模板表达式不支持任何函数调用，
// 写成 {{formatTime(x)}} 会让整页渲染崩掉。
const chat = require('../../../utils/chat.js');

// 相对时间：超过一天就显示日期，不然「刚刚 / 3 分钟前」看久了反而不知道是哪天
function ago(ts) {
  const d = Number(ts);
  if (!d) return '';
  const diff = Date.now() - d;
  if (diff < 0) return '';
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  const dt = new Date(d);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return (sameYear ? '' : dt.getFullYear() + '/')
    + (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
}

function cut(text) {
  const s = String(text || '');
  return s.length > 30 ? s.slice(0, 30) + '…' : s;
}

Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    // 每次进都刷：从聊天页退回来时未读数应该已经清零了
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    let list = await chat.list();
    // 头像首字也在这里算好：WXML 里写 {{nickName.charAt(0)}} 属于函数调用，会整页崩
    list = (Array.isArray(list) ? list : []).map((c) => Object.assign({}, c, {
      timeText: ago(c.lastTime),
      lastTextCut: cut(c.lastText),
      avatarText: String(c.nickName || '同').charAt(0)
    }));
    this.setData({ list: list, loading: false });
  },

  openChat(e) {
    const d = e.currentTarget.dataset;
    wx.navigateTo({
      url: '/pages/user/chat/chat?peer=' + d.peer + '&name=' + (d.name || '')
    });
  },

  // 从通讯录里找人新开一段对话
  goFind() {
    wx.navigateTo({ url: '/pages/user/friends/friends?tab=search' });
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  }
});
