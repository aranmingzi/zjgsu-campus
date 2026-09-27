// components/ui/vote-card/index.js
// 迁移自 src/components/vote/VoteCard.vue
// 三种状态：未投票 / 已投票 / 已结束。
// 点击后立刻本地置为「已投票」并禁用（防止连点并发），震动用 wx.vibrateShort
// 代替 Web 版的 navigator.vibrate（小程序没有 navigator）。
const { vibrateShort } = require('../../../utils/system.js');

Component({
  properties: {
    voteData: { type: Object, value: null },
    compact: { type: Boolean, value: false },
  },

  data: {
    localVoted: false,
    localOptionIds: [],
    submitting: false,
    liked: false,
  },

  observers: {
    'voteData, localVoted, localOptionIds': function () {
      this._recompute();
    },
  },

  methods: {
    _recompute() {
      const v = this.data.voteData || {};
      const voted = !!v.hasVoted || this.data.localVoted;
      const selected = this.data.localVoted
        ? this.data.localOptionIds
        : v.myOptionIds || [];

      const rawOptions = v.options || [];
      const totalBase = rawOptions.reduce((t, o) => t + (o.votes || 0), 0);
      const totalVotes = Math.max(
        totalBase,
        voted ? (v.totalVotes || 0) + selected.length : v.totalVotes || 0,
      );
      // 百分比在这儿算好写进每条选项。WXML 的 {{}} 里既调不到组件方法，
      // 也调不到数组方法，所以 pct / selected / 是否领先 都必须在这里定死
      const displayOptions = rawOptions.map((o) => ({
        ...o,
        selected: selected.indexOf(o.id) > -1,
        pct: totalVotes ? Math.round(((o.votes || 0) / totalVotes) * 100) : 0
      }));

      let topOptionId = '';
      if (displayOptions.length) {
        const top = displayOptions.slice().sort((a, b) => b.votes - a.votes)[0];
        topOptionId = top ? top.id : '';
      }

      this.setData({
        hasVoted: voted,
        displayOptions,
        totalVotes,
        topOptionId,
        multiple: !!v.multiple,
        ended: !!v.ended,
        anonymous: !!v.anonymous,
        title: v.title || '',
        statusText: this._statusText(v),
      });
    },

    _statusText(v) {
      if (v.ended) return '已结束';
      const hours = typeof v.remainingHours === 'number' ? v.remainingHours : 0;
      if (hours <= 24) return `剩余 ${hours} 小时`;
      return `剩余 ${Math.ceil(hours / 24)} 天`;
    },

    onOptionTap(e) {
      const id = e.currentTarget.dataset.id;
      const { voteData, hasVoted, submitting, ended, multiple } = this.data;
      if (!voteData) return;

      if (ended) {
        this.triggerEvent('open');
        return;
      }
      if (hasVoted || submitting) return; // 已投票/提交中一律禁点

      if (multiple) {
        vibrateShort();
        const ids = this.data.localOptionIds.slice();
        const idx = ids.indexOf(id);
        if (idx > -1) ids.splice(idx, 1);
        else ids.push(id);
        this.setData({ localOptionIds: ids });
        return;
      }

      this._commit([id]);
    },

    onConfirmMulti() {
      if (!this.data.localOptionIds.length || this.data.submitting) return;
      this._commit(this.data.localOptionIds.slice());
    },

    _commit(optionIds) {
      if (!optionIds.length || this.data.submitting) return;
      vibrateShort();
      this.setData({
        localOptionIds: optionIds,
        localVoted: true,
        submitting: true,
      });
      this.triggerEvent('vote', { optionIds });

      // 父页面可以用真实接口结果替换这段：出错时 emit('voteError')
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.setData({ submitting: false }), 650);
    },

    onOpen() {
      this.triggerEvent('open');
    },
    onDiscuss() {
      this.triggerEvent('discuss');
    },
    onShare() {
      this.triggerEvent('share');
    },
    onLike() {
      this.setData({ liked: !this.data.liked });
      this.triggerEvent('like', { liked: this.data.liked });
    },
  },
});
