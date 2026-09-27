// components/ui/empty-state/index.js
// 迁移自 src/components/ui/EmptyState.vue
Component({
  properties: {
    title: { type: String, value: '暂无数据' },
    description: { type: String, value: '' },
    actionLabel: { type: String, value: '' },
    icon: { type: String, value: 'inbox' },
    iconColor: { type: String, value: 'faint' },
  },

  methods: {
    onAction() {
      this.triggerEvent('action');
    },
  },
});
