<template>
  <view class="page">
    <view class="page-head">
      <view class="eyebrow">错题本</view>
      <view class="page-title">所有错题</view>
      <view class="page-sub">按科目、章节、错因和时间筛选，点开可看原图与详情。</view>
    </view>

    <view class="card filter-card">
      <view class="field-row">
        <view class="field">
          <picker :range="subjectNames" :value="subjectIndex" @change="onSubjectChange">
            <view class="picker"><text class="ellipsis">{{ subjectName }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <picker :range="chapterNames" :value="chapterIndex" @change="onChapterChange">
            <view class="picker"><text class="ellipsis">{{ chapterName }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <picker :range="causeNames" :value="causeIndex" @change="onCauseChange">
            <view class="picker"><text class="ellipsis">{{ causeName }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
      </view>

      <view class="seg" style="margin-bottom: 12px">
        <view
          v-for="item in statusOptions"
          :key="item.value"
          class="seg-item"
          :class="{ active: status === item.value }"
          @click="setStatus(item.value)"
        >{{ item.label }}</view>
      </view>

      <view class="search-box">
        <text class="search-icon">⌕</text>
        <input v-model="keyword" class="search-input" placeholder="搜索题干、来源、答案…" @confirm="load" />
      </view>

      <view class="filter-foot">
        <view class="deleted-toggle" @click="toggleDeleted">
          <text class="tag" :class="{ 'tag-rose': showDeleted }">{{ showDeleted ? '回收站（已删除）' : '回收站' }}</text>
        </view>
        <view class="muted">共 {{ count }} 条</view>
        <button class="btn btn-ghost btn-sm" @click="reset">重置</button>
      </view>
    </view>

    <view v-if="items.length" class="question-list">
      <view v-for="item in items" :key="item.id" class="card question-card" @click="openDetail(item)">
        <view class="q-tags">
          <text class="tag tag-indigo">{{ item.subject }}</text>
          <text class="tag">{{ item.chapter_title }}</text>
          <text v-if="item.section_title" class="tag">{{ item.section_title }}</text>
          <text class="tag tag-rose">{{ item.cause }}</text>
          <text v-if="item.deleted_at" class="tag tag-amber">已删除</text>
        </view>
        <view class="q-body">
          <view class="q-text">{{ preview(item) }}</view>
          <image v-if="item.image_url" class="q-thumb" :src="fileUrl(item.image_url)" mode="aspectFill" />
        </view>
        <view class="q-foot">
          <text class="muted">{{ item.created_at }}</text>
          <view class="q-actions">
            <text class="status-text" :class="item.status === 'mastered' ? 'ok' : 'bad'">
              {{ item.status === 'mastered' ? '已掌握' : '未掌握' }}
            </text>
            <text v-if="item.deleted_at" class="link" @click.stop="restore(item)">恢复</text>
          </view>
        </view>
      </view>
    </view>
    <view v-else class="card empty">
      <text class="big">{{ showDeleted ? '回收站是空的' : '没有符合条件的错题' }}</text>
      {{ showDeleted ? '删除的错题会在这里保留，可随时恢复。' : '换一下筛选条件，或者先去录几道错题。' }}
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
      causes: [],
      subjectIndex: 0,
      chapterIndex: 0,
      causeIndex: 0,
      status: '',
      keyword: '',
      showDeleted: false,
      items: [],
      count: 0,
      statusOptions: [
        { label: '全部', value: '' },
        { label: '未掌握', value: 'wrong' },
        { label: '已掌握', value: 'mastered' }
      ],
      loadedOnce: false
    }
  },
  computed: {
    subjectsForFilter() {
      return this.subjects.filter((item) => item.name !== '政治')
    },
    subjectNames() {
      return ['全部科目'].concat(this.subjectsForFilter.map((item) => item.name))
    },
    subjectName() {
      return this.subjectNames[this.subjectIndex]
    },
    subjectValue() {
      return this.subjectIndex === 0 ? '' : this.subjectNames[this.subjectIndex]
    },
    chapterOptions() {
      if (this.subjectIndex === 0) {
        const all = []
        this.subjectsForFilter.forEach((subject) => {
          subject.chapters.forEach((chapter) => {
            all.push({ id: chapter.id, label: subject.name + ' · ' + chapter.title })
          })
        })
        return all
      }
      const subject = this.subjectsForFilter[this.subjectIndex - 1]
      if (!subject) return []
      return subject.chapters.map((chapter) => ({ id: chapter.id, label: chapter.title }))
    },
    chapterNames() {
      return ['全部章节'].concat(this.chapterOptions.map((item) => item.label))
    },
    chapterName() {
      return this.chapterNames[this.chapterIndex]
    },
    chapterValue() {
      if (this.chapterIndex === 0) return ''
      const option = this.chapterOptions[this.chapterIndex - 1]
      return option ? option.id : ''
    },
    causeNames() {
      return ['全部错因'].concat(this.causes)
    },
    causeName() {
      return this.causeNames[this.causeIndex]
    },
    causeValue() {
      return this.causeIndex === 0 ? '' : this.causes[this.causeIndex - 1]
    }
  },
  onLoad() {
    api.bootstrap()
      .then((data) => {
        this.subjects = data.subjects || []
        this.causes = data.causes || []
        this.loadedOnce = true
        this.load()
      })
      .catch((err) => {
        uni.showToast({ title: err.message || '加载失败', icon: 'none' })
      })
  },
  onShow() {
    if (this.loadedOnce) this.load()
  },
  methods: {
    fileUrl,
    load() {
      const params = { limit: 200 }
      if (this.subjectValue) params.subject = this.subjectValue
      if (this.chapterValue) params.chapter_id = this.chapterValue
      if (this.causeValue) params.cause = this.causeValue
      if (this.status) params.status = this.status
      if (this.keyword.trim()) params.q = this.keyword.trim()
      if (this.showDeleted) params.include_deleted = true

      api.questions.list(params)
        .then((data) => {
          this.items = data.items || []
          this.count = data.count || 0
        })
        .catch((err) => {
          uni.showToast({ title: err.message || '加载失败', icon: 'none' })
        })
    },
    onSubjectChange(e) {
      this.subjectIndex = Number(e.detail.value)
      this.chapterIndex = 0
      this.load()
    },
    onChapterChange(e) {
      this.chapterIndex = Number(e.detail.value)
      this.load()
    },
    onCauseChange(e) {
      this.causeIndex = Number(e.detail.value)
      this.load()
    },
    setStatus(value) {
      this.status = value
      this.load()
    },
    toggleDeleted() {
      this.showDeleted = !this.showDeleted
      this.load()
    },
    reset() {
      this.subjectIndex = 0
      this.chapterIndex = 0
      this.causeIndex = 0
      this.status = ''
      this.keyword = ''
      this.showDeleted = false
      this.load()
    },
    preview(item) {
      const text = (item.content || item.ocr_raw || '').trim()
      if (!text) return item.image_url ? '（图片题，点开看原图）' : '（无题干文字）'
      const first = text.split('\n')[0]
      return first.length > 70 ? first.slice(0, 70) + '…' : first
    },
    openDetail(item) {
      uni.navigateTo({ url: '/pages/detail/detail?id=' + item.id })
    },
    restore(item) {
      api.questions.restore(item.id)
        .then(() => {
          uni.showToast({ title: '已恢复', icon: 'success' })
          this.load()
        })
        .catch((err) => {
          uni.showToast({ title: err.message || '恢复失败', icon: 'none' })
        })
    }
  }
}
</script>

<style>
.page-head { margin-bottom: 16px; }
.filter-card { margin-bottom: 14px; }
.search-box {
  display: flex; align-items: center; gap: 8px;
  height: 40px; padding: 0 12px;
  border: 1px solid #e8e7e1; border-radius: 12px; background: #fbfbf9;
}
.search-icon { color: #a7a9b0; font-size: 15px; }
.search-input { flex: 1; height: 38px; font-size: 13px; }
.filter-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; }
.question-list { display: flex; flex-direction: column; gap: 10px; }
.question-card { padding: 14px; }
.q-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.q-body { display: flex; gap: 10px; margin: 9px 0 8px; }
.q-text { flex: 1; font-size: 13px; line-height: 1.55; color: #1b1c1f; }
.q-thumb { width: 56px; height: 56px; border-radius: 10px; flex: none; background: #f2f2ee; }
.q-foot { display: flex; align-items: center; justify-content: space-between; }
.q-actions { display: flex; align-items: center; gap: 10px; }
.status-text { font-size: 11px; font-weight: 600; }
.status-text.ok { color: #0f766e; }
.status-text.bad { color: #e11d48; }
.link { font-size: 12px; color: #4338ca; font-weight: 600; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px; }
</style>
