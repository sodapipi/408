<template>
  <view class="page">
    <view class="page-head">
      <view class="eyebrow">重做模式</view>
      <view class="page-title">再错一次，才算真会</view>
      <view class="page-sub">从待掌握错题中随机抽题，标记结果并记录复习时间。</view>
    </view>

    <view class="card setup-card">
      <view class="field-row">
        <view class="field">
          <text class="label">科目</text>
          <picker :range="subjectNames" :value="subjectIndex" @change="onSubjectChange">
            <view class="picker"><text class="ellipsis">{{ subjectName }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">章节</text>
          <picker :range="chapterNames" :value="chapterIndex" @change="onChapterChange">
            <view class="picker"><text class="ellipsis">{{ chapterName }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">数量</text>
          <picker :range="countNames" :value="countIndex" @change="onCountChange">
            <view class="picker"><text>{{ countNames[countIndex] }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
      </view>
      <button class="btn btn-primary btn-block" @click="start">开始抽题</button>
      <view class="muted" style="margin-top: 10px">只抽取「未掌握」的错题；标记掌握后不再进入重做池。</view>
    </view>

    <view v-if="emptyHint" class="card empty">
      <text class="big">这个范围暂时没有待重做的错题</text>
      换一个科目或章节，或者先去录几道错题。
      <button class="btn btn-soft btn-sm" style="margin-top: 12px" @click="goEntry">去录题</button>
    </view>

    <view v-if="session && current" class="card review-card">
      <view class="review-top">
        <text class="muted">第 {{ index + 1 }} / {{ queue.length }} 题</text>
        <text class="link" @click="finish">结束本轮</text>
      </view>
      <view class="progress-track"><view class="progress-bar" :style="{ width: progressWidth }"></view></view>

      <view class="review-tags">
        <text class="tag tag-indigo">{{ current.subject }}</text>
        <text class="tag">{{ current.chapter_title }}</text>
        <text class="tag tag-rose">{{ current.cause }}</text>
      </view>
      <view class="review-content">{{ current.content || '（图片题，先看原图自己重做）' }}</view>
      <image
        v-if="current.image_url"
        class="review-image"
        :src="fileUrl(current.image_url)"
        mode="widthFix"
        @click="previewImage"
      />

      <button v-if="!showAnswer" class="btn btn-soft btn-block" @click="showAnswer = true">查看答案</button>
      <view v-else class="review-answer">
        <view class="answer-block">
          <text class="answer-label">我的答案</text>
          <text class="answer-text">{{ current.my_answer || '—' }}</text>
        </view>
        <view class="answer-block correct">
          <text class="answer-label">正确答案</text>
          <text class="answer-text">{{ current.correct_answer || '—' }}</text>
        </view>
        <view v-if="current.option_analysis" class="analysis">
          <text class="analysis-label">错选项分析</text>
          <text class="analysis-text">{{ current.option_analysis }}</text>
        </view>
      </view>

      <view class="review-actions">
        <button class="btn btn-danger" :disabled="!showAnswer || submitting" @click="mark('wrong')">仍错</button>
        <button class="btn btn-success" :disabled="!showAnswer || submitting" @click="mark('mastered')">掌握</button>
      </view>
    </view>

    <view v-if="summary" class="card summary-card">
      <view class="summary-mark">✓</view>
      <view class="summary-title">本轮完成</view>
      <view class="summary-stats">
        <view class="summary-item"><text class="summary-num ok">{{ summary.mastered }}</text><text class="muted">掌握</text></view>
        <view class="summary-item"><text class="summary-num bad">{{ summary.wrong }}</text><text class="muted">仍错</text></view>
      </view>
      <view class="muted summary-note">标记已写入复习记录，掌握度会同步更新。</view>
      <view class="summary-actions">
        <button class="btn btn-primary" @click="start">再抽一组</button>
        <button class="btn btn-ghost" @click="goHome">返回概览</button>
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '@/api'
import { fileUrl } from '@/config'

export default {
  data() {
    return {
      subjects: [],
      subjectIndex: 0,
      chapterIndex: 0,
      countIndex: 1,
      countOptions: [5, 10, 20],
      session: false,
      queue: [],
      index: 0,
      showAnswer: false,
      submitting: false,
      summary: null,
      emptyHint: false,
      loaded: false
    }
  },
  computed: {
    subjectNames() {
      const list = this.subjects.filter((s) => s.name !== '政治')
      return ['全部科目'].concat(list.map((s) => s.name))
    },
    subjectName() {
      return this.subjectNames[this.subjectIndex]
    },
    chapters() {
      if (this.subjectIndex === 0) {
        const all = []
        this.subjects
          .filter((s) => s.name !== '政治')
          .forEach((subject) => {
            subject.chapters.forEach((c) => all.push({ id: c.id, label: subject.name + ' · ' + c.title }))
          })
        return all
      }
      const subject = this.subjects.filter((s) => s.name !== '政治')[this.subjectIndex - 1]
      return subject ? subject.chapters.map((c) => ({ id: c.id, label: c.title })) : []
    },
    chapterNames() {
      return ['全部章节'].concat(this.chapters.map((c) => c.label))
    },
    chapterName() {
      return this.chapterNames[this.chapterIndex]
    },
    countNames() {
      return this.countOptions.map((n) => n + ' 道')
    },
    current() {
      return this.queue[this.index] || null
    },
    progressWidth() {
      if (!this.queue.length) return '0%'
      return Math.round(((this.index + 1) / this.queue.length) * 100) + '%'
    }
  },
  onLoad() {
    api.bootstrap()
      .then((data) => {
        this.subjects = data.subjects || []
        this.loaded = true
      })
      .catch((err) => {
        uni.showToast({ title: err.message || '加载失败', icon: 'none' })
      })
  },
  methods: {
    fileUrl,
    onSubjectChange(e) {
      this.subjectIndex = Number(e.detail.value)
      this.chapterIndex = 0
    },
    onChapterChange(e) {
      this.chapterIndex = Number(e.detail.value)
    },
    onCountChange(e) {
      this.countIndex = Number(e.detail.value)
    },
    start() {
      const params = { limit: this.countOptions[this.countIndex] }
      if (this.subjectIndex > 0) params.subject = this.subjectName
      if (this.chapterIndex > 0) {
        const chapter = this.chapters[this.chapterIndex - 1]
        if (chapter) params.chapter_id = chapter.id
      }
      this.summary = null
      this.emptyHint = false
      this.session = false
      api.review.queue(params)
        .then((data) => {
          this.queue = data.items || []
          this.index = 0
          this.showAnswer = false
          if (!this.queue.length) {
            this.emptyHint = true
            return
          }
          this.session = true
        })
        .catch((err) => {
          uni.showToast({ title: err.message || '抽题失败', icon: 'none' })
        })
    },
    mark(result) {
      const item = this.current
      if (!item || this.submitting) return
      this.submitting = true
      api.questions.review(item.id, result)
        .then(() => {
          this.submitting = false
          if (!this.summary) this.summary = { mastered: 0, wrong: 0 }
          this.summary[result] += 1
          this.next()
        })
        .catch((err) => {
          this.submitting = false
          uni.showToast({ title: err.message || '保存失败', icon: 'none' })
        })
    },
    next() {
      if (this.index + 1 >= this.queue.length) {
        this.finish()
        return
      }
      this.index += 1
      this.showAnswer = false
    },
    finish() {
      this.session = false
      if (!this.summary) this.summary = { mastered: 0, wrong: 0 }
    },
    goEntry() {
      uni.switchTab({ url: '/pages/entry/entry' })
    },
    goHome() {
      uni.switchTab({ url: '/pages/home/home' })
    }
  }
}
</script>

<style>
.page-head { margin-bottom: 16px; }
.setup-card { margin-bottom: 12px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 88px; }
.review-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.progress-track { height: 4px; border-radius: 999px; background: #f1f2f6; overflow: hidden; margin-bottom: 14px; }
.progress-bar { height: 100%; background: #4f46e5; border-radius: 999px; }
.review-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.review-content { font-size: 14px; line-height: 1.65; white-space: pre-wrap; }
.review-image { width: 100%; border-radius: 12px; margin-top: 10px; background: #f2f2ee; }
.review-answer { margin-top: 12px; }
.answers { display: flex; gap: 10px; }
.answer-block { flex: 1; padding: 10px 12px; border-radius: 12px; background: #fbfbf9; border: 1px solid #e8e7e1; }
.answer-block + .answer-block { margin-top: 0; }
.answer-block.correct { background: #ecfdf7; border-color: #c7ece2; }
.review-answer .answer-block { margin-bottom: 10px; }
.answer-label { display: block; font-size: 11px; color: #85878f; margin-bottom: 3px; }
.answer-text { font-size: 13px; white-space: pre-wrap; }
.analysis { padding: 10px 12px; border-radius: 12px; background: #fffbeb; border: 1px solid #f4e6c4; }
.analysis-label { display: block; font-size: 11px; font-weight: 600; color: #b45309; margin-bottom: 4px; }
.analysis-text { font-size: 13px; color: #7c4a06; white-space: pre-wrap; }
.review-actions { display: flex; gap: 10px; margin-top: 14px; }
.review-actions .btn { flex: 1; height: 42px; }
.summary-card { text-align: center; padding: 22px 16px; }
.summary-mark {
  width: 44px; height: 44px; margin: 0 auto 10px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: #ecfdf7; color: #0f766e; font-size: 20px; font-weight: 700;
}
.summary-title { font-size: 16px; font-weight: 700; }
.summary-stats { display: flex; justify-content: center; gap: 40px; margin: 14px 0 8px; }
.summary-item { display: flex; flex-direction: column; align-items: center; }
.summary-num { font-size: 22px; font-weight: 700; }
.summary-num.ok { color: #0f766e; }
.summary-num.bad { color: #e11d48; }
.summary-note { display: block; margin-bottom: 16px; }
.summary-actions { display: flex; gap: 10px; justify-content: center; }
.link { font-size: 12px; color: #4338ca; font-weight: 600; }
</style>
