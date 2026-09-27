// components/ui/icon-button/index.js
// 迁移自 src/components/ui/IconButton.vue（variant: light | glass | plain）
Component({
  properties: {
    variant: { type: String, value: 'light' },
    color: { type: String, value: 'ink' }, // ink | white | muted | brand | faint
    size: { type: String, value: 'md' },   // sm | md | lg
    disabled: { type: Boolean, value: false },
  },
  methods: {
    onTap(e) {
      if (this.data.disabled) return;
      this.triggerEvent('tap', e);
    },
  },
});
