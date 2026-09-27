// components/ui/bottom-sheet/index.js
// 迁移自 src/components/ui/BottomSheet.vue
// open 控制进出场：WXSS 里用 transform 位移 + opacity，不做条件销毁，
// 这样关闭动画也能跑完，不会「啪」一下消失。
Component({
  properties: {
    open: { type: Boolean, value: false },
    title: { type: String, value: '' },
    description: { type: String, value: '' },
    maskClosable: { type: Boolean, value: true },
  },

  observers: {
    'open, title, description': function (open) {
      // 关闭时保留一帧，等 translateY 动画结束再允许滚动穿透
      this.setData({ animating: open ? true : this.data.animating });
      if (open) {
        this.setData({ mounted: true });
        clearTimeout(this._t);
        this._t = setTimeout(() => this.setData({ mounted: true, animating: false }), 320);
      }
    },
  },

  data: {
    mounted: false,
    animating: false,
  },

  methods: {
    close() {
      this.setData({ animating: true });
      clearTimeout(this._t);
      this._t = setTimeout(() => this.setData({ open: false, animating: false }), 280);
      this.triggerEvent('close');
    },

    onMask() {
      if (this.data.maskClosable) this.close();
    },

    noop() {},
  },
});
