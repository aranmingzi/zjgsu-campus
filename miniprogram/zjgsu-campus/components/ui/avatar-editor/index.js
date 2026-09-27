// components/ui/avatar-editor/index.js
// 迁移自 src/components/ui/AvatarEditor.vue
// 只负责「选图 + 预览 + 上传进度」，不碰业务接口，上传回调给页面自己接。
Component({
  properties: {
    src: { type: String, value: '' },
    size: { type: String, value: '160rpx' },
    readonly: { type: Boolean, value: false },
  },

  data: {
    uploading: false,
  },

  methods: {
    chooseAlbum() {
      if (this.data.readonly) return;
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0];
          if (!file) return;
          this.setData({ uploading: true, src: file.tempFilePath });
          this.triggerEvent('change', { tempFilePath: file.tempFilePath });
          // 页面真正上传之后再把 uploading 收回去；这里给个兜底，
          // 避免页面没监听 change 时按钮永远停在「上传中」
          clearTimeout(this._t);
          this._t = setTimeout(() => this.setData({ uploading: false }), 4000);
        },
        fail: () => {
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        },
      });
    },

    onTap() {
      this.chooseAlbum();
    },
  },
});
