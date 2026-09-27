// components/ui/base-button/index.js
// 迁移自 src/components/ui/BaseButton.vue
Component({
  properties: {
    variant: { type: String, value: 'primary' }, // primary | secondary | ghost | danger | dark
    size: { type: String, value: 'md' },          // sm | md | lg
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    block: { type: Boolean, value: false },
  },
  methods: {
    onTap(e) {
      if (this.data.disabled || this.data.loading) return;
      this.triggerEvent('tap', e);
    },
  },
});
