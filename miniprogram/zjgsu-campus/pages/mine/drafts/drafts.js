// pages/mine/drafts/drafts.js —— 草稿箱
// 草稿只有「跳回对应编辑页继续写」这一件事，所以这里只管列出和转发，
// 真正恢复在 post.js / review / market/edit 里按 draftId 取。
const store = require('../../../utils/store.js');

// 每种草稿通往哪去，写在一处，免得页面里散落一堆路径字符串
function targetOf(type) {
  if (type === 'review') return '/pages/course/review/review';
  if (type === 'market') return '/pages/market/edit/edit';
  if (type === 'hole') return '/pages/forum/hole/hole';
  return '/pages/forum/post/post';
}

function typeLabel(type) {
  if (type === 'review') return '课程评价';
  if (type === 'market') return '失物闲置';
  if (type === 'hole') return '匿名树洞';
  return '论坛';
}

Page({
  data: {
    items: [],
    loading: true
  },

  onShow() {
    this.load();
  },

  load() {
    const items = store.getDrafts().map((d) => ({
      id: d.id,
      type: d.type,
      typeName: typeLabel(d.type),
      title: d.title || '（没写标题）',
      preview: d.content || '（没写正文）',
      time: d.updatedAt ? stamp(d.updatedAt) : ''
    }));
    this.setData({ items: items, loading: false });
  },

  open(e) {
    const d = e.currentTarget.dataset;
    wx.navigateTo({
      url: targetOf(d.type) + '?draftId=' + d.id
    });
  },

  remove(e) {
    const d = e.currentTarget.dataset;
    wx.showModal({
      title: '删掉这篇草稿',
      content: '删了就找不回来了，确定吗？',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.removeDraft(d.id);
        this.load();
      }
    });
  },

  clear() {
    if (!this.data.items.length) return;
    wx.showModal({
      title: '清空草稿箱',
      content: '全部草稿都会被删掉，确定吗？',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.clearDrafts();
        this.load();
      }
    });
  }
});

// 草稿时间只显示到「月日 时:分」：说不清什么时候写的反而更该看清具体时间
function stamp(ts) {
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
