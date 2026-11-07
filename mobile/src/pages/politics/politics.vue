<template>
  <view class="page">
    <view class="page-head">
      <view class="eyebrow">考研政治 · 陷阱清单</view>
      <view class="page-title">考点、时政与错题</view>
      <view class="page-sub">不做掌握度诊断。这里只负责快速记、快速找、考前快速翻。</view>
    </view>

    <view class="card search-card">
      <view class="search-box">
        <text class="search-icon">⌕</text>
        <input v-model="searchKeyword" class="search-input" placeholder="搜考点 / 时政 / 框架 / 政治错题…" @confirm="doSearch" />
        <text v-if="searchKeyword" class="clear-btn" @click="clearSearch">×</text>
      </view>
      <view class="muted" style="margin-top: 8px">{{ searchHint }}</view>
      <view v-if="searchResults.length" class="search-results">
        <view v-for="item in searchResults" :key="item.type + '-' + item.id" class="search-item" @click="openResult(item)">
          <view class="search-item-head">
            <text class="tag" :class="typeTag(item.type)">{{ typeLabel(item.type) }}</text>
            <text class="search-title">{{ item.title || '（无标题）' }}</text>
          </view>
          <view v-if="item.snippet" class="search-snippet">{{ item.snippet }}</view>
          <view v-if="item.meta" class="muted">{{ item.meta }}</view>
        </view>
      </view>
    </view>

    <view class="seg tabs" style="margin: 14px 0">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="seg-item"
        :class="{ active: activeTab === tab.value }"
        @click="activeTab = tab.value"
      >{{ tab.label }}</view>
    </view>

    <!-- 知识点卡 -->
    <view v-if="activeTab === 'cards'">
      <view class="toolbar">
        <view class="toolbar-filters">
          <picker :range="bigChapterNames" :value="cardChapterIndex" @change="onCardChapterChange">
            <view class="picker picker-sm"><text class="ellipsis">{{ bigChapterName }}</text><text class="arrow">▾</text></view>
          </picker>
          <picker :range="cardSectionNames" :value="cardSectionIndex" @change="onCardSectionChange">
            <view class="picker picker-sm"><text class="ellipsis">{{ cardSectionName }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
        <text class="muted">{{ cards.length }} 张</text>
      </view>
      <view class="toolbar-actions">
        <button class="btn btn-ghost btn-sm" @click="toggleDeleted('cards')">{{ cardsDeleted ? '退出回收站' : '回收站' }}</button>
        <button class="btn btn-soft btn-sm" @click="newCard">＋ 新建卡片</button>
      </view>

      <view v-if="cardFormOpen" id="card-form" class="card form-card">
        <view class="card-head">
          <text class="title">{{ cardEditingId ? '编辑卡片' : '新建卡片' }}</text>
          <text class="hint">保存后立即刷新</text>
        </view>
        <view class="field-row">
          <view class="field">
            <text class="label">大块</text>
            <picker :range="bigChapterNames" :value="cardFormChapterIndex" @change="onFormChapterChange">
              <view class="picker"><text class="ellipsis">{{ bigChapterNames[cardFormChapterIndex] }}</text><text class="arrow">▾</text></view>
            </picker>
          </view>
          <view class="field">
            <text class="label">章</text>
            <picker :range="formSectionNames" :value="cardFormSectionIndex" @change="onFormSectionChange">
              <view class="picker"><text class="ellipsis">{{ formSectionNames[cardFormSectionIndex] }}</text><text class="arrow">▾</text></view>
            </picker>
          </view>
        </view>
        <view class="field">
          <text class="label">正面 · 考点名</text>
          <input class="input" v-model="cardForm.title" placeholder="如：矛盾的普遍性与特殊性" />
        </view>
        <view class="field">
          <text class="label">背面 · 关键词 / 一句话解释 <text class="hint">支持换行</text></text>
          <textarea class="textarea" v-model="cardForm.body" placeholder="普遍性：矛盾存在于一切事物中…&#10;特殊性：具体事物矛盾各有特点…" />
        </view>
        <view v-if="cardEditingId" class="field-row">
          <view class="field">
            <text class="label">上次自评 <text class="hint">误点后可手动修正</text></text>
            <picker :range="ratingNames" :value="cardFormRatingIndex" @change="onFormRatingChange">
              <view class="picker"><text>{{ ratingNames[cardFormRatingIndex] }}</text><text class="arrow">▾</text></view>
            </picker>
          </view>
          <view class="field">
            <text class="label">看过次数</text>
            <input class="input" type="number" v-model="cardForm.view_count" />
          </view>
        </view>
        <view class="form-actions">
          <button class="btn btn-ghost" @click="cardFormOpen = false">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="saveCard">{{ saving ? '保存中…' : '保存卡片' }}</button>
        </view>
      </view>

      <view v-if="cards.length" class="card-list">
        <view v-for="card in cards" :id="'card-' + card.id" :key="card.id" class="card k-card">
          <view class="k-head">
            <text class="k-title">{{ card.title }}</text>
            <text class="tag">{{ card.view_count }} 次</text>
          </view>
          <view class="k-meta">
            {{ card.chapter_title }}<text v-if="card.section_title"> · {{ card.section_title }}</text>
            · {{ ratingLabel(card.self_rating) }}
            <text v-if="card.deleted_at"> · 已删除</text>
          </view>
          <view v-if="!revealed[card.id]" class="k-hidden" @click="reveal(card)">
            <text class="k-hidden-text">关键词已遮住 · 点一下揭晓</text>
            <text class="k-blur">{{ masked(card.body) }}</text>
          </view>
          <view v-else class="k-body">{{ card.body || '（没有背面内容）' }}</view>

          <view v-if="!card.deleted_at" class="k-actions">
            <text class="k-link" @click="rate(card, 'remembered')">记住了</text>
            <text class="k-link" @click="rate(card, 'forgotten')">没记住</text>
            <text class="k-link" @click="editCard(card)">编辑</text>
            <text class="k-link danger" @click="deleteCard(card)">删除</text>
          </view>
          <view v-else class="k-actions">
            <text class="k-link" @click="restoreCard(card)">恢复</text>
          </view>
        </view>
      </view>
      <view v-else class="card empty">
        <text class="big">{{ cardsDeleted ? '回收站是空的' : '还没有知识点卡' }}</text>
        {{ cardsDeleted ? '删除的卡片会出现在这里。' : '先建一张：正面考点名，背面关键词。' }}
      </view>
    </view>

    <!-- 时政素材 -->
    <view v-if="activeTab === 'affairs'">
      <view class="toolbar">
        <view class="toolbar-filters">
          <picker :range="tagNames" :value="tagIndex" @change="onTagChange">
            <view class="picker picker-sm"><text class="ellipsis">{{ tagNames[tagIndex] }}</text><text class="arrow">▾</text></view>
          </picker>
          <picker :range="pointNames" :value="pointIndex" @change="onPointChange">
            <view class="picker picker-sm"><text class="ellipsis">{{ pointNames[pointIndex] }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
        <text class="muted">{{ visibleAffairs.length }} 条</text>
      </view>
      <view class="toolbar-actions">
        <button class="btn btn-ghost btn-sm" @click="toggleDeleted('affairs')">{{ affairsDeleted ? '退出回收站' : '回收站' }}</button>
        <button class="btn btn-soft btn-sm" @click="newAffair">＋ 记一条时政</button>
      </view>

      <view v-if="affairFormOpen" id="affair-form" class="card form-card">
        <view class="card-head">
          <text class="title">{{ affairEditingId ? '编辑时政' : '新增时政' }}</text>
        </view>
        <view class="field-row">
          <view class="field">
            <text class="label">日期</text>
            <picker mode="date" :value="affairForm.event_date" @change="onAffairDate">
              <view class="picker"><text>{{ affairForm.event_date || '选择日期' }}</text><text class="arrow">▾</text></view>
            </picker>
          </view>
          <view class="field" style="flex: 2">
            <text class="label">事件</text>
            <input class="input" v-model="affairForm.title" placeholder="如：中央经济工作会议召开" />
          </view>
        </view>
        <view class="field-row">
          <view class="field">
            <text class="label">标签 <text class="hint">逗号分隔</text></text>
            <input class="input" v-model="affairForm.tags" placeholder="经济, 会议" />
          </view>
          <view class="field">
            <text class="label">关联考点</text>
            <input class="input" v-model="affairForm.related_point" placeholder="高质量发展" />
          </view>
        </view>
        <view class="field">
          <text class="label">备注 <text class="hint">可选，记一句命题角度</text></text>
          <textarea class="textarea" v-model="affairForm.note" placeholder="可能从“为什么”或“怎么做”角度命题…" />
        </view>
        <view class="form-actions">
          <button class="btn btn-ghost" @click="affairFormOpen = false">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="saveAffair">{{ saving ? '保存中…' : '保存时政' }}</button>
        </view>
      </view>

      <view v-if="visibleAffairs.length" class="card-list">
        <view v-for="item in visibleAffairs" :key="item.id" class="card affair-card">
          <view class="affair-head">
            <text class="affair-date">{{ item.event_date }}</text>
            <text class="affair-title">{{ item.title }}</text>
          </view>
          <view v-if="item.related_point" class="muted">关联：{{ item.related_point }}</view>
          <view class="affair-tags">
            <text v-for="tag in splitTags(item.tags)" :key="tag" class="tag tag-indigo">{{ tag }}</text>
            <text v-if="item.deleted_at" class="tag tag-amber">已删除</text>
          </view>
          <view v-if="item.note" class="affair-note">{{ item.note }}</view>
          <view class="k-actions">
            <text v-if="!item.deleted_at" class="k-link" @click="editAffair(item)">编辑</text>
            <text v-if="!item.deleted_at" class="k-link danger" @click="deleteAffair(item)">删除</text>
            <text v-else class="k-link" @click="restoreAffair(item)">恢复</text>
          </view>
        </view>
      </view>
      <view v-else class="card empty">
        <text class="big">{{ affairsDeleted ? '回收站是空的' : '还没有时政素材' }}</text>
        把考前要背的事件按日期记下来。
      </view>
    </view>

    <!-- 分析题框架 -->
    <view v-if="activeTab === 'frameworks'">
      <view class="toolbar">
        <view class="toolbar-filters">
          <picker :range="frameworkTypeNames" :value="frameworkTypeIndex" @change="onFrameworkTypeChange">
            <view class="picker picker-sm"><text>{{ frameworkTypeNames[frameworkTypeIndex] }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
        <text class="muted">{{ frameworks.length }} 条</text>
      </view>
      <view class="toolbar-actions">
        <button class="btn btn-ghost btn-sm" @click="toggleDeleted('frameworks')">{{ frameworksDeleted ? '退出回收站' : '回收站' }}</button>
        <button class="btn btn-soft btn-sm" @click="newFramework">＋ 新建框架</button>
      </view>

      <view v-if="frameworkFormOpen" id="framework-form" class="card form-card">
        <view class="card-head">
          <text class="title">{{ frameworkEditingId ? '编辑框架' : '新建框架' }}</text>
        </view>
        <view class="field-row">
          <view class="field">
            <text class="label">题型</text>
            <picker :range="frameworkTypeOptions" :value="fwTypeIndex" @change="onFwTypeChange">
              <view class="picker"><text>{{ frameworkTypeOptions[fwTypeIndex] }}</text><text class="arrow">▾</text></view>
            </picker>
          </view>
          <view class="field">
            <text class="label">关键词 <text class="hint">逗号分隔</text></text>
            <input class="input" v-model="frameworkForm.keywords" placeholder="原理, 方法论, 结合材料" />
          </view>
        </view>
        <view class="field">
          <text class="label">答题模板</text>
          <textarea class="textarea" v-model="frameworkForm.template" placeholder="① 点明原理…&#10;② 结合材料…&#10;③ 回扣设问…" />
        </view>
        <view class="form-actions">
          <button class="btn btn-ghost" @click="frameworkFormOpen = false">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="saveFramework">{{ saving ? '保存中…' : '保存框架' }}</button>
        </view>
      </view>

      <view v-if="frameworks.length" class="card-list">
        <view v-for="item in frameworks" :key="item.id" class="card framework-card">
          <view class="k-head">
            <text class="tag tag-indigo">{{ item.question_type }}</text>
            <text v-if="item.deleted_at" class="tag tag-amber">已删除</text>
          </view>
          <view class="framework-template">{{ item.template || '（还没有模板）' }}</view>
          <view v-if="item.keywords" class="muted">关键词：{{ item.keywords }}</view>
          <view class="k-actions">
            <text v-if="!item.deleted_at" class="k-link" @click="editFramework(item)">编辑</text>
            <text v-if="!item.deleted_at" class="k-link danger" @click="deleteFramework(item)">删除</text>
            <text v-else class="k-link" @click="restoreFramework(item)">恢复</text>
          </view>
        </view>
      </view>
      <view v-else class="card empty">
        <text class="big">{{ frameworksDeleted ? '回收站是空的' : '还没有分析题框架' }}</text>
        按题型整理答题模板，考前一页一页翻。
      </view>
    </view>

    <!-- 政治选择题错题 -->
    <view v-if="activeTab === 'questions'">
      <view class="toolbar">
        <view class="toolbar-filters">
          <picker :range="bigChapterNames" :value="pqChapterIndex" @change="onPqChapterChange">
            <view class="picker picker-sm"><text class="ellipsis">{{ pqChapterName }}</text><text class="arrow">▾</text></view>
          </picker>
          <picker :range="pqCauseNames" :value="pqCauseIndex" @change="onPqCauseChange">
            <view class="picker picker-sm"><text class="ellipsis">{{ pqCauseNames[pqCauseIndex] }}</text><text class="arrow">▾</text></view>
          </picker>
        </view>
        <text class="muted">{{ pqCount }} 道</text>
      </view>
      <view class="toolbar-actions">
        <input v-model="pqYear" class="input year-input" placeholder="年份，如 2024" />
        <button class="btn btn-ghost btn-sm" @click="toggleDeleted('questions')">{{ pqDeleted ? '退出回收站' : '回收站' }}</button>
        <button class="btn btn-soft btn-sm" @click="goEntry">＋ 录政治题</button>
      </view>

      <view v-if="politicsQuestions.length" class="card-list">
        <view v-for="item in politicsQuestions" :key="item.id" class="card pq-card" @click="openQuestion(item)">
          <view class="q-tags">
            <text class="tag tag-indigo">{{ item.chapter_title }}</text>
            <text class="tag tag-rose">{{ item.cause }}</text>
            <text v-if="item.exam_year" class="tag">{{ item.exam_year }}</text>
            <text v-if="item.deleted_at" class="tag tag-amber">已删除</text>
          </view>
          <view class="q-text">{{ questionPreview(item) }}</view>
          <view v-if="item.option_analysis" class="analysis-mini">陷阱：{{ item.option_analysis }}</view>
          <view class="q-foot">
            <text class="muted">{{ item.created_at }}</text>
            <text class="link" v-if="item.deleted_at" @click.stop="restoreQuestion(item)">恢复</text>
          </view>
        </view>
      </view>
      <view v-else class="card empty">
        <text class="big">{{ pqDeleted ? '回收站是空的' : '还没有政治选择题' }}</text>
        政治只看陷阱清单，不做重做队列。
      </view>
    </view>
  </view>
</template>

<script>
import { api } from '@/api'

const FRAMEWORK_TYPES = ['原理类', '意义类', '措施类', '其他']
const RATING_LABELS = { remembered: '上次：记住了', forgotten: '上次：没记住' }
const SEARCH_TYPES = { card: '知识点', affair: '时政', framework: '框架', question: '错题' }

export default {
  data() {
    return {
      activeTab: 'cards',
      tabs: [
        { label: '知识点卡', value: 'cards' },
        { label: '时政素材', value: 'affairs' },
        { label: '分析题框架', value: 'frameworks' },
        { label: '选择题错题', value: 'questions' }
      ],
      subjects: [],
      politicsSubject: null,
      politicsCauses: [],
      saving: false,

      // 搜索
      searchKeyword: '',
      searchHint: '输入关键词，四类内容一起搜。',
      searchResults: [],

      // 知识点卡
      cards: [],
      cardsDeleted: false,
      revealed: {},
      cardChapterIndex: 0,
      cardSectionIndex: 0,
      cardFormOpen: false,
      cardEditingId: 0,
      cardForm: { title: '', body: '', view_count: 0, self_rating: '' },
      cardFormChapterIndex: 0,
      cardFormSectionIndex: 0,
      ratingNames: ['未自评', '记住了', '没记住'],
      cardFormRatingIndex: 0,

      // 时政
      affairs: [],
      affairsDeleted: false,
      affairFormOpen: false,
      affairEditingId: 0,
      affairForm: { event_date: '', title: '', tags: '', related_point: '', note: '' },
      tagIndex: 0,
      pointIndex: 0,

      // 框架
      frameworks: [],
      frameworksDeleted: false,
      frameworkFormOpen: false,
      frameworkEditingId: 0,
      frameworkForm: { question_type: '原理类', template: '', keywords: '' },
      frameworkTypeOptions: FRAMEWORK_TYPES,
      fwTypeIndex: 0,
      frameworkTypeIndex: 0,

      // 政治选择题
      politicsQuestions: [],
      pqDeleted: false,
      pqChapterIndex: 0,
      pqCauseIndex: 0,
      pqYear: '',
      pqCount: 0,

      loaded: false
    }
  },
  computed: {
    bigChapters() {
      return this.politicsSubject ? this.politicsSubject.chapters : []
    },
    bigChapterNames() {
      return ['全部大块'].concat(this.bigChapters.map((c) => c.title))
    },
    bigChapterName() {
      return this.bigChapterNames[this.cardChapterIndex] || '全部大块'
    },
    cardSections() {
      if (this.cardChapterIndex === 0) return []
      const chapter = this.bigChapters[this.cardChapterIndex - 1]
      return chapter ? chapter.sections : []
    },
    cardSectionNames() {
      return ['全部章'].concat(this.cardSections.map((s) => s.title))
    },
    cardSectionName() {
      return this.cardSectionNames[this.cardSectionIndex] || '全部章'
    },
    formSections() {
      const chapter = this.bigChapters[this.cardFormChapterIndex]
      return chapter ? chapter.sections : []
    },
    formSectionNames() {
      return ['不选章'].concat(this.formSections.map((s) => s.title))
    },
    tagOptions() {
      const tags = []
      this.affairs.forEach((item) => {
        this.splitTags(item.tags).forEach((tag) => {
          if (tags.indexOf(tag) < 0) tags.push(tag)
        })
      })
      return tags
    },
    tagNames() {
      return ['全部标签'].concat(this.tagOptions)
    },
    pointOptions() {
      const points = []
      this.affairs.forEach((item) => {
        const value = (item.related_point || '').trim()
        if (value && points.indexOf(value) < 0) points.push(value)
      })
      return points
    },
    pointNames() {
      return ['全部关联考点'].concat(this.pointOptions)
    },
    visibleAffairs() {
      let items = this.affairs
      if (this.tagIndex > 0) {
        const tag = this.tagOptions[this.tagIndex - 1]
        items = items.filter((item) => this.splitTags(item.tags).indexOf(tag) >= 0)
      }
      if (this.pointIndex > 0) {
        const point = this.pointOptions[this.pointIndex - 1]
        items = items.filter((item) => (item.related_point || '').trim() === point)
      }
      return items
    },
    frameworkTypeNames() {
      return ['全部题型'].concat(FRAMEWORK_TYPES)
    },
    pqCauseNames() {
      return ['全部错因'].concat(this.politicsCauses)
    },
    pqChapterName() {
      return this.bigChapterNames[this.pqChapterIndex] || '全部大块'
    }
  },
  onLoad() {
    api.bootstrap()
      .then((data) => {
        this.subjects = data.subjects || []
        this.politicsCauses = data.politics_causes || []
        this.politicsSubject = this.subjects.find((item) => item.name === '政治') || null
        this.loaded = true
        this.loadCards()
        this.loadAffairs()
        this.loadFrameworks()
        this.loadQuestions()
      })
      .catch((err) => {
        uni.showToast({ title: err.message || '加载失败', icon: 'none' })
      })
  },
  methods: {
    typeLabel(type) {
      return SEARCH_TYPES[type] || type
    },
    typeTag(type) {
      return type === 'question' ? 'tag-rose' : type === 'affair' ? 'tag-teal' : type === 'framework' ? 'tag-amber' : 'tag-indigo'
    },
    ratingLabel(value) {
      return RATING_LABELS[value] || '未自评'
    },
    splitTags(value) {
      return (value || '')
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter((item) => item)
    },
    masked(body) {
      const text = (body || '（没有背面内容）').replace(/\n/g, ' ')
      return text.length > 46 ? text.slice(0, 46) + '…' : text
    },

    // ---------- 搜索 ----------
    doSearch() {
      const keyword = this.searchKeyword.trim()
      if (!keyword) {
        this.searchResults = []
        this.searchHint = '输入关键词，四类内容一起搜。'
        return
      }
      api.politics.search(keyword)
        .then((data) => {
          this.searchResults = data.items || []
          this.searchHint = this.searchResults.length ? '找到 ' + this.searchResults.length + ' 条结果' : '没有找到匹配的内容'
        })
        .catch((err) => {
          this.searchResults = []
          this.searchHint = err.message || '搜索失败'
        })
    },
    clearSearch() {
      this.searchKeyword = ''
      this.searchResults = []
      this.searchHint = '输入关键词，四类内容一起搜。'
    },
    openResult(item) {
      if (item.type === 'question') {
        uni.navigateTo({ url: '/pages/detail/detail?id=' + item.id })
        return
      }
      if (item.type === 'card') {
        this.focusCard(item)
        return
      }
      if (item.type === 'affair') {
        this.activeTab = 'affairs'
        this.loadAffairs().then(() => {
          const target = this.affairs.find((row) => row.id === item.id)
          if (target) this.editAffair(target)
        })
        return
      }
      this.activeTab = 'frameworks'
      this.loadFrameworks().then(() => {
        const target = this.frameworks.find((row) => row.id === item.id)
        if (target) this.editFramework(target)
      })
    },
    focusCard(item) {
      this.activeTab = 'cards'
      this.cardChapterIndex = 0
      this.cardSectionIndex = 0
      this.revealed = Object.assign({}, this.revealed, { [item.id]: true })
      this.loadCards().then(() => {
        this.$nextTick(() => {
          uni.pageScrollTo({ selector: '#card-' + item.id, duration: 220 })
        })
      })
    },

    // ---------- 知识点卡 ----------
    loadCards() {
      const params = {}
      if (this.cardChapterIndex > 0) {
        const chapter = this.bigChapters[this.cardChapterIndex - 1]
        if (chapter) params.chapter_id = chapter.id
      }
      if (this.cardSectionIndex > 0) {
        const section = this.cardSections[this.cardSectionIndex - 1]
        if (section) params.section_id = section.id
      }
      if (this.cardsDeleted) params.include_deleted = true
      return api.politics.cards.list(params)
        .then((data) => {
          this.cards = data.items || []
        })
        .catch((err) => {
          uni.showToast({ title: err.message || '卡片加载失败', icon: 'none' })
        })
    },
    onCardChapterChange(e) {
      this.cardChapterIndex = Number(e.detail.value)
      this.cardSectionIndex = 0
      this.loadCards()
    },
    onCardSectionChange(e) {
      this.cardSectionIndex = Number(e.detail.value)
      this.loadCards()
    },
    reveal(card) {
      if (this.revealed[card.id]) return
      this.revealed = Object.assign({}, this.revealed, { [card.id]: true })
      this.trackView(card, null)
    },
    trackView(card, rating) {
      api.politics.cards.view(card.id, rating)
        .then((updated) => {
          const idx = this.cards.findIndex((row) => row.id === card.id)
          if (idx >= 0) this.cards.splice(idx, 1, Object.assign({}, this.cards[idx], updated))
        })
        .catch(() => {})
    },
    rate(card, rating) {
      this.revealed = Object.assign({}, this.revealed, { [card.id]: true })
      api.politics.cards.view(card.id, rating)
        .then((updated) => {
          const idx = this.cards.findIndex((row) => row.id === card.id)
          if (idx >= 0) this.cards.splice(idx, 1, Object.assign({}, this.cards[idx], updated))
          uni.showToast({ title: rating === 'remembered' ? '记住了' : '没记住', icon: 'none' })
        })
        .catch((err) => {
          uni.showToast({ title: err.message || '记录失败', icon: 'none' })
        })
    },
    newCard() {
      this.cardEditingId = 0
      this.cardFormOpen = true
      this.cardForm = { title: '', body: '', view_count: 0, self_rating: '' }
      this.cardFormChapterIndex = 0
      this.cardFormSectionIndex = 0
      this.cardFormRatingIndex = 0
    },
    editCard(card) {
      this.cardEditingId = card.id
      this.cardFormOpen = true
      this.cardForm = {
        title: card.title,
        body: card.body,
        view_count: card.view_count,
        self_rating: card.self_rating || ''
      }
      const idx = this.bigChapters.findIndex((c) => c.id === card.chapter_id)
      this.cardFormChapterIndex = idx >= 0 ? idx : 0
      const sectionIdx = this.formSections.findIndex((s) => s.id === card.section_id)
      this.cardFormSectionIndex = sectionIdx >= 0 ? sectionIdx + 1 : 0
      this.cardFormRatingIndex = card.self_rating === 'remembered' ? 1 : card.self_rating === 'forgotten' ? 2 : 0
      uni.pageScrollTo({ selector: '#card-form', duration: 200 })
    },
    onFormChapterChange(e) {
      this.cardFormChapterIndex = Number(e.detail.value)
      this.cardFormSectionIndex = 0
    },
    onFormSectionChange(e) {
      this.cardFormSectionIndex = Number(e.detail.value)
    },
    onFormRatingChange(e) {
      this.cardFormRatingIndex = Number(e.detail.value)
    },
    saveCard() {
      if (!this.cardForm.title.trim()) {
        uni.showToast({ title: '请填写考点名', icon: 'none' })
        return
      }
      const chapter = this.bigChapters[this.cardFormChapterIndex]
      if (!chapter) {
        uni.showToast({ title: '请选择大块', icon: 'none' })
        return
      }
      const section = this.cardFormSectionIndex > 0 ? this.formSections[this.cardFormSectionIndex - 1] : null
      const payload = {
        chapter_id: chapter.id,
        section_id: section ? section.id : null,
        title: this.cardForm.title.trim(),
        body: this.cardForm.body
      }
      if (this.cardEditingId) {
        payload.view_count = Math.max(0, Number(this.cardForm.view_count) || 0)
        payload.self_rating = this.cardFormRatingIndex === 1 ? 'remembered' : this.cardFormRatingIndex === 2 ? 'forgotten' : ''
      }
      this.saving = true
      const action = this.cardEditingId
        ? api.politics.cards.update(this.cardEditingId, payload)
        : api.politics.cards.create(payload)
      action
        .then(() => {
          this.saving = false
          this.cardFormOpen = false
          uni.showToast({ title: '已保存', icon: 'success' })
          this.loadCards()
        })
        .catch((err) => {
          this.saving = false
          uni.showToast({ title: err.message || '保存失败', icon: 'none' })
        })
    },
    deleteCard(card) {
      uni.showModal({
        title: '删除卡片',
        content: '删除后可在回收站恢复。',
        confirmText: '删除',
        confirmColor: '#e11d48',
        success: (res) => {
          if (!res.confirm) return
          api.politics.cards.remove(card.id)
            .then(() => {
              uni.showToast({ title: '已移入回收站', icon: 'none' })
              this.loadCards()
            })
            .catch((err) => uni.showToast({ title: err.message || '删除失败', icon: 'none' }))
        }
      })
    },
    restoreCard(card) {
      api.politics.cards.restore(card.id)
        .then(() => {
          uni.showToast({ title: '已恢复', icon: 'success' })
          this.loadCards()
        })
        .catch((err) => uni.showToast({ title: err.message || '恢复失败', icon: 'none' }))
    },

    // ---------- 时政 ----------
    loadAffairs() {
      const params = {}
      if (this.affairsDeleted) params.include_deleted = true
      return api.politics.affairs.list(params)
        .then((data) => {
          this.affairs = data.items || []
          this.tagIndex = 0
          this.pointIndex = 0
        })
        .catch((err) => {
          uni.showToast({ title: err.message || '时政加载失败', icon: 'none' })
        })
    },
    onTagChange(e) {
      this.tagIndex = Number(e.detail.value)
    },
    onPointChange(e) {
      this.pointIndex = Number(e.detail.value)
    },
    newAffair() {
      this.affairEditingId = 0
      this.affairFormOpen = true
      const now = new Date()
      const stamp = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
      this.affairForm = { event_date: stamp, title: '', tags: '', related_point: '', note: '' }
    },
    editAffair(item) {
      this.affairEditingId = item.id
      this.affairFormOpen = true
      this.affairForm = {
        event_date: item.event_date,
        title: item.title,
        tags: item.tags,
        related_point: item.related_point,
        note: item.note
      }
      uni.pageScrollTo({ selector: '#affair-form', duration: 200 })
    },
    onAffairDate(e) {
      this.affairForm.event_date = e.detail.value
    },
    saveAffair() {
      if (!this.affairForm.event_date) {
        uni.showToast({ title: '请选择日期', icon: 'none' })
        return
      }
      if (!this.affairForm.title.trim()) {
        uni.showToast({ title: '请填写事件', icon: 'none' })
        return
      }
      const payload = {
        event_date: this.affairForm.event_date,
        title: this.affairForm.title.trim(),
        tags: this.affairForm.tags,
        related_point: this.affairForm.related_point,
        note: this.affairForm.note
      }
      this.saving = true
      const action = this.affairEditingId
        ? api.politics.affairs.update(this.affairEditingId, payload)
        : api.politics.affairs.create(payload)
      action
        .then(() => {
          this.saving = false
          this.affairFormOpen = false
          uni.showToast({ title: '已保存', icon: 'success' })
          this.loadAffairs()
        })
        .catch((err) => {
          this.saving = false
          uni.showToast({ title: err.message || '保存失败', icon: 'none' })
        })
    },
    deleteAffair(item) {
      uni.showModal({
        title: '删除时政',
        content: '删除后可在回收站恢复。',
        confirmText: '删除',
        confirmColor: '#e11d48',
        success: (res) => {
          if (!res.confirm) return
          api.politics.affairs.remove(item.id)
            .then(() => {
              uni.showToast({ title: '已移入回收站', icon: 'none' })
              this.loadAffairs()
            })
            .catch((err) => uni.showToast({ title: err.message || '删除失败', icon: 'none' }))
        }
      })
    },
    restoreAffair(item) {
      api.politics.affairs.restore(item.id)
        .then(() => {
          uni.showToast({ title: '已恢复', icon: 'success' })
          this.loadAffairs()
        })
        .catch((err) => uni.showToast({ title: err.message || '恢复失败', icon: 'none' }))
    },

    // ---------- 分析题框架 ----------
    loadFrameworks() {
      const params = {}
      if (this.frameworkTypeIndex > 0) params.question_type = FRAMEWORK_TYPES[this.frameworkTypeIndex - 1]
      if (this.frameworksDeleted) params.include_deleted = true
      return api.politics.frameworks.list(params)
        .then((data) => {
          this.frameworks = data.items || []
        })
        .catch((err) => {
          uni.showToast({ title: err.message || '框架加载失败', icon: 'none' })
        })
    },
    onFrameworkTypeChange(e) {
      this.frameworkTypeIndex = Number(e.detail.value)
      this.loadFrameworks()
    },
    newFramework() {
      this.frameworkEditingId = 0
      this.frameworkFormOpen = true
      this.frameworkForm = { question_type: '原理类', template: '', keywords: '' }
      this.fwTypeIndex = 0
    },
    editFramework(item) {
      this.frameworkEditingId = item.id
      this.frameworkFormOpen = true
      this.frameworkForm = {
        question_type: item.question_type,
        template: item.template,
        keywords: item.keywords
      }
      const idx = FRAMEWORK_TYPES.indexOf(item.question_type)
      this.fwTypeIndex = idx >= 0 ? idx : 0
      uni.pageScrollTo({ selector: '#framework-form', duration: 200 })
    },
    onFwTypeChange(e) {
      this.fwTypeIndex = Number(e.detail.value)
    },
    saveFramework() {
      const payload = {
        question_type: FRAMEWORK_TYPES[this.fwTypeIndex],
        template: this.frameworkForm.template,
        keywords: this.frameworkForm.keywords
      }
      this.saving = true
      const action = this.frameworkEditingId
        ? api.politics.frameworks.update(this.frameworkEditingId, payload)
        : api.politics.frameworks.create(payload)
      action
        .then(() => {
          this.saving = false
          this.frameworkFormOpen = false
          uni.showToast({ title: '已保存', icon: 'success' })
          this.loadFrameworks()
        })
        .catch((err) => {
          this.saving = false
          uni.showToast({ title: err.message || '保存失败', icon: 'none' })
        })
    },
    deleteFramework(item) {
      uni.showModal({
        title: '删除框架',
        content: '删除后可在回收站恢复。',
        confirmText: '删除',
        confirmColor: '#e11d48',
        success: (res) => {
          if (!res.confirm) return
          api.politics.frameworks.remove(item.id)
            .then(() => {
              uni.showToast({ title: '已移入回收站', icon: 'none' })
              this.loadFrameworks()
            })
            .catch((err) => uni.showToast({ title: err.message || '删除失败', icon: 'none' }))
        }
      })
    },
    restoreFramework(item) {
      api.politics.frameworks.restore(item.id)
        .then(() => {
          uni.showToast({ title: '已恢复', icon: 'success' })
          this.loadFrameworks()
        })
        .catch((err) => uni.showToast({ title: err.message || '恢复失败', icon: 'none' }))
    },

    // ---------- 政治选择题 ----------
    loadQuestions() {
      const params = { qtype: 'politics_choice', limit: 200 }
      if (this.pqDeleted) params.include_deleted = true
      if (this.pqChapterIndex > 0) {
        const chapter = this.bigChapters[this.pqChapterIndex - 1]
        if (chapter) params.chapter_id = chapter.id
      }
      if (this.pqCauseIndex > 0) params.cause = this.politicsCauses[this.pqCauseIndex - 1]
      return api.questions.list(params)
        .then((data) => {
          let items = data.items || []
          const year = this.pqYear.trim()
          if (year) items = items.filter((item) => (item.exam_year || '').indexOf(year) >= 0)
          this.politicsQuestions = items
          this.pqCount = items.length
        })
        .catch((err) => {
          uni.showToast({ title: err.message || '政治错题加载失败', icon: 'none' })
        })
    },
    onPqChapterChange(e) {
      this.pqChapterIndex = Number(e.detail.value)
      this.loadQuestions()
    },
    onPqCauseChange(e) {
      this.pqCauseIndex = Number(e.detail.value)
      this.loadQuestions()
    },
    questionPreview(item) {
      const text = (item.content || '').trim()
      return text ? (text.length > 80 ? text.slice(0, 80) + '…' : text) : '（图片题，点开看原图）'
    },
    openQuestion(item) {
      uni.navigateTo({ url: '/pages/detail/detail?id=' + item.id })
    },
    restoreQuestion(item) {
      api.questions.restore(item.id)
        .then(() => {
          uni.showToast({ title: '已恢复', icon: 'success' })
          this.loadQuestions()
        })
        .catch((err) => uni.showToast({ title: err.message || '恢复失败', icon: 'none' }))
    },

    // ---------- 通用 ----------
    toggleDeleted(panel) {
      if (panel === 'cards') {
        this.cardsDeleted = !this.cardsDeleted
        this.loadCards()
      } else if (panel === 'affairs') {
        this.affairsDeleted = !this.affairsDeleted
        this.loadAffairs()
      } else if (panel === 'frameworks') {
        this.frameworksDeleted = !this.frameworksDeleted
        this.loadFrameworks()
      } else {
        this.pqDeleted = !this.pqDeleted
        this.loadQuestions()
      }
    },
    goEntry() {
      uni.switchTab({ url: '/pages/entry/entry' })
    }
  }
}
</script>

<style>
.page-head { margin-bottom: 16px; }
.search-card { padding: 14px; }
.search-box {
  display: flex; align-items: center; gap: 8px;
  height: 42px; padding: 0 12px;
  border: 1px solid #e8e7e1; border-radius: 12px; background: #fbfbf9;
}
.search-icon { color: #a7a9b0; font-size: 16px; }
.search-input { flex: 1; height: 40px; font-size: 13px; }
.clear-btn { color: #a7a9b0; font-size: 18px; padding: 0 4px; }
.search-results { margin-top: 10px; }
.search-item { padding: 10px 0; border-top: 1px dashed #e8e7e1; }
.search-item-head { display: flex; align-items: center; gap: 8px; }
.search-title { flex: 1; font-size: 13px; font-weight: 600; }
.search-snippet { margin-top: 4px; font-size: 12px; color: #4b4d55; line-height: 1.55; }

.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.toolbar-filters { display: flex; gap: 8px; flex: 1; min-width: 0; }
.picker-sm { height: 34px; min-height: 34px; padding: 0 10px; font-size: 12px; border-radius: 10px; }
.picker-sm .arrow { margin-left: 4px; }
.toolbar-actions { display: flex; align-items: center; gap: 8px; margin: 8px 0 12px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 108px; }
.form-card { margin-bottom: 12px; }
.form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 6px; }
.form-actions .btn { min-width: 96px; }
.card-list { display: flex; flex-direction: column; gap: 10px; }

.k-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.k-title { flex: 1; font-size: 15px; font-weight: 700; }
.k-meta { margin-top: 4px; font-size: 11px; color: #85878f; }
.k-hidden { position: relative; margin-top: 10px; padding: 14px 12px; border-radius: 12px; background: #f7f7f3; overflow: hidden; }
.k-hidden-text { position: relative; z-index: 2; font-size: 12px; color: #4338ca; font-weight: 600; }
.k-blur {
  display: block; margin-top: 6px; font-size: 12px; color: #6b7280;
  filter: blur(4px); opacity: 0.55; white-space: nowrap; overflow: hidden;
}
.k-body { margin-top: 10px; font-size: 13px; line-height: 1.65; white-space: pre-wrap; color: #1b1c1f; }
.k-actions { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #e8e7e1; }
.k-link { font-size: 12px; font-weight: 600; color: #4338ca; }
.k-link.danger { color: #e11d48; }

.affair-card .affair-head { display: flex; gap: 8px; align-items: baseline; }
.affair-date { font-size: 11px; color: #a7a9b0; flex: none; }
.affair-title { font-size: 14px; font-weight: 600; }
.affair-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.affair-note { margin-top: 8px; font-size: 12px; color: #4b4d55; line-height: 1.6; white-space: pre-wrap; }

.framework-template { margin-top: 8px; font-size: 13px; line-height: 1.65; white-space: pre-wrap; }

.q-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.q-text { margin-top: 8px; font-size: 13px; line-height: 1.55; }
.analysis-mini { margin-top: 6px; font-size: 11px; color: #b45309; background: #fffbeb; padding: 6px 8px; border-radius: 8px; line-height: 1.5; }
.q-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.link { font-size: 12px; color: #4338ca; font-weight: 600; }
.year-input { max-width: 130px; height: 34px; min-height: 34px; font-size: 12px; }
</style>
