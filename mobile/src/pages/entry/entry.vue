<template>
  <view class="page">
    <view class="page-head">
      <view class="eyebrow">新增记录</view>
      <view class="page-title">录一道错题</view>
      <view class="page-sub">照片或文字都行，选好章节和错因就能收进错题本。</view>
      <view v-if="roundCount" class="round-badge">本轮已录 {{ roundCount }} 道</view>
    </view>

    <view class="card upload-card">
      <view class="card-head">
        <text class="title">题目照片</text>
        <text class="hint">{{ imagePath || tempPath ? '已选择' : '可选' }}</text>
      </view>
      <view v-if="previewSrc" class="preview-wrap">
        <image class="thumb" :src="previewSrc" mode="widthFix" @click="previewImage" />
        <view class="image-remove" @click="removeImage">×</view>
      </view>
      <view v-else class="dropzone" @click="chooseImage">
        <view class="upload-icon">↑</view>
        <view class="drop-strong">拍照或从相册选图</view>
        <view class="drop-hint">选图后自动识别文字 · JPG / PNG · 15MB 内</view>
      </view>
      <view v-if="ocrStatus" class="ocr-status">{{ ocrStatus }}</view>
      <view class="upload-tip">只上传图片也可以保存；识别结果可修改，手写批注与公式不做文字化。</view>
    </view>

    <view class="card">
      <view class="field">
        <text class="label">科目</text>
        <picker :range="subjectNames" :value="subjectIndex" @change="onSubjectChange">
          <view class="picker"><text>{{ subjectName }}</text><text class="arrow">▾</text></view>
        </picker>
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
        <text class="label">题目文字 <text class="hint">照片自动识别，可修改；与照片至少填一项</text></text>
        <textarea class="textarea" v-model="content" placeholder="上传照片后自动填入，识别有误可直接改；也可粘贴题干…" />
      </view>

      <view v-if="isPolitics" class="field politics-toggle">
        <view>
          <text class="label" style="margin-bottom: 2px">政治选择题</text>
          <text class="hint">政治错题只记陷阱，不做重做与掌握度</text>
        </view>
        <switch :checked="politicsMode" color="#4f46e5" @change="onPoliticsModeChange" />
      </view>

      <view v-if="politicsMode" class="field-row">
        <view class="field">
          <text class="label">错选项分析 <text class="hint">必填：错的那个选项错在哪</text></text>
          <textarea class="textarea" v-model="optionAnalysis" placeholder="如：B 项把“主要矛盾”说成“基本矛盾”，概念偷换。" />
        </view>
        <view class="field" style="max-width: 120px">
          <text class="label">年份 <text class="hint">可选</text></text>
          <input class="input" v-model="examYear" placeholder="2024" />
        </view>
      </view>

      <view class="field">
        <text class="label">错因标签 <text class="hint">必选</text></text>
        <view class="cause-wrap">
          <view
            v-for="item in causes"
            :key="item"
            class="cause-chip"
            :class="{ active: cause === item }"
            @click="cause = item"
          >{{ item }}</view>
        </view>
      </view>

      <view class="field-row">
        <view class="field">
          <text class="label">来源 <text class="hint">可选</text></text>
          <input class="input" v-model="source" placeholder="王道 5.3 / 真题 2023" />
        </view>
        <view class="field">
          <text class="label">我的答案</text>
          <input class="input" v-model="myAnswer" placeholder="当时的答案" />
        </view>
        <view class="field">
          <text class="label">正确答案</text>
          <input class="input" v-model="correctAnswer" placeholder="订正后" />
        </view>
      </view>

      <view class="entry-actions">
        <text class="form-tip">保存后清空照片与文字，保留科目与章节</text>
        <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存并继续' }}</button>
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
      causes: [],
      politicsCauses: [],
      subjectIndex: 0,
      chapterIndex: 0,
      sectionIndex: 0,
      cause: '',
      political: false,
      politicsMode: false,
      content: '',
      source: '',
      myAnswer: '',
      correctAnswer: '',
      optionAnalysis: '',
      examYear: '',
      tempPath: '',
      imagePath: '',
      ocrText: '',
      ocrStatus: '',
      saving: false,
      roundCount: 0,
      loaded: false
    }
  },
  computed: {
    subject() {
      return this.subjects[this.subjectIndex] || null
    },
    subjectNames() {
      return this.subjects.map((item) => item.name)
    },
    subjectName() {
      return this.subject ? this.subject.name : '加载中…'
    },
    isPolitics() {
      return this.subjectName === '政治'
    },
    chapters() {
      return this.subject ? this.subject.chapters : []
    },
    chapterNames() {
      return this.chapters.map((item) => item.title)
    },
    chapter() {
      return this.chapters[this.chapterIndex] || null
    },
    chapterName() {
      return this.chapter ? this.chapter.title : '请选择'
    },
    sections() {
      return this.chapter ? this.chapter.sections : []
    },
    sectionNames() {
      const list = this.sections.map((item) => item.title)
      return list.length ? ['（不选小节）'].concat(list) : ['（不选小节）']
    },
    section() {
      if (!this.sections.length || this.sectionIndex === 0) return null
      return this.sections[this.sectionIndex - 1]
    },
    sectionName() {
      return this.section ? this.section.title : '不选小节'
    },
    previewSrc() {
      return this.tempPath || fileUrl(this.imagePath)
    }
  },
  onLoad() {
    this.loadBootstrap()
  },
  methods: {
    loadBootstrap() {
      api.bootstrap()
        .then((data) => {
          this.subjects = data.subjects || []
          this.politicsCauses = data.politics_causes || []
          this.causes = data.causes || []
          this.loaded = true
          const last = uni.getStorageSync('entry_last_subject')
          if (last) {
            const idx = this.subjects.findIndex((item) => item.name === last)
            if (idx >= 0) this.subjectIndex = idx
          }
          this.cause = this.causes[0] || ''
        })
        .catch((err) => {
          uni.showToast({ title: err.message || '科目加载失败', icon: 'none' })
        })
    },
    onSubjectChange(e) {
      this.subjectIndex = Number(e.detail.value)
      this.chapterIndex = 0
      this.sectionIndex = 0
      this.politicsMode = false
      this.cause = (this.isPolitics ? this.politicsCauses[0] : this.causes[0]) || ''
      uni.setStorageSync('entry_last_subject', this.subjectName)
    },
    onChapterChange(e) {
      this.chapterIndex = Number(e.detail.value)
      this.sectionIndex = 0
    },
    onSectionChange(e) {
      this.sectionIndex = Number(e.detail.value)
    },
    onPoliticsModeChange(e) {
      this.politicsMode = e.detail.value
      this.cause = (this.politicsMode ? this.politicsCauses[0] : this.causes[0]) || ''
    },
    chooseImage() {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['camera', 'album'],
        success: (res) => {
          this.tempPath = res.tempFilePaths[0]
          this.imagePath = ''
          this.runOcr()
        }
      })
    },
    removeImage() {
      this.tempPath = ''
      this.imagePath = ''
      this.ocrStatus = ''
    },
    previewImage() {
      if (this.previewSrc) uni.previewImage({ urls: [this.previewSrc] })
    },
    runOcr() {
      if (!this.tempPath) return
      this.ocrStatus = '正在识别文字…'
      api.ocr(this.tempPath)
        .then((res) => {
          this.imagePath = res.image_path || ''
          this.ocrText = res.text || ''
          if (!this.content && this.ocrText) this.content = this.ocrText
          if (res.error) {
            this.ocrStatus = '识别未完成：' + res.error + '（可直接手动输入题干）'
          } else if (this.ocrText) {
            this.ocrStatus = '识别完成，用时 ' + (res.elapsed_ms || 0) + ' ms，可直接修改下方文字'
          } else {
            this.ocrStatus = '没有识别到文字，可直接手动输入题干'
          }
        })
        .catch((err) => {
          this.ocrStatus = '识别失败：' + (err.message || '请重试') + '（图片仍可保存）'
        })
    },
    save() {
      if (!this.loaded || !this.subject) return
      if (!this.chapter) {
        uni.showToast({ title: '请选择章节', icon: 'none' })
        return
      }
      if (!this.cause) {
        uni.showToast({ title: '请选择错因标签', icon: 'none' })
        return
      }
      if (!this.content.trim() && !this.imagePath) {
        uni.showToast({ title: '请填写题目文字或上传照片', icon: 'none' })
        return
      }
      if (this.politicsMode && !this.optionAnalysis.trim()) {
        uni.showToast({ title: '政治选择题必须填写错选项分析', icon: 'none' })
        return
      }

      this.saving = true
      const form = {
        subject: this.subjectName,
        chapter_id: this.chapter.id,
        cause: this.cause,
        content: this.content,
        ocr_raw: this.ocrText,
        source: this.source,
        my_answer: this.myAnswer,
        correct_answer: this.correctAnswer,
        image_path: this.imagePath,
        qtype: this.politicsMode ? 'politics_choice' : 'regular',
        option_analysis: this.politicsMode ? this.optionAnalysis : '',
        exam_year: this.politicsMode ? this.examYear : ''
      }
      if (this.section) form.section_id = this.section.id

      api.questions.create(form)
        .then(() => {
          this.saving = false
          this.roundCount += 1
          this.tempPath = ''
          this.imagePath = ''
          this.ocrText = ''
          this.ocrStatus = ''
          this.content = ''
          this.source = ''
          this.myAnswer = ''
          this.correctAnswer = ''
          this.optionAnalysis = ''
          this.examYear = ''
          uni.showToast({ title: '已保存第 ' + this.roundCount + ' 道', icon: 'success' })
        })
        .catch((err) => {
          this.saving = false
          uni.showModal({ title: '保存失败', content: err.message || '请稍后重试', showCancel: false })
        })
    }
  }
}
</script>

