<template>
  <view class="page">
    <view class="hero">
      <view class="eyebrow"><text class="dot"></text>408 · 英语二 · 数学二</view>
      <view class="page-title">把错题，变成掌握度。</view>
      <view class="page-sub">记录每一次卡壳，找到最该补的那几章。</view>
      <view class="hero-actions">
        <text class="muted">{{ todayLabel }}</text>
        <button class="btn btn-primary" @click="goEntry">开始录题</button>
      </view>
    </view>

    <view v-if="error" class="card load-error">
      <view class="load-error-title">后端连接失败</view>
      <view class="load-error-text">{{ error }}</view>
      <button class="btn btn-soft btn-sm" @click="load">重试</button>
    </view>
    <view v-else-if="loading" class="card empty">正在加载概览…</view>
    <template v-else>
    <view class="stat-grid">
      <view class="card stat-card">
        <view class="stat-label">今日新增</view>
        <view class="stat-row"><text class="stat-value tone-indigo">{{ stats.today_new }}</text><text class="stat-suffix">道</text></view>
      </view>
      <view class="card stat-card">
        <view class="stat-label">待掌握</view>
        <view class="stat-row"><text class="stat-value tone-rose">{{ stats.wrong }}</text><text class="stat-suffix">道</text></view>
      </view>
      <view class="card stat-card">
        <view class="stat-label">累计错题</view>
        <view class="stat-row"><text class="stat-value">{{ stats.total }}</text><text class="stat-suffix">道</text></view>
      </view>
      <view class="card stat-card">
        <view class="stat-label">已掌握</view>
        <view class="stat-row"><text class="stat-value tone-teal">{{ stats.mastered }}</text><text class="stat-suffix">道</text></view>
      </view>
    </view>

    <view class="section-head">
      <view class="title">最该补的三章</view>
      <view class="hint">分值权重 × 掌握度缺口</view>
    </view>
    <view v-if="priority.length" class="priority-list">
      <view v-for="(item, index) in priority" :key="item.chapter_id" class="card priority-card" @click="goList(item)">
        <view class="priority-rank">{{ index + 1 }}</view>
        <view class="priority-main">
          <view class="priority-tags">
            <text class="tag tag-indigo">{{ item.subject }}</text>
            <text class="tag">{{ item.chapter }}</text>
          </view>
          <view class="priority-meta">
            未掌握 <text class="strong">{{ item.wrong }}</text> / {{ item.total }} 道 · 错误率 {{ pct(item.error_rate) }} · 权重 {{ item.weight }}
          </view>
        </view>
        <view class="priority-score">
          <text class="score-value">{{ item.gap_score }}</text>
          <text class="score-label">缺口</text>
        </view>
      </view>
    </view>
    <view v-else class="card empty">
      <text class="big">还没有需要补的章节</text>
      录几道错题后，这里会按缺口给出优先级。
    </view>

    <view class="section-head">
      <view class="title">各科掌握度</view>
      <view class="hint">颜色越深掌握度越高</view>
    </view>
    <view class="card">
      <!-- #ifdef H5 -->
      <view class="chart-box" id="heatmap-box" ref="chartBox"></view>
      <!-- #endif -->
      <!-- #ifdef MP-WEIXIN -->
      <ec-canvas id="heatmap" canvas-id="heatmap" class="chart-box" :ec="ec"></ec-canvas>
      <!-- #endif -->
      <view class="heatmap-foot">横轴为各科内部章节序号，点按可查看章名；灰色代表该章暂无错题。</view>
    </view>
    </template>
  </view>
</template>

<script>
import { api } from '@/api'
// #ifdef H5
import * as echarts from 'echarts'
// #endif
// #ifdef MP-WEIXIN
import * as echarts from '@/wxcomponents/ec-canvas/echarts'
// #endif

const EMPTY_COLOR = '#efeee9'
const SCALE = ['#eef0ff', '#c9c9fb', '#9d99f2', '#6a5fe8', '#4338ca']

