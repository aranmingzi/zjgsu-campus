// components/ui/pill-selector/index.js
// 迁移自 src/components/ui/PillSelector.vue
// 横向胶囊选择器，accent 决定选中态的场景色。
//
// ⚠️ 胶囊文本必须在 JS 里算好再交给模板。WXML 的 {{}} 里调不到组件方法，
//    早期版本图省事写成 {{label(item)}}，结果四个胶囊全渲染成空圈。
Component({
  properties: {
    items: { type: Array, value: [] },
    value: { type: String, value: '' },
    labels: { type: Object, value: null },
    accent: { type: String, value: 'brand' }, // brand | forum | market | campus
  },

  data: {
    // [{ value: 'all', text: '全部' }, ...] —— text 是查完 labels 之后的显示文本
    displayItems: [],
  },

  observers: {
    'items, labels': function () {
      this._rebuild();
    },
  },

  methods: {
    _rebuild() {
      const labels = this.data.labels || {};
      const displayItems = (this.data.items || []).map((v) => {
        const text = labels[v] || String(v);
        return { value: v, text: text };
      });
      this.setData({ displayItems: displayItems });
    },

    onTap(e) {
      const item = e.currentTarget.dataset.v;
      this.triggerEvent('change', { value: item });
    },
  },
});
