// components/course/course-card/index.js
// 迁移自 src/components/course/CourseCard.vue —— 课程列表里那张课程卡（原生版）。
// 三条业务规则（和 Web 版一字不差，改之前先想清楚）：
//   1) hasReviewData = 有分数 且 有评价条数。没有就走「暂无评分」分支，
//      **绝不能落回 0.0** —— 一列 0.0 分的课看起来像数据坏了；
//   2) 首字母头像在 6 色里按 courseName.codePointAt(0) % 6 取色；
//   3) 没有评价标签时显示「暂无评价标签」，不是空白。
// 组件只管「长什么样 + 跳哪去」：to 非空就自己 navigateTo，
// 否则把 tap 抛给页面（页面自己读 data-*）。
const AVATAR_COLORS = ['#2b5aed', '#7357ff', '#f58a32', '#19a66a', '#2f9fd6', '#dd4b55'];

Component({
  properties: {
    courseName: { type: String, value: '' },
    // score 是 '4.3' 这样的字符串也可能进来（store 里 avgScore 是 toFixed(1) 的结果），
    // 所以几个数值属性都不做类型校验，一律在下面自己转
    score: { type: null, value: null },
    tags: { type: Array, value: [] },
    reviewsCount: { type: null, value: 0 },
    college: { type: String, value: '' },
    major: { type: String, value: '' },
    credit: { type: null, value: 0 },
    goodRate: { type: null, value: null },
    to: { type: String, value: '' }
  },

  data: {
    hasReviewData: false,
    scoreText: '',
    goodRateText: '',
    initial: '',
    colorIdx: 0,
    detailText: '',
    tagLabels: []
  },

  // 只盯这 8 个属性，setData 内部字段不会再触发，不会自激
  observers: {
    'courseName, score, tags, reviewsCount, college, major, credit, goodRate': function () {
      const d = this.data;
      const raw = d.score;
      const reviews = Number(d.reviewsCount) || 0;
      const num = Number(raw);
      const hasReviewData =
        raw !== null && raw !== undefined && raw !== '' && !isNaN(num) && num > 0 && reviews > 0;
      const good = Number(d.goodRate);

      const name = String(d.courseName || '');
      const code = name && name.codePointAt ? name.codePointAt(0) : 0;

      this.setData({
        hasReviewData: hasReviewData,
        scoreText: hasReviewData ? num.toFixed(1) : '',
        goodRateText: hasReviewData && good >= 0 ? String(good) : '',
        initial: name ? name.slice(0, 1) : '',
        colorIdx: Number(code) % AVATAR_COLORS.length,
        detailText: [d.college, d.major, d.credit ? d.credit + ' 学分' : ''].filter(Boolean).join(' · '),
        tagLabels: (Array.isArray(d.tags) ? d.tags : []).slice(0, 3)
      });
    }
  },

  methods: {
    onTap() {
      if (this.data.to) {
        wx.navigateTo({ url: this.data.to });
      } else {
        this.triggerEvent('tap');
      }
    }
  }
});