function buildOption(heatmap) {
  const data = heatmap || {}
  const subjects = data.subjects || []
  const maxChapters = Math.max(data.max_chapters || 0, 1)
  const xData = []
  for (let i = 0; i < maxChapters; i += 1) xData.push(String(i + 1))

  const cells = (data.cells || []).map((cell) => ({
    value: cell.value,
    chapter: cell.chapter,
    subject: cell.subject,
    total: cell.total,
    wrong: cell.wrong,
    itemStyle: { borderColor: '#ffffff', borderWidth: 3, borderRadius: 5 }
  }))

  return {
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(27,28,31,0.92)',
      borderWidth: 0,
      padding: [8, 10],
      textStyle: { color: '#fff', fontSize: 11, lineHeight: 16 },
      formatter(params) {
        const item = params.data
        if (!item) return ''
        const pct = item.value[2]
        const head = item.subject + ' · ' + item.chapter
        if (pct < 0) return head + '<br/>暂无错题'
        return head + '<br/>掌握度 ' + pct + '%　错 ' + item.wrong + ' / ' + item.total
      }
    },
    // 热力图必须配 visualMap；隐藏起来只做配色，-1（暂无错题）走 outOfRange 灰色
    visualMap: {
      show: false,
      type: 'continuous',
      min: 0,
      max: 100,
      dimension: 2,
      seriesIndex: 0,
      inRange: { color: SCALE },
      outOfRange: { color: EMPTY_COLOR }
    },
    grid: { left: 62, right: 8, top: 6, bottom: 20 },
    xAxis: {
      type: 'category',
      data: xData,
      splitArea: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e8e7e1' } },
      axisLabel: { color: '#a7a9b0', fontSize: 10, interval: 0 }
    },
    yAxis: {
      type: 'category',
      data: subjects,
      splitArea: { show: false },
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: '#4b4d55', fontSize: 10, margin: 6 }
    },
    series: [
      {
        type: 'heatmap',
        data: cells,
        label: { show: false },
        itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 5 },
        emphasis: { itemStyle: { borderColor: '#4338ca', borderWidth: 2 } }
      }
    ]
  }
}