<style>
.page-head { margin-bottom: 16px; }
.round-badge {
  display: inline-flex;
  margin-top: 10px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #eeefff;
  color: #4338ca;
  font-size: 11px;
  font-weight: 600;
}
.upload-card { margin-bottom: 12px; }
.preview-wrap { position: relative; }
.image-remove {
  position: absolute; right: 8px; top: 8px;
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(27, 28, 31, 0.62); color: #fff; font-size: 17px; line-height: 1;
}
.dropzone {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 26px 16px; border-radius: 14px;
  border: 1px dashed #d8d6cd; background: #fbfbf9; text-align: center;
}
.upload-icon {
  width: 40px; height: 40px; border-radius: 12px; margin-bottom: 10px;
  display: flex; align-items: center; justify-content: center;
  background: #eeefff; color: #4f46e5; font-size: 20px; font-weight: 700;
}
.drop-strong { font-size: 14px; font-weight: 600; }
.drop-hint { margin-top: 4px; font-size: 11px; color: #a7a9b0; }
.ocr-status {
  margin-top: 10px; padding: 8px 10px; border-radius: 10px;
  background: #fffbeb; color: #b45309; font-size: 12px; line-height: 1.5;
}
.upload-tip { margin-top: 8px; font-size: 11px; color: #a7a9b0; line-height: 1.5; }
.ellipsis {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 120px;
}
.cause-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
.cause-chip {
  height: 30px; padding: 0 12px; border-radius: 999px;
  display: flex; align-items: center;
  border: 1px solid #e8e7e1; background: #ffffff;
  font-size: 12px; color: #4b4d55;
}
.cause-chip.active { background: #eeefff; border-color: #c7c5f5; color: #4338ca; font-weight: 600; }
.politics-toggle { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 12px; background: #fbfbf9; border: 1px solid #e8e7e1; }
.entry-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 6px; }
.form-tip { flex: 1; font-size: 11px; color: #a7a9b0; line-height: 1.5; }
</style>
