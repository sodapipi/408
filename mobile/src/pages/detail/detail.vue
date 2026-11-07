<template>
  <view class="page">
    <view v-if="item" class="detail">
      <view class="page-head">
        <view class="eyebrow">{{ item.qtype === 'politics_choice' ? '政治选择题' : item.subject }}</view>
        <view class="page-title">错题详情</view>
        <view class="sub-row">
          <text class="tag tag-indigo">{{ item.subject }}</text>
          <text class="tag">{{ item.chapter_title }}</text>
          <text v-if="item.section_title" class="tag">{{ item.section_title }}</text>
          <text class="tag tag-rose">{{ item.cause }}</text>
          <text v-if="item.deleted_at" class="tag tag-amber">回收站</text>
        </view>
      </view>

      <view class="card">
        <image
          v-if="item.image_url"
          class="detail-image"
          :src="fileUrl(item.image_url)"
          mode="widthFix"
          @click="previewImage"
        />
        <view v-if="item.content" class="detail-content">{{ item.content }}</view>
        <view v-if="item.option_analysis" class="analysis">
          <text class="analysis-label">错选项分析</text>
          <text class="analysis-text">{{ item.option_analysis }}</text>
        </view>
        <view v-if="item.my_answer || item.correct_answer" class="answers">
          <view class="answer-block">
            <text class="answer-label">我的答案</text>
            <text class="answer-text">{{ item.my_answer || '—' }}</text>
          </view>
          <view class="answer-block correct">
            <text class="answer-label">正确答案</text>
            <text class="answer-text">{{ item.correct_answer || '—' }}</text>
          </view>
        </view>

        <view class="meta-list">
          <view class="meta-row"><text class="meta-k">录入时间</text><text class="meta-v">{{ item.created_at }}</text></view>
          <view class="meta-row"><text class="meta-k">复习次数</text><text class="meta-v">{{ item.review_count }} 次{{ item.last_review_at ? ' · 最近 ' + item.last_review_at : '' }}</text></view>
          <view v-if="item.source" class="meta-row"><text class="meta-k">来源</text><text class="meta-v">{{ item.source }}</text></view>
          <view v-if="item.exam_year" class="meta-row"><text class="meta-k">年份</text><text class="meta-v">{{ item.exam_year }}</text></view>
          <view v-if="item.ocr_raw" class="meta-row"><text class="meta-k">OCR 原文</text><text class="meta-v">{{ item.ocr_raw }}</text></view>
        </view>
      </view>

      <view class="card edit-card">
        <view class="card-head">
          <text class="title">修正分类</text>
          <text class="hint">改完立即生效</text>
        </view>

        <view v-if="isPolitics" class="field">
          <text class="label">题干文字 <text class="hint">可改 OCR 识别错字</text></text>
          <textarea class="textarea" v-model="form.content" placeholder="题干文字…" />
        </view>

        <view v-if="isPolitics" class="field-row">
          <view class="field">
            <text class="label">错选项分析 <text class="hint">必填</text></text>
            <textarea class="textarea" v-model="form.option_analysis" placeholder="错误选项错在哪…" />
          </view>
          <view class="field" style="max-width: 110px">
            <text class="label">年份</text>
            <input class="input" v-model="form.exam_year" placeholder="2024" />
          </view>
        </view>

        <view class="field-row">
          <view class="field">
            <text class="label">章</text>
            <picker :range="chapterNames" :value="chapterIndex" @change="onChapterChange">
              <view class="picker"><text class="ellipsis">{{ chapterName }}</text><text class="arrow">▾</text></view>
            </picker>
          </view>
          <view class="field">
            <text class="label">节</text>
            <picker :range="sectionNames" :value="sectionIndex" @change="onSectionChange">
              <view class="picker"><text class="ellipsis">{{ sectionName }}</text><text class="arrow">▾</text></view>
            </picker>
          </view>
        </view>

        <view class="field">
          <text class="label">错因标签</text>
          <view class="cause-wrap">
            <view
              v-for="name in causeList"
              :key="name"
              class="cause-chip"
              :class="{ active: form.cause === name }"
              @click="form.cause = name"
            >{{ name }}</view>
          </view>
        </view>

        <view class="edit-actions">
          <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存修改' }}</button>
          <button v-if="!item.deleted_at" class="btn btn-danger" @click="remove">移入回收站</button>
          <button v-else class="btn btn-soft" @click="restore">从回收站恢复</button>
        </view>
      </view>
    </view>
    <view v-else class="card empty">
      <text class="big">{{ loadError ? '加载失败' : '加载中…' }}</text>
      {{ loadError || '正在读取错题详情' }}
    </view>
  </view>
</template>

<script>
import { api } from '@/api'
import { fileUrl } from '@/config'