export default {
  data() {
    const self = this
    return {
      todayLabel: '',
      stats: { today_new: 0, wrong: 0, total: 0, mastered: 0 },
      priority: [],
      heatmap: { subjects: [], max_chapters: 0, cells: [] },
      chart: null,
      loading: true,
      error: '',
      // #ifdef MP-WEIXIN
      ec: {
        onInit(canvas, width, height, dpr) {
          try {
            const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr })
            canvas.setChart(chart)
            self.chart = chart
            chart.setOption(buildOption(self.heatmap))
            return chart
          } catch (e) {
            console.error('echarts init failed', e)
            return null
          }
        }
      }
      // #endif
    }
  },
  watch: {
    heatmap() {
      if (!this.chart) return
      try {
        this.chart.setOption(buildOption(this.heatmap), true)
      } catch (e) {
        console.error('heatmap render failed', e)
      }
    }
  },
  onShow() {
    this.setToday()
    this.load()
  },
  mounted() {
    // #ifdef H5
    this.$nextTick(() => this.initH5Chart())
    // #endif
  },
  beforeUnmount() {
    // #ifdef H5
    if (this.onResize) window.removeEventListener('resize', this.onResize)
    // #endif
    if (this.chart && this.chart.dispose) this.chart.dispose()
    this.chart = null
  },
  methods: {
    // #ifdef H5
    initH5Chart() {
      const el = document.getElementById('heatmap-box')
      if (!el) return
      try {
        this.chart = echarts.init(el, null, { renderer: 'canvas' })
        this.chart.setOption(buildOption(this.heatmap))
        this.onResize = () => {
          if (this.chart) this.chart.resize()
        }
        window.addEventListener('resize', this.onResize)
      } catch (e) {
        console.error('heatmap init failed', e)
      }
    },
    // #endif
    setToday() {
      const now = new Date()
      const week = ['日', '一', '二', '三', '四', '五', '六']
      this.todayLabel = now.getMonth() + 1 + ' 月 ' + now.getDate() + ' 日 · 周' + week[now.getDay()]
    },
    describeError(err) {
      const raw = err && err.message ? err.message : err && typeof err === 'object' ? JSON.stringify(err) : String(err)
      if (/not in domain list/i.test(raw)) {
        return '域名未加入白名单：在开发者工具「详情 → 本地设置」勾选「不校验合法域名」，或在小程序后台配置 request 合法域名。原始信息：' + raw
      }
      if (/timeout|timed?\s?out/i.test(raw)) {
        return '请求超时：确认后端已启动、手机与电脑连同一 Wi-Fi、防火墙已放行 8000 端口。原始信息：' + raw
      }
      if (/ssl|handshake|certificate/i.test(raw)) {
        return 'HTTPS 证书或 TLS 握手失败：检查域名证书是否有效，或临时改用 http 调试。原始信息：' + raw
      }
      if (/request:fail|connect|refused|fail|errCode/i.test(raw)) {
        return '连接失败：确认后端已启动、手机与电脑在同一 Wi-Fi、防火墙已放行 8000 端口。原始信息：' + raw
      }
      return raw || '未知错误：' + String(err)
    },
    load() {
      this.loading = true
      this.error = ''
      api.overview()
        .then((data) => {
          this.stats = {
            today_new: data.today_new,
            wrong: data.wrong,
            total: data.total,
            mastered: data.mastered
          }
          this.priority = data.priority || []
          this.heatmap = data.heatmap || { subjects: [], max_chapters: 0, cells: [] }
          this.loading = false
        })
        .catch((err) => {
          this.loading = false
          console.warn('[overview] request failed:', err)
          this.error = this.describeError(err)
          uni.showToast({ title: '概览加载失败', icon: 'none' })
        })
    },
    pct(value) {
      if (value === null || value === undefined) return '—'
      return Math.round(value * 100) + '%'
    },
    goEntry() {
      uni.switchTab({ url: '/pages/entry/entry' })
    },
    goList(item) {
      uni.switchTab({ url: '/pages/list/list' })
    }
  }
}
</script>

<style>
.hero-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}
.stat-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}
.stat-card {
  flex: 1 1 46%;
  padding: 14px 14px 12px;
}
.stat-label { font-size: 12px; color: #85878f; }
.stat-row { display: flex; align-items: baseline; gap: 4px; margin-top: 3px; }
.stat-value { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
.stat-suffix { font-size: 11px; color: #a7a9b0; }
.tone-indigo { color: #4f46e5; }
.tone-rose { color: #e11d48; }
.tone-teal { color: #0f766e; }
.priority-list { display: flex; flex-direction: column; gap: 10px; }
.priority-card { display: flex; align-items: center; gap: 12px; padding: 14px; }
.priority-rank {
  width: 30px; height: 30px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px; background: #eeefff; color: #4338ca;
  font-size: 13px; font-weight: 700;
}
.priority-main { flex: 1; min-width: 0; }
.priority-tags { display: flex; gap: 6px; margin-bottom: 5px; }
.priority-meta { font-size: 11px; color: #85878f; }
.priority-meta .strong { color: #e11d48; font-weight: 700; font-size: 12px; }
.priority-score { text-align: right; flex: none; }
.score-value { display: block; font-size: 17px; font-weight: 700; color: #4338ca; line-height: 1.2; }
.score-label { font-size: 10px; color: #a7a9b0; }
.chart-box { width: 100%; height: 250px; }
.heatmap-foot { margin-top: 10px; font-size: 11px; color: #a7a9b0; line-height: 1.5; }
.load-error { margin-top: 18px; border-left: 3px solid #e11d48; }
.load-error-title { font-size: 14px; font-weight: 700; color: #b91c1c; }
.load-error-text { margin: 6px 0 10px; font-size: 12px; color: #85878f; word-break: break-all; }
</style>
