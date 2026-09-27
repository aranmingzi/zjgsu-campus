// pages/user/chat/chat.js —— 和一位同学的私聊
// 没有实时推送：进入会话拉一次历史，发一句话同步一次。
// 校园里「我发完，对方过一会儿看到」足够用，实时通道要配消息服务，代价远大于收益。
const chat = require('../../../utils/chat.js');
const notify = require('../../../utils/notify.js');

function clock(ts) {
  const d = Number(ts);
  if (!d) return '';
  const dt = new Date(d);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return p(dt.getHours()) + ':' + p(dt.getMinutes());
}

Page({
  data: {
    peer: '',
    peerName: '',
    avatar: '',
    messages: [],
    input: '',
    loading: true,
    // 对方主动留了联系方式就展示出来，省得用户切出去找
    contact: '',
    contactLabel: '联系方式',
    scrollTo: ''
  },

  onLoad(options) {
    this.peer = options.peer || '';
    this.setData({ peer: this.peer, peerName: options.name || '' });
    // 进了会话 = 大概率会收到回信，这时候要「新私信」授权最自然。
    // 没配模板 ID 就静默跳过，不会弹窗骚扰
    notify.request('chat');
    if (!this.peer) {
      this.setData({ loading: false });
      return;
    }
    this.load();
  },

  onShow() {
    // 从名片页退回来时对方可能刚换了资料
    if (this.peer) this.load(true);
  },

  async load(silent) {
    if (!silent) this.setData({ loading: true });
    const r = await chat.history(this.peer);
    const raw = (r && r.messages) || [];
    const p = r && r.peer ? r.peer : {};

    const messages = raw.map((m) => Object.assign({}, m, {
      // 云函数已经标过 mine，本地补发时也会带上，这里只补时间
      clock: clock(m.at),
      text: String(m.text || '')
    }));

    this.setData({
      messages: messages,
      loading: false,
      peerName: p.nickName || this.data.peerName,
      avatar: p.avatarUrl || '',
      contact: p.contactValue || '',
      contactLabel: p.contactType === 'wechat' ? '微信号' : (p.contactType === 'phone' ? '手机号' : (p.contactType === 'qq' ? 'QQ号' : '联系方式')),
      input: ''
    });
    this.scrollToEnd(messages.length ? messages[messages.length - 1].id : '');
  },

  scrollToEnd(id) {
    // 滚动是下一帧才生效的，setData 之后马上去滚会拿到旧布局
    wx.nextTick ? wx.nextTick(() => this.setData({ scrollTo: id }))
      : setTimeout(() => this.setData({ scrollTo: id }), 50);
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  async send() {
    const text = String(this.data.input || '').trim();
    if (!text || !this.peer) return;
    if (this.sending) return;
    this.setData({ input: '' });

    // 乐观更新：先把话摆上去，成败都是用户先看到反馈，再决定要不要重试
    const temp = {
      id: 'tmp' + Date.now(),
      text: text,
      mine: true,
      clock: clock(Date.now()),
      pending: true
    };
    this.setData({ messages: this.data.messages.concat([temp]) });
    this.scrollToEnd(temp.id);

    this.sending = true;
    const r = await chat.send(this.peer, text);
    this.sending = false;

    if (r && r.ok === false) {
      wx.showToast({ title: r.msg || '没发出去，试试再发一次', icon: 'none' });
      const next = this.data.messages.map((m) => (
        m.id === temp.id ? Object.assign({}, m, { pending: false, failed: true }) : m
      ));
      this.setData({ messages: next });
      return;
    }
    // 服务端确认后再拉一次，拿到真实时间和已读水位
    this.load(true);
  },

  onSendTap() {
    this.send();
  },

  // 回车即发送，手机上少点一下
  onConfirm() {
    this.send();
  },

  copyContact() {
    if (!this.data.contact) return;
    wx.setClipboardData({
      data: this.data.contact,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  }
});