export default {
  data() {
    return {
      id: 0,
      item: null,
      loadError: '',
      subjects: [],
      causes: [],
      politicsCauses: [],
      chapterIndex: 0,
      sectionIndex: 0,
      form: { content: '', option_analysis: '', exam_year: '', cause: '' },
      saving: false
    }
  },
  computed: {
    isPolitics() {
      return this.item && this.item.qtype === 'politics_choice'
    },
    subject() {
      if (!this.item) return null
      return this.subjects.find((s) => s.name === this.item.subject) || null
    },
    chapters() {
      return this.subject ? this.subject.chapters : []
    },
    chapterNames() {
      return this.chapters.map((c) => c.title)
    },
    chapterName() {
      const chapter = this.chapters[this.chapterIndex]
      return chapter ? chapter.title : '—'
    },
    sections() {
      const chapter = this.chapters[this.chapterIndex]
      return chapter ? chapter.sections : []
    },
    sectionNames() {
      return ['（不选小节）'].concat(this.sections.map((s) => s.title))
    },
    sectionName() {
      if (this.sectionIndex === 0) return '不选小节'
      const section = this.sections[this.sectionIndex - 1]
      return section ? section.title : '不选小节'
    },
    causeList() {
      return this.isPolitics ? this.politicsCauses : this.causes
    }
  },
  onLoad(options) {
    this.id = Number(options.id || 0)
    this.load()
  },
  methods: {
    fileUrl,
    load() {
      api.bootstrap()
        .then((data) => {
          this.subjects = data.subjects || []
          this.causes = data.causes || []
          this.politicsCauses = data.politics_causes || []
          return api.questions.get(this.id)
        })
        .then((item) => {
          this.item = item
          this.syncForm(item)
        })
        .catch((err) => {
          this.loadError = err.message || '错题不存在'
        })
    },
    syncForm(item) {
      this.form = {
        content: item.content || '',
        option_analysis: item.option_analysis || '',
        exam_year: item.exam_year || '',
        cause: item.cause || ''
      }
      const chapterIdx = this.chapters.findIndex((c) => c.id === item.chapter_id)
      this.chapterIndex = chapterIdx >= 0 ? chapterIdx : 0
      const sections = this.chapters[this.chapterIndex] ? this.chapters[this.chapterIndex].sections : []
      const sectionIdx = sections.findIndex((s) => s.id === item.section_id)
      this.sectionIndex = sectionIdx >= 0 ? sectionIdx + 1 : 0
    },
    onChapterChange(e) {
      this.chapterIndex = Number(e.detail.value)
      this.sectionIndex = 0
    },
    onSectionChange(e) {
      this.sectionIndex = Number(e.detail.value)
    },
    previewImage() {
      uni.previewImage({ urls: [fileUrl(this.item.image_url)] })
    },
    save() {
      const chapter = this.chapters[this.chapterIndex]
      if (!chapter) {
        uni.showToast({ title: '请选择章', icon: 'none' })
        return
      }
      if (this.isPolitics && !this.form.option_analysis.trim()) {
        uni.showToast({ title: '政治选择题必须填写错选项分析', icon: 'none' })
        return
      }
      const section = this.sectionIndex > 0 ? this.sections[this.sectionIndex - 1] : null
      const payload = {
        chapter_id: chapter.id,
        section_id: section ? section.id : null,
        cause: this.form.cause
      }
      if (this.isPolitics) {
        payload.content = this.form.content
        payload.option_analysis = this.form.option_analysis
        payload.exam_year = this.form.exam_year
      }
      this.saving = true
      api.questions.update(this.id, payload)
        .then((item) => {
          this.saving = false
          this.item = item
          this.syncForm(item)
          uni.showToast({ title: '已保存', icon: 'success' })
        })
        .catch((err) => {
          this.saving = false
          uni.showToast({ title: err.message || '保存失败', icon: 'none' })
        })
    },
    remove() {
      uni.showModal({
        title: '移入回收站',
        content: '删除后可在错题本的「回收站」里恢复。',
        confirmText: '删除',
        confirmColor: '#e11d48',
        success: (res) => {
          if (!res.confirm) return
          api.questions.remove(this.id)
            .then((item) => {
              this.item = item
              this.syncForm(item)
              uni.showToast({ title: '已移入回收站', icon: 'none' })
            })
            .catch((err) => {
              uni.showToast({ title: err.message || '删除失败', icon: 'none' })
            })
        }
      })
    },
    restore() {
      api.questions.restore(this.id)
        .then((item) => {
          this.item = item
          this.syncForm(item)
          uni.showToast({ title: '已恢复', icon: 'success' })
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
.sub-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.detail-image { width: 100%; border-radius: 12px; margin-bottom: 12px; background: #f2f2ee; }
.detail-content { font-size: 14px; line-height: 1.65; white-space: pre-wrap; }
.detail-content + .analysis { margin-top: 12px; }
.analysis { padding: 10px 12px; border-radius: 12px; background: #fffbeb; border: 1px solid #f4e6c4; }
.analysis-label { display: block; font-size: 11px; font-weight: 600; color: #b45309; margin-bottom: 4px; }
.analysis-text { font-size: 13px; color: #7c4a06; line-height: 1.6; white-space: pre-wrap; }
.answers { display: flex; gap: 10px; margin-top: 12px; }
.answer-block { flex: 1; padding: 10px 12px; border-radius: 12px; background: #fbfbf9; border: 1px solid #e8e7e1; }
.answer-block.correct { background: #ecfdf7; border-color: #c7ece2; }
.answer-label { display: block; font-size: 11px; color: #85878f; margin-bottom: 3px; }
.answer-text { font-size: 13px; white-space: pre-wrap; }
.meta-list { margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e8e7e1; }
.meta-row { display: flex; gap: 10px; font-size: 11px; line-height: 1.8; }
.meta-k { width: 62px; flex: none; color: #a7a9b0; }
.meta-v { flex: 1; color: #4b4d55; word-break: break-all; }
.edit-card { margin-top: 12px; }
.cause-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
.cause-chip {
  height: 30px; padding: 0 12px; border-radius: 999px;
  display: flex; align-items: center;
  border: 1px solid #e8e7e1; background: #ffffff;
  font-size: 12px; color: #4b4d55;
}
.cause-chip.active { background: #eeefff; border-color: #c7c5f5; color: #4338ca; font-weight: 600; }
.edit-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
</style>
