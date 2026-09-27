// components/ui/base-card/index.js
// 迁移自 src/components/ui/BaseCard.vue
Component({
  properties: {
    padded: { type: Boolean, value: true },
    clickable: { type: Boolean, value: false },
    flat: { type: Boolean, value: false },
    flush: { type: Boolean, value: false },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    },
  },
});
