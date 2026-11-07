<script>
export default {
  onLaunch() {
    console.log('408 学习助手启动')
  }
}
</script>

<style>
/* ============ 全局样式与设计变量（与网页版保持同一套视觉） ============ */
page {
  background-color: #f6f6f3;
  color: #1b1c1f;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'HarmonyOS Sans SC', 'MiSans', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.page {
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 18px 16px 36px;
  min-height: 100vh;
  background:
    radial-gradient(600px 320px at 8% -6%, rgba(79, 70, 229, 0.10), transparent 60%),
    radial-gradient(480px 260px at 100% 0%, rgba(15, 118, 110, 0.07), transparent 58%),
    #f6f6f3;
}

/* 小程序 WXSS 不支持通配选择器，改为显式列举组件 */
/* #ifdef H5 */
* { box-sizing: border-box; }
/* #endif */
/* #ifdef MP-WEIXIN */
page, view, text, image, button, input, textarea, scroll-view, swiper, swiper-item { box-sizing: border-box; }
/* #endif */

/* ---------- 文字 ---------- */
.eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #85878f;
  text-transform: uppercase;
}
.eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.14);
}
.page-title {
  margin: 8px 0 4px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.page-sub {
  margin: 0;
  font-size: 13px;
  color: #85878f;
}
.muted { color: #85878f; font-size: 12px; }
.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin: 22px 0 10px;
}
.section-head .title { font-size: 16px; font-weight: 700; }
.section-head .hint { font-size: 11px; color: #a7a9b0; }

/* ---------- 卡片 ---------- */
.card {
  background: #ffffff;
  border: 1px solid #e8e7e1;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(24, 24, 32, 0.03), 0 12px 30px -22px rgba(24, 24, 32, 0.22);
}
.card + .card { margin-top: 12px; }
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.card-head .title { font-size: 15px; font-weight: 700; }
.card-head .hint { font-size: 11px; color: #a7a9b0; }

/* ---------- 按钮 ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  margin: 0;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  background: #f2f2ee;
  color: #1b1c1f;
}
.btn::after { border: none; }
.btn-primary { background: #4f46e5; color: #ffffff; box-shadow: 0 8px 18px -10px rgba(79, 70, 229, 0.65); }
.btn-soft { background: #eeefff; color: #4338ca; }
.btn-ghost { background: transparent; border-color: #dddbd3; color: #4b4d55; }
.btn-success { background: #ecfdf7; color: #0f766e; border-color: #c7ece2; }
.btn-danger { background: #fff1f3; color: #e11d48; border-color: #ffd9df; }
.btn-sm { height: 30px; padding: 0 12px; font-size: 12px; }
.btn-block { width: 100%; }
.btn[disabled] { opacity: 0.45; }

/* ---------- 表单 ---------- */
.field { margin-bottom: 14px; }
.field > .label {
  display: block;
  margin-bottom: 7px;
  font-size: 12px;
  font-weight: 600;
  color: #4b4d55;
}
.field .hint { font-weight: 400; color: #a7a9b0; font-size: 11px; }
.input, .textarea, .picker {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid #e8e7e1;
  border-radius: 12px;
  background: #fbfbf9;
  font-size: 14px;
  line-height: 1.5;
  color: #1b1c1f;
}
.textarea { min-height: 96px; }
.picker { display: flex; align-items: center; justify-content: space-between; }
.picker .arrow { color: #a7a9b0; font-size: 12px; }
.field-row { display: flex; gap: 10px; }
.field-row > .field { flex: 1; min-width: 0; }
.field-row.three > .field { flex: 1; }

/* ---------- 标签 / 胶囊 ---------- */
.tag {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  background: #f1f2f6;
  color: #4b4d55;
  font-size: 11px;
  font-weight: 500;
}
.tag-indigo { background: #eeefff; color: #4338ca; }
.tag-rose { background: #fff1f3; color: #e11d48; }
.tag-teal { background: #ecfdf7; color: #0f766e; }
.tag-amber { background: #fffbeb; color: #b45309; }
.tag-slate { background: #f1f2f6; color: #6b7280; }

/* ---------- 分段控件 ---------- */
.seg {
  display: flex;
  padding: 3px;
  border: 1px solid #e8e7e1;
  border-radius: 999px;
  background: #ffffff;
}
.seg-item {
  flex: 1;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 12px;
  color: #85878f;
}
.seg-item.active { background: #eeefff; color: #4338ca; font-weight: 600; }

/* ---------- 空状态 / 提示 ---------- */
.empty {
  padding: 36px 16px;
  text-align: center;
  color: #85878f;
  font-size: 13px;
}
.empty .big { display: block; font-size: 16px; font-weight: 700; color: #4b4d55; margin-bottom: 6px; }
.toast-line { font-size: 12px; color: #85878f; }

/* ---------- 弹层 ---------- */
.mask {
  position: fixed;
  left: 0; top: 0; right: 0; bottom: 0;
  z-index: 60;
  background: rgba(20, 20, 26, 0.42);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  overflow-y: auto;
  background: #ffffff;
  border-radius: 22px 22px 0 0;
  padding: 18px 16px 26px;
  box-shadow: 0 -12px 40px -20px rgba(20, 20, 30, 0.4);
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.sheet-head .title { font-size: 16px; font-weight: 700; }
.close-btn { font-size: 20px; color: #85878f; padding: 0 6px; line-height: 1; }

/* 图片 */
.thumb {
  width: 100%;
  border-radius: 12px;
  display: block;
}
</style>
