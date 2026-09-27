// components/ui/pill-selector/index.js
// 迁移自 src/components/ui/PillSelector.vue
// 横向胶囊选择器，accent 决定选中态的场景色。
Component({
  properties: {
    items: { type: Array, value: [] },
    value: { type: String, value: '' },
    labels: { type: Object, value: null },
    accent: { type: String, value: 'brand' }, // brand | forum | market | campus
  },

  methods: {
    label(item) {
      return (this.data.labels && this.data.labels[item]) || item;
    },

    onTap(e) {
      const item = e.currentTarget.dataset.v;
      this.triggerEvent('change', { value: item });
    },
  },
});
