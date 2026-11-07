(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const LAST_ENTRY_KEY = 'assistant.lastEntry';

  const SUBJECT_COLORS = {
    '数据结构': { fg: '#4338ca', bg: '#eef0ff' },
    '计算机组成原理': { fg: '#0369a1', bg: '#e0f2fe' },
    '操作系统': { fg: '#0f766e', bg: '#e7f8f4' },
    '计算机网络': { fg: '#b45309', bg: '#fff7e6' },
    '数学二': { fg: '#be123c', bg: '#fff1f3' },
    '英语二': { fg: '#6d28d9', bg: '#f3edff' },
    '政治': { fg: '#9a3412', bg: '#fff2e6' },
  };

  const ICONS = {
    doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h5M9 13h6M9 17h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    empty: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  };

  const state = {
    catalog: null,
    subjects: [],
    chapterIndex: new Map(),
    sectionIndex: new Map(),
    causes: [],
    politicsCauses: [],
    view: 'overview',
    politicsTab: 'cards',
    politics: {
      cards: [],
      affairs: [],
      frameworks: [],
      questions: [],
      searchToken: 0,
      cardEditing: null,
      affairEditing: null,
      frameworkEditing: null,
      showDeleted: { cards: false, affairs: false, frameworks: false, questions: false },
    },
    entryCause: null,
    entryImage: null,
    entryPreviewUrl: null,
    entryImagePath: '',
    entryOcrRaw: '',
    entryOcrText: '',
    entryOcrToken: 0,
    entryCount: 0,
    overview: null,
    mastery: null,
    listLoaded: false,
    listToken: 0,
    listStatus: '',
    detail: null,
    detailCause: null,
    chart: null,
    review: {
      items: [],
      index: 0,
      shown: false,
      mastered: 0,
      wrong: 0,
      active: false,
      busy: false,
    },
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setTodayLabel();
    bindGlobal();
    try {
      const catalog = await api('/api/bootstrap');
      initCatalog(catalog);
      initEntry();
      initList();
      initReview();
      initDetail();
      initPolitics();
      initChart();
      await refreshOverview();
    } catch (error) {
      toast(`加载失败：${error.message}`, 'error');
    }
  }

  /* ---------------- 基础工具 ---------------- */

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  async function api(path, options = {}) {
    const response = await fetch(path, options);
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      let detail = data && data.detail;
      if (Array.isArray(detail)) detail = detail.map((item) => item.msg).join('；');
      throw new Error(detail || `请求失败（${response.status}）`);
    }
    return data;
  }

  let toastTimer = null;
  function toast(message, type = 'ok') {
    const el = $('#toast');
    $('#toastText').textContent = message;
    $('#toastMark').textContent = type === 'error' ? '!' : '✓';
    el.classList.toggle('is-error', type === 'error');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, type === 'error' ? 3600 : 2400);
  }

  function setTodayLabel() {
    const now = new Date();
    $('#todayLabel').textContent = now.toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  }

  function fmtShort(timestamp) {
    if (!timestamp) return '—';
    return String(timestamp).slice(5, 16);
  }

  function fmtFull(timestamp) {
    if (!timestamp) return '—';
    return String(timestamp).slice(0, 16);
  }

  function subjectColor(name) {
    return SUBJECT_COLORS[name] || { fg: '#4b4d55', bg: '#f1f2f6' };
  }

  function subjectPill(name, className = 'subject-tag') {
    const color = subjectColor(name);
    return `<span class="${className}" style="color:${color.fg};background:${color.bg}">${esc(name)}</span>`;
  }

  function statusPill(status) {
    if (status === 'mastered') {
      return '<span class="status-pill status-mastered">已掌握</span>';
    }
    return '<span class="status-pill status-wrong">未掌握</span>';
  }

  function renderCauses(container, selected, causes = state.causes) {
    container.innerHTML = causes.map((cause) => (
      `<button type="button" class="chip${cause === selected ? ' is-active' : ''}" data-cause="${esc(cause)}">${esc(cause)}</button>`
    )).join('');
  }

  function bindCauseGroup(container, onPick) {
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cause]');
      if (!button) return;
      $$('.chip', container).forEach((chip) => chip.classList.remove('is-active'));
      button.classList.add('is-active');
      onPick(button.dataset.cause);
    });
  }

  function getSubject(name) {
    return state.subjects.find((subject) => subject.name === name) || null;
  }

  function getChapter(chapterId) {
    return state.chapterIndex.get(Number(chapterId)) || null;
  }

  function getSection(sectionId) {
    return state.sectionIndex.get(Number(sectionId)) || null;
  }

  function initCatalog(catalog) {
    state.catalog = catalog;
    state.subjects = catalog.subjects || [];
    state.causes = catalog.causes || [];
    state.politicsCauses = catalog.politics_causes || [];
    state.subjects.forEach((subject) => {
      subject.chapters.forEach((chapter) => {
        state.chapterIndex.set(chapter.id, { ...chapter, subject: subject.name });
        (chapter.sections || []).forEach((section) => {
          state.sectionIndex.set(section.id, { ...section, chapterId: chapter.id, subject: subject.name });
        });
      });
    });
  }

  /* ---------------- 导航 ---------------- */

  function bindGlobal() {
    document.addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) {
        event.preventDefault();
        setView(viewButton.dataset.view);
        return;
      }
      const closeButton = event.target.closest('[data-close]');
      if (closeButton) closeDetail();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('#detailModal').hidden) closeDetail();
    });
  }

  function setView(name) {
    if (!['overview', 'entry', 'list', 'review', 'mastery', 'politics'].includes(name)) return;
    state.view = name;
    $$('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.view === name));
    $$('.view').forEach((view) => view.classList.toggle('is-active', view.id === `view-${name}`));
    if (name === 'overview') {
      refreshOverview();
      requestAnimationFrame(() => state.chart && state.chart.resize());
    } else if (name === 'list') {
      refreshList();
    } else if (name === 'mastery') {
      refreshMastery();
    } else if (name === 'politics') {
      refreshPolitics();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 概览 ---------------- */

  async function refreshOverview() {
    try {
      state.overview = await api('/api/overview');
      renderOverview(state.overview);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderOverview(data) {
    $('#statToday').textContent = data.today_new;
    $('#statWrong').textContent = data.wrong;
    $('#statTotal').textContent = data.total;
    $('#statMastered').textContent = data.mastered;
    $('#priorityNote').textContent = data.total ? '按缺口分值从高到低' : '';
    renderPriority(data.priority || []);
    renderHeatmap(data.heatmap || { subjects: [], max_chapters: 0, cells: [] });
  }

  function renderPriority(items) {
    const container = $('#priorityList');
    if (!items.length) {
      container.innerHTML = `
        <div class="empty-priority">
          <span class="empty-icon">${ICONS.empty}</span>
          <div>
            <strong>还没有可诊断的章节</strong>
            <p>先录几道错题，首页会自动找出最该补的三章。</p>
          </div>
          <button type="button" class="btn btn-soft" data-view="entry">去录题</button>
        </div>`;
      return;
    }
    container.innerHTML = items.map((item, index) => {
      const rate = item.error_rate === null ? 0 : Math.round(item.error_rate * 100);
      const color = subjectColor(item.subject);
      return `
        <article class="priority-card${index === 0 ? ' rank-1' : ''}" data-subject="${esc(item.subject)}" data-chapter="${item.chapter_id}" tabindex="0" role="button">
          <div class="pri-top">
            <span class="pri-rank">0${index + 1}</span>
            <span class="pri-subject" style="color:${color.fg};background:${color.bg}">${esc(item.subject)}</span>
          </div>
          <h3>${esc(item.chapter)}</h3>
          <p class="pri-sub">权重 ${item.weight} · ${item.wrong} 道未掌握</p>
          <div class="pri-footer">
            <span>缺口 <b>${Number(item.gap_score).toFixed(1)}</b> 分</span>
            <span class="pri-rate">错误率 ${rate}%</span>
          </div>
          <div class="pri-bar"><i style="width:${Math.min(100, rate)}%"></i></div>
        </article>`;
    }).join('') + (items.length < 3 ? `
      <button type="button" class="priority-ghost" data-view="entry">
        <span class="ghost-plus" aria-hidden="true">+</span>
        <span class="ghost-copy">
          <strong>继续录入错题</strong>
          <span>再录一道，诊断会更准</span>
        </span>
      </button>` : '');
  }

  function initChart() {
    if (!window.echarts) {
      $('#heatmapChart').innerHTML = '<div class="chart-fallback">图表库未加载，请检查 static/vendor/echarts.min.js</div>';
      return;
    }
    state.chart = window.echarts.init($('#heatmapChart'), null, { renderer: 'canvas' });
    window.addEventListener('resize', debounce(() => {
      if (state.chart) state.chart.resize();
    }, 120));
  }

  function renderHeatmap(heatmap) {
    if (!state.chart) return;
    const columnCount = Math.max(1, heatmap.max_chapters || 1);
    const columns = Array.from({ length: columnCount }, (_, index) => String(index + 1));
    const cells = (heatmap.cells || []).map((cell) => {
      if (!cell.value || cell.value[2] < 0) {
        return { ...cell, itemStyle: { color: '#f1f1ee' } };
      }
      return cell;
    });

    state.chart.setOption({
      animationDuration: 500,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(27,28,31,0.94)',
        borderWidth: 0,
        padding: [9, 12],
        textStyle: { color: '#fff', fontSize: 12, fontFamily: 'inherit' },
        extraCssText: 'border-radius:10px;box-shadow:0 12px 30px -10px rgba(0,0,0,.4);',
        formatter: (params) => {
          const item = params.data || {};
          const value = item.value ? item.value[2] : -1;
          const title = `${esc(item.subject || '')}<br><b>${esc(item.chapter || '')}</b>`;
          if (value < 0) {
            return `<div style="line-height:1.7">${title}<br><span style="color:#b9bac2">暂无错题记录</span></div>`;
          }
          return `<div style="line-height:1.7">${title}<br>掌握度 <b>${value}%</b><br><span style="color:#b9bac2">错题 ${item.wrong} / ${item.total} 道</span></div>`;
        },
      },
      grid: { left: 98, right: 14, top: 10, bottom: 30 },
      xAxis: {
        type: 'category',
        data: columns,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#a7a9b0', fontSize: 10.5, interval: 0 },
      },
      yAxis: {
        type: 'category',
        data: heatmap.subjects || [],
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#4b4d55', fontSize: 11.5, fontWeight: 500, margin: 12 },
      },
      visualMap: {
        min: 0,
        max: 100,
        show: false,
        inRange: { color: ['#fecdd3', '#fde68a', '#ccfbf1', '#5eead4', '#0f766e'] },
        outOfRange: { color: '#f1f1ee' },
      },
      series: [{
        type: 'heatmap',
        data: cells,
        itemStyle: { borderColor: '#fff', borderWidth: 4, borderRadius: 8 },
        label: {
          show: true,
          fontSize: 10.5,
          color: '#3f3f46',
          backgroundColor: 'rgba(255,255,255,0.72)',
          padding: [2, 4],
          borderRadius: 4,
          formatter: (params) => (params.value[2] < 0 ? '' : `${params.value[2]}%`),
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 12,
            shadowColor: 'rgba(24,24,40,0.2)',
          },
        },
      }],
    }, true);
  }

  /* ---------------- 录题 ---------------- */

  function initEntry() {
    const subjectSelect = $('#entrySubject');
    const chapterSelect = $('#entryChapter');
    const sectionSelect = $('#entrySection');
    subjectSelect.innerHTML = state.subjects.map((subject) => (
      `<option value="${esc(subject.name)}">${esc(subject.name)}</option>`
    )).join('');

    bindCauseGroup($('#entryCauses'), (cause) => {
      state.entryCause = cause;
    });

    restoreEntrySelection();
    applyEntryMode();

    subjectSelect.addEventListener('change', () => {
      setEntrySelection(subjectSelect.value, null, null, true);
      applyEntryMode();
    });
    chapterSelect.addEventListener('change', () => {
      populateEntrySections(Number(chapterSelect.value), null);
      saveLastEntry();
    });
    sectionSelect.addEventListener('change', saveLastEntry);

    bindImageUpload();
    $('#entryForm').addEventListener('submit', submitEntry);
  }

  function restoreEntrySelection() {
    const saved = readLastEntry();
    const savedSubject = saved && getSubject(saved.subject);
    const subjectName = savedSubject ? saved.subject : state.subjects[0].name;
    const subject = getSubject(subjectName);
    const chapter = subject.chapters.find((item) => item.id === saved?.chapterId) || subject.chapters[0];
    setEntrySelection(subjectName, chapter.id, saved?.sectionId, false);
  }

  function applyEntryMode() {
    const isPolitics = $('#entrySubject').value === '政治';
    $('#politicsFields').hidden = !isPolitics;
    state.entryCause = null;
    renderCauses($('#entryCauses'), null, isPolitics ? state.politicsCauses : state.causes);
  }

  function setEntrySelection(subjectName, chapterId, sectionId, persist) {
    const subject = getSubject(subjectName);
    if (!subject) return;
    $('#entrySubject').value = subjectName;
    populateEntryChapters(subject, chapterId);
    populateEntrySections(Number($('#entryChapter').value), sectionId);
    if (persist) saveLastEntry();
  }

  function populateEntryChapters(subject, selectedId) {
    const select = $('#entryChapter');
    select.innerHTML = subject.chapters.map((chapter) => (
      `<option value="${chapter.id}">${esc(chapter.title)}</option>`
    )).join('');
    if (selectedId && subject.chapters.some((chapter) => chapter.id === selectedId)) {
      select.value = String(selectedId);
    }
  }

  function populateEntrySections(chapterId, selectedId) {
    const select = $('#entrySection');
    const chapter = getChapter(chapterId);
    const sections = (chapter && chapter.sections) || [];
    if (!sections.length) {
      select.innerHTML = '<option value="">该章无小节</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = '<option value="">不选小节（可选）</option>' + sections.map((section) => (
      `<option value="${section.id}">${esc(section.title)}</option>`
    )).join('');
    if (selectedId && sections.some((section) => section.id === selectedId)) {
      select.value = String(selectedId);
    }
  }

  function readLastEntry() {
    try {
      const raw = localStorage.getItem(LAST_ENTRY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveLastEntry() {
    try {
      const chapterValue = $('#entryChapter').value;
      const sectionValue = $('#entrySection').value;
      localStorage.setItem(LAST_ENTRY_KEY, JSON.stringify({
        subject: $('#entrySubject').value,
        chapterId: chapterValue ? Number(chapterValue) : null,
        sectionId: sectionValue ? Number(sectionValue) : null,
      }));
    } catch {
      /* localStorage 不可用时静默降级 */
    }
  }

  function bindImageUpload() {
    const dropzone = $('#dropzone');
    const input = $('#imageInput');

    input.addEventListener('change', () => {
      if (input.files && input.files[0]) setEntryImage(input.files[0]);
    });
    ['dragenter', 'dragover'].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.remove('is-dragover');
      });
    });
    dropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) setEntryImage(file);
    });
    $('#imageRemove').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearEntryImage();
    });
  }

  function setEntryImage(file) {
    if (!file.type || !file.type.startsWith('image/')) {
      toast('请选择图片文件', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast('图片超过 15MB，请压缩后再上传', 'error');
      return;
    }
    if (state.entryPreviewUrl) URL.revokeObjectURL(state.entryPreviewUrl);
    state.entryImage = file;
    state.entryImagePath = '';
    state.entryOcrRaw = '';
    state.entryOcrText = '';
    state.entryPreviewUrl = URL.createObjectURL(file);
    $('#imagePreview').src = state.entryPreviewUrl;
    $('#imagePreview').hidden = false;
    $('#dropEmpty').hidden = true;
    $('#imageRemove').hidden = false;
    $('#dropzone').classList.add('has-image');
    runOcr(file);
  }

  async function runOcr(file) {
    const token = ++state.entryOcrToken;
    setOcrStatus('busy', '正在识别印刷体文字…');
    setSaveBusy(true, '识别中…');

    const body = new FormData();
    body.append('image', file, file.name);

    try {
      const result = await api('/api/ocr', { method: 'POST', body });
      if (token !== state.entryOcrToken) return;

      state.entryImagePath = result.image_path || '';
      state.entryOcrRaw = result.text || '';
      const textarea = $('#entryContent');
      const current = textarea.value.trim();
      if (!current || current === state.entryOcrText) {
        textarea.value = result.text || '';
      }
      state.entryOcrText = result.text || '';

      if (result.error) {
        setOcrStatus('failed', `${result.error}，可直接手填或只存图片`);
      } else if (result.text) {
        setOcrStatus('done', `已识别 ${result.text.length} 字 · ${(result.elapsed_ms / 1000).toFixed(1)} 秒，可修改`);
      } else {
        setOcrStatus('failed', '没有识别到文字，可直接手填或只存图片');
      }
    } catch (error) {
      if (token !== state.entryOcrToken) return;
      setOcrStatus('failed', `识别服务不可用（${error.message}），可直接手填或只存图片`);
    } finally {
      if (token === state.entryOcrToken) setSaveBusy(false);
    }
  }

  function setOcrStatus(kind, message) {
    const el = $('#ocrStatus');
    if (!kind) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'ocr-status';
      return;
    }
    el.hidden = false;
    el.className = `ocr-status is-${kind}`;
    el.textContent = message;
  }

  function setSaveBusy(busy, label = '保存并继续') {
    const button = $('#saveBtn');
    button.disabled = busy;
    button.textContent = busy ? label : '保存并继续';
  }

  function updateRoundBadge() {
    const badge = $('#roundCount');
    badge.hidden = state.entryCount === 0;
    badge.textContent = `本轮已录 ${state.entryCount} 道`;
  }

  function clearEntryImage() {
    state.entryOcrToken += 1;
    if (state.entryPreviewUrl) URL.revokeObjectURL(state.entryPreviewUrl);
    state.entryPreviewUrl = null;
    state.entryImage = null;
    state.entryImagePath = '';
    state.entryOcrRaw = '';
    state.entryOcrText = '';
    $('#imageInput').value = '';
    $('#imagePreview').hidden = true;
    $('#imagePreview').removeAttribute('src');
    $('#dropEmpty').hidden = false;
    $('#imageRemove').hidden = true;
    $('#dropzone').classList.remove('has-image');
    setOcrStatus(null);
    setSaveBusy(false);
  }

  async function submitEntry(event) {
    event.preventDefault();
    const content = $('#entryContent').value.trim();
    const isPolitics = $('#entrySubject').value === '政治';
    const optionAnalysis = $('#entryOptionAnalysis').value.trim();
    if (!state.entryCause) {
      toast('先选一个错因标签', 'error');
      return;
    }
    if (isPolitics && !optionAnalysis) {
      toast('政治选择题要填一句错选项分析', 'error');
      return;
    }
    if (!content && !state.entryImage && !state.entryImagePath) {
      toast('填写题目文字或上传照片', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('subject', $('#entrySubject').value);
    formData.append('chapter_id', $('#entryChapter').value);
    if ($('#entrySection').value) formData.append('section_id', $('#entrySection').value);
    formData.append('cause', state.entryCause);
    formData.append('content', content);
    formData.append('qtype', isPolitics ? 'politics_choice' : 'regular');
    if (isPolitics) {
      formData.append('option_analysis', optionAnalysis);
      formData.append('exam_year', $('#entryExamYear').value.trim());
    }
    if (state.entryOcrRaw) formData.append('ocr_raw', state.entryOcrRaw);
    formData.append('source', $('#entrySource').value.trim());
    formData.append('my_answer', $('#entryMyAnswer').value.trim());
    formData.append('correct_answer', $('#entryCorrectAnswer').value.trim());
    if (state.entryImagePath) {
      formData.append('image_path', state.entryImagePath);
    } else if (state.entryImage) {
      formData.append('image', state.entryImage, state.entryImage.name);
    }

    setSaveBusy(true, '保存中…');

    try {
      await api('/api/questions', { method: 'POST', body: formData });
      state.entryCount += 1;
      updateRoundBadge();
      $('#entryContent').value = '';
      $('#entryOptionAnalysis').value = '';
      $('#entrySource').value = '';
      $('#entryMyAnswer').value = '';
      $('#entryCorrectAnswer').value = '';
      clearEntryImage();
      state.entryCause = null;
      renderCauses($('#entryCauses'), null, isPolitics ? state.politicsCauses : state.causes);
      saveLastEntry();
      state.listLoaded = false;
      toast(`已记入错题本 · 本轮第 ${state.entryCount} 道`);
      refreshOverview();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSaveBusy(false);
    }
  }

  /* ---------------- 错题本 ---------------- */

  function initList() {
    const subjectSelect = $('#filterSubject');
    // 政治错题走独立的「政治」页，不混进修过科目的筛选与统计
    const examSubjects = state.subjects.filter((subject) => subject.name !== '政治');
    subjectSelect.innerHTML = '<option value="">全部科目</option>' + examSubjects.map((subject) => (
      `<option value="${esc(subject.name)}">${esc(subject.name)}</option>`
    )).join('');

    $('#filterCause').innerHTML = '<option value="">全部错因</option>' + state.causes.map((cause) => (
      `<option value="${esc(cause)}">${esc(cause)}</option>`
    )).join('');

    populateFilterChapters('');
    bindStatusSegmented();

    subjectSelect.addEventListener('change', () => {
      populateFilterChapters(subjectSelect.value);
      refreshList();
    });
    $('#filterChapter').addEventListener('change', refreshList);
    $('#filterCause').addEventListener('change', refreshList);
    $('#filterFrom').addEventListener('change', refreshList);
    $('#filterTo').addEventListener('change', refreshList);
    $('#filterQuery').addEventListener('input', debounce(refreshList, 350));
    $('#listFilters').addEventListener('submit', (event) => {
      event.preventDefault();
      refreshList();
    });
    $('#filterReset').addEventListener('click', resetListFilters);

    $('#questionList').addEventListener('click', (event) => {
      const row = event.target.closest('.question-row');
      if (row) openDetail(Number(row.dataset.id));
    });
    $('#questionList').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('.question-row');
      if (row) {
        event.preventDefault();
        openDetail(Number(row.dataset.id));
      }
    });
  }

  function populateFilterChapters(subjectName) {
    const select = $('#filterChapter');
    let html = '<option value="">全部章节</option>';
    if (subjectName) {
      const subject = getSubject(subjectName);
      if (subject) {
        html += subject.chapters.map((chapter) => (
          `<option value="${chapter.id}">${esc(chapter.title)}</option>`
        )).join('');
      }
    } else {
      state.subjects.forEach((subject) => {
        html += `<optgroup label="${esc(subject.name)}">` + subject.chapters.map((chapter) => (
          `<option value="${chapter.id}">${esc(chapter.title)}</option>`
        )).join('') + '</optgroup>';
      });
    }
    select.innerHTML = html;
  }

  function bindStatusSegmented() {
    $('#statusSegmented').addEventListener('click', (event) => {
      const button = event.target.closest('[data-status]');
      if (!button) return;
      state.listStatus = button.dataset.status;
      $$('#statusSegmented button').forEach((item) => item.classList.toggle('is-active', item === button));
      refreshList();
    });
  }

  function resetListFilters() {
    $('#filterSubject').value = '';
    populateFilterChapters('');
    $('#filterChapter').value = '';
    $('#filterCause').value = '';
    $('#filterFrom').value = '';
    $('#filterTo').value = '';
    $('#filterQuery').value = '';
    state.listStatus = '';
    $$('#statusSegmented button').forEach((item) => item.classList.toggle('is-active', item.dataset.status === ''));
    refreshList();
  }

  async function refreshList() {
    const params = new URLSearchParams();
    const subject = $('#filterSubject').value;
    const chapter = $('#filterChapter').value;
    const cause = $('#filterCause').value;
    const from = $('#filterFrom').value;
    const to = $('#filterTo').value;
    const query = $('#filterQuery').value.trim();
    if (subject) params.set('subject', subject);
    if (chapter) params.set('chapter_id', chapter);
    if (cause) params.set('cause', cause);
    if (state.listStatus) params.set('status', state.listStatus);
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    if (query) params.set('q', query);
    params.set('limit', '200');

    const token = ++state.listToken;
    try {
      const data = await api(`/api/questions?${params.toString()}`);
      if (token !== state.listToken) return;
      state.listLoaded = true;
      renderQuestionList(data);
    } catch (error) {
      if (token !== state.listToken) return;
      toast(error.message, 'error');
    }
  }

  function renderQuestionList(data) {
    const items = data.items || [];
    const count = data.count || 0;
    $('#listCount').textContent = `共 ${count} 条${count >= 200 ? '（仅显示最近 200 条）' : ''}`;
    const container = $('#questionList');
    if (!items.length) {
      container.innerHTML = `
        <div class="card empty-state">
          <span class="empty-icon">${ICONS.empty}</span>
          <h3>没有找到符合条件的错题</h3>
          <p>换个筛选条件，或者先录一道新的错题。</p>
          <button type="button" class="btn btn-soft" data-view="entry">去录题</button>
        </div>`;
      return;
    }

    container.innerHTML = items.map((item) => {
      const thumb = item.image_url
        ? `<span class="q-thumb"><img src="${esc(item.image_url)}" alt="" loading="lazy"></span>`
        : `<span class="q-thumb"><span class="q-thumb-empty">${ICONS.doc}</span></span>`;
      const excerpt = item.content
        ? item.content.replace(/\s+/g, ' ').slice(0, 180)
        : '仅保存了题目照片';
      const section = item.section_title ? ` · ${esc(item.section_title)}` : '';
      return `
        <article class="question-row" data-id="${item.id}" tabindex="0" role="button" aria-label="查看错题详情">
          ${thumb}
          <div class="q-body">
            <p class="q-title${item.content ? '' : ' is-empty'}">${esc(excerpt)}</p>
            <div class="q-meta">
              <span>${esc(item.subject)} · ${esc(item.chapter_title)}${section}</span>
              <span class="dot"></span>
              <span class="cause-tag">${esc(item.cause)}</span>
              <span class="dot"></span>
              <span>${fmtShort(item.created_at)}</span>
            </div>
          </div>
          <div class="q-side">
            ${statusPill(item.status)}
            <span class="q-chevron" aria-hidden="true">${ICONS.chevron}</span>
          </div>
        </article>`;
    }).join('');
  }

  function openChapterList(subject, chapterId) {
    $('#filterSubject').value = subject;
    populateFilterChapters(subject);
    $('#filterChapter').value = String(chapterId);
    $('#filterCause').value = '';
    $('#filterFrom').value = '';
    $('#filterTo').value = '';
    $('#filterQuery').value = '';
    state.listStatus = '';
    $$('#statusSegmented button').forEach((item) => item.classList.toggle('is-active', item.dataset.status === ''));
    setView('list');
  }

  $('#priorityList').addEventListener('click', (event) => {
    const card = event.target.closest('.priority-card');
    if (card) openChapterList(card.dataset.subject, Number(card.dataset.chapter));
  });
  $('#priorityList').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.priority-card');
    if (card) {
      event.preventDefault();
      openChapterList(card.dataset.subject, Number(card.dataset.chapter));
    }
  });

  /* ---------------- 详情弹窗 ---------------- */

  function initDetail() {
    renderCauses($('#detailCauses'), null);
    bindCauseGroup($('#detailCauses'), (cause) => {
      state.detailCause = cause;
    });
    $('#detailChapter').addEventListener('change', () => {
      populateDetailSections(Number($('#detailChapter').value), null);
    });
    $('#detailSave').addEventListener('click', saveDetailEdit);
    $('#detailDelete').addEventListener('click', deleteDetailQuestion);
    $('#detailRestore').addEventListener('click', restoreDetailQuestion);
  }

  async function openDetail(questionId) {
    try {
      const question = await api(`/api/questions/${questionId}`);
      state.detail = question;
      state.detailCause = question.cause;
      renderDetail(question);
      const modal = $('#detailModal');
      modal.hidden = false;
      document.body.classList.add('modal-open');
      requestAnimationFrame(() => {
        const closeButton = $('.modal-panel .icon-btn');
        if (closeButton) closeButton.focus();
      });
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderDetail(question) {
    const isPolitics = question.qtype === 'politics_choice';
    const section = question.section_title || '未细分小节';
    $('#detailEyebrow').textContent = `${question.subject} · ${section}`;
    $('#detailTitle').textContent = question.chapter_title;

    const extra = $('#detailExtra');
    if (isPolitics && question.option_analysis) {
      extra.hidden = false;
      extra.textContent = `错选项分析：${question.option_analysis}`;
    } else {
      extra.hidden = true;
      extra.textContent = '';
    }

    const imageLink = $('#detailImageLink');
    if (question.image_url) {
      $('#detailImage').src = question.image_url;
      imageLink.href = question.image_url;
      imageLink.hidden = false;
    } else {
      imageLink.hidden = true;
      $('#detailImage').removeAttribute('src');
    }

    const content = $('#detailContent');
    content.textContent = question.content || '（本题只保存了题目照片）';
    content.classList.toggle('is-empty', !question.content);

    setAnswerText($('#detailMyAnswer'), question.my_answer);
    setAnswerText($('#detailCorrectAnswer'), question.correct_answer);

    const metaRows = [
      ['来源', question.source || '未填写'],
      ['错因', question.cause],
      ['录入时间', fmtFull(question.created_at)],
    ];
    if (isPolitics) {
      metaRows.push(['题型', '政治选择题（不计入掌握度）']);
      metaRows.push(['年份', question.exam_year || '未填写']);
    } else {
      metaRows.push(['上次复习', question.last_review_at ? fmtFull(question.last_review_at) : '尚未复习']);
      metaRows.push(['复习次数', `${question.review_count} 次`]);
      metaRows.push(['当前状态', question.status === 'mastered' ? '已掌握' : '未掌握']);
    }
    $('#detailMeta').innerHTML = metaRows.map(([label, value]) => (
      `<div><dt>${esc(label)}</dt><dd title="${esc(value)}">${esc(value)}</dd></div>`
    )).join('');

    const subject = getSubject(question.subject);
    $('#detailChapter').innerHTML = (subject ? subject.chapters : []).map((chapter) => (
      `<option value="${chapter.id}">${esc(chapter.title)}</option>`
    )).join('');
    $('#detailChapter').value = String(question.chapter_id);
    populateDetailSections(question.chapter_id, question.section_id);
    renderCauses($('#detailCauses'), question.cause, isPolitics ? state.politicsCauses : state.causes);

    $('#detailEditPolitics').hidden = !isPolitics;
    if (isPolitics) {
      $('#detailContentEdit').value = question.content || '';
      $('#detailOptionAnalysis').value = question.option_analysis || '';
      $('#detailExamYear').value = question.exam_year || '';
    }
    const deleted = Boolean(question.deleted_at);
    $('#detailDelete').hidden = !isPolitics || deleted;
    $('#detailRestore').hidden = !isPolitics || !deleted;
    $('#detailSave').hidden = deleted;
    if (deleted) {
      $('#detailEyebrow').textContent = `${question.subject} · 已在回收站`;
    }
  }

  async function deleteDetailQuestion() {
    if (!state.detail) return;
    if (!window.confirm('把这道题移入回收站？可在政治页「选择题错题 → 回收站」里恢复。')) return;
    try {
      await api(`/api/questions/${state.detail.id}`, { method: 'DELETE' });
      closeDetail();
      toast('已移入回收站，可随时恢复。');
      await loadPoliticsQuestions();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function restoreDetailQuestion() {
    if (!state.detail) return;
    try {
      const updated = await api(`/api/questions/${state.detail.id}/restore`, { method: 'POST' });
      state.detail = updated;
      renderDetail(updated);
      toast('已恢复到列表。');
      await loadPoliticsQuestions();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function setAnswerText(element, value) {
    element.textContent = value || '未填写';
  }

  function populateDetailSections(chapterId, selectedId) {
    const select = $('#detailSection');
    const chapter = getChapter(chapterId);
    const sections = (chapter && chapter.sections) || [];
    if (!sections.length) {
      select.innerHTML = '<option value="">该章无小节</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = '<option value="">不选小节（可选）</option>' + sections.map((section) => (
      `<option value="${section.id}">${esc(section.title)}</option>`
    )).join('');
    if (selectedId && sections.some((section) => section.id === selectedId)) {
      select.value = String(selectedId);
    }
  }

  async function saveDetailEdit() {
    if (!state.detail) return;
    if (!state.detailCause) {
      toast('请选择一个错因标签', 'error');
      return;
    }
    const chapterId = Number($('#detailChapter').value);
    const sectionValue = $('#detailSection').value;
    const payload = {
      chapter_id: chapterId,
      section_id: sectionValue ? Number(sectionValue) : null,
      cause: state.detailCause,
    };
    const isPolitics = state.detail.qtype === 'politics_choice';
    if (isPolitics) {
      const analysis = $('#detailOptionAnalysis').value.trim();
      if (!analysis) {
        toast('政治选择题必须填写错选项分析', 'error');
        return;
      }
      payload.content = $('#detailContentEdit').value;
      payload.option_analysis = analysis;
      payload.exam_year = $('#detailExamYear').value.trim();
    }
    const button = $('#detailSave');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = '保存中…';
    try {
      await api(`/api/questions/${state.detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast('已保存修改');
      closeDetail();
      state.listLoaded = false;
      state.mastery = null;
      refreshList();
      refreshOverview();
      if (isPolitics) loadPoliticsQuestions();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function closeDetail() {
    $('#detailModal').hidden = true;
    document.body.classList.remove('modal-open');
    state.detail = null;
  }

  /* ---------------- 重做 ---------------- */

  function initReview() {
    const subjectSelect = $('#reviewSubject');
    subjectSelect.innerHTML = '<option value="">全部科目</option>' + state.subjects.map((subject) => (
      `<option value="${esc(subject.name)}">${esc(subject.name)}</option>`
    )).join('');
    setReviewChapterOptions('');

    subjectSelect.addEventListener('change', () => {
      setReviewChapterOptions(subjectSelect.value);
    });
    $('#startReview').addEventListener('click', startReview);
    $('#showAnswer').addEventListener('click', showReviewAnswer);
    $('#endReview').addEventListener('click', endReview);
    $('#reviewAgain').addEventListener('click', startReview);

    $('#reviewSession').addEventListener('click', (event) => {
      const button = event.target.closest('[data-result]');
      if (button) submitReviewResult(button.dataset.result);
    });
  }

  function setReviewChapterOptions(subjectName) {
    const select = $('#reviewChapter');
    if (!subjectName) {
      select.innerHTML = '<option value="">全部章节</option>';
      select.disabled = true;
      return;
    }
    const subject = getSubject(subjectName);
    select.disabled = false;
    select.innerHTML = '<option value="">全部章节</option>' + (subject ? subject.chapters.map((chapter) => (
      `<option value="${chapter.id}">${esc(chapter.title)}</option>`
    )).join('') : '');
  }

  async function startReview() {
    const subject = $('#reviewSubject').value;
    const chapter = $('#reviewChapter').value;
    const count = $('#reviewCount').value;
    const params = new URLSearchParams({ limit: count });
    if (subject) params.set('subject', subject);
    if (chapter) params.set('chapter_id', chapter);

    const button = $('#startReview');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = '抽取中…';
    try {
      const data = await api(`/api/review/questions?${params.toString()}`);
      const items = data.items || [];
      if (!items.length) {
        showReviewEmpty();
        toast('这个范围暂时没有待重做的错题', 'error');
        return;
      }
      beginReview(items);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function showReviewEmpty() {
    $('#reviewSetup').hidden = false;
    $('#reviewSession').hidden = true;
    $('#reviewSummary').hidden = true;
    $('#reviewEmpty').hidden = false;
    state.review.active = false;
  }

  function beginReview(items) {
    state.review = {
      items,
      index: 0,
      shown: false,
      mastered: 0,
      wrong: 0,
      active: true,
      busy: false,
    };
    $('#reviewSetup').hidden = true;
    $('#reviewEmpty').hidden = true;
    $('#reviewSummary').hidden = true;
    $('#reviewSession').hidden = false;
    renderReviewQuestion();
  }

  function renderReviewQuestion() {
    const review = state.review;
    const question = review.items[review.index];
    if (!question) return finishReview();

    review.shown = false;
    review.busy = false;
    $('#reviewStep').textContent = `第 ${review.index + 1} / ${review.items.length} 题`;
    $('#reviewProgress').style.width = `${((review.index + 1) / review.items.length) * 100}%`;
    $('#reviewTags').innerHTML = [
      subjectPill(question.subject),
      `<span class="tag-text">${esc(question.chapter_title)}${question.section_title ? ` · ${esc(question.section_title)}` : ''}</span>`,
      `<span class="cause-tag">${esc(question.cause)}</span>`,
    ].join('');

    const content = $('#reviewContent');
    content.textContent = question.content || '本题只保存了题目照片，请查看图片。';
    content.classList.toggle('is-empty', !question.content);

    const link = $('#reviewImageLink');
    if (question.image_url) {
      $('#reviewImage').src = question.image_url;
      link.href = question.image_url;
      link.hidden = false;
    } else {
      link.hidden = true;
      $('#reviewImage').removeAttribute('src');
    }

    $('#reviewAnswer').hidden = true;
    $('#reviewMy').textContent = '';
    $('#reviewCorrect').textContent = '';
    const showButton = $('#showAnswer');
    showButton.disabled = false;
    showButton.textContent = '查看答案';
    $('.review-hint').textContent = '先自己重做一遍，再查看答案。';
    $$('#reviewSession [data-result]').forEach((button) => {
      button.disabled = true;
    });
    $('#reviewSession').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showReviewAnswer() {
    const review = state.review;
    const question = review.items[review.index];
    if (!question) return;
    review.shown = true;
    $('#reviewMy').textContent = question.my_answer || '未填写';
    $('#reviewCorrect').textContent = question.correct_answer || '未填写';
    $('#reviewAnswer').hidden = false;
    $('#showAnswer').disabled = true;
    $('#showAnswer').textContent = '答案已显示';
    $('.review-hint').textContent = '对照答案，诚实选择结果。';
    $$('#reviewSession [data-result]').forEach((button) => {
      button.disabled = false;
    });
  }

  async function submitReviewResult(result) {
    const review = state.review;
    if (!review.active || !review.shown || review.busy) return;
    const question = review.items[review.index];
    review.busy = true;
    $$('#reviewSession [data-result]').forEach((button) => {
      button.disabled = true;
    });
    try {
      await api(`/api/questions/${question.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      if (result === 'mastered') review.mastered += 1;
      else review.wrong += 1;
      state.listLoaded = false;
      state.mastery = null;
      review.index += 1;
      if (review.index >= review.items.length) {
        finishReview();
      } else {
        renderReviewQuestion();
      }
      refreshOverview();
    } catch (error) {
      toast(error.message, 'error');
      review.busy = false;
      $$('#reviewSession [data-result]').forEach((button) => {
        button.disabled = false;
      });
    }
  }

  function finishReview() {
    const review = state.review;
    const answered = review.mastered + review.wrong;
    if (!answered) {
      resetReviewUI();
      return;
    }
    state.review.active = false;
    $('#reviewSession').hidden = true;
    $('#reviewSetup').hidden = true;
    $('#reviewEmpty').hidden = true;
    $('#reviewSummary').hidden = false;
    $('#summaryMastered').textContent = review.mastered;
    $('#summaryWrong').textContent = review.wrong;
    $('#summaryNote').textContent = review.wrong === 0
      ? '这一组全部掌握，保持节奏。'
      : `仍有 ${review.wrong} 道需要复习，它们已回到重做池。`;
  }

  function resetReviewUI() {
    state.review.active = false;
    $('#reviewSession').hidden = true;
    $('#reviewSummary').hidden = true;
    $('#reviewEmpty').hidden = true;
    $('#reviewSetup').hidden = false;
  }

  function endReview() {
    const review = state.review;
    if (review.mastered + review.wrong > 0) {
      finishReview();
    } else {
      resetReviewUI();
    }
  }

  /* ---------------- 掌握度 ---------------- */

  async function refreshMastery() {
    try {
      state.mastery = await api('/api/mastery');
      renderMastery(state.mastery);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderMastery(data) {
    const container = $('#masteryList');
    const subjects = data.subjects || [];
    if (!subjects.length) {
      container.innerHTML = `
        <div class="card empty-state">
          <span class="empty-icon">${ICONS.empty}</span>
          <h3>暂无掌握度数据</h3>
          <p>录题并完成重做后，这里会按章节展示状态。</p>
          <button type="button" class="btn btn-soft" data-view="entry">去录题</button>
        </div>`;
      return;
    }

    container.innerHTML = subjects.map((subject) => {
      const weight = subject.chapters.reduce((sum, chapter) => sum + Number(chapter.weight || 0), 0);
      const overall = subject.mastery === null || subject.mastery === undefined ? '—' : `${subject.mastery}%`;
      const rows = subject.chapters.map((chapter) => {
        const rate = chapter.error_rate === null ? null : Math.round(chapter.error_rate * 100);
        const rateClass = rate === null ? 'rate-none' : (rate >= 50 ? 'rate-high' : (rate >= 20 ? 'rate-mid' : 'rate-low'));
        const last = chapter.last_review_at ? fmtShort(chapter.last_review_at) : '—';
        return `
          <div class="chapter-row">
            <span class="chapter-name" title="${esc(chapter.chapter)}">${esc(chapter.chapter)}</span>
            <span class="metric weight" data-label="权重">${chapter.weight}</span>
            <span class="metric" data-label="错题">${chapter.wrong}</span>
            <span class="metric" data-label="错误率"><span class="rate-pill ${rateClass}">${rate === null ? '—' : `${rate}%`}</span></span>
            <span class="metric muted" data-label="复习">${last}</span>
          </div>`;
      }).join('');

      return `
        <section class="card mastery-card">
          <div class="mastery-head">
            <div class="mastery-title">
              <h3>${esc(subject.subject)}</h3>
              <span>${subject.total_chapters} 章 · ${weight} 分 · ${subject.wrong} 道待掌握</span>
            </div>
            <div class="mastery-overall">
              <b>${overall}</b>
              <span>整体掌握度</span>
            </div>
          </div>
          <div class="chapter-head">
            <span>章节</span>
            <span>权重</span>
            <span>错题数</span>
            <span>错误率</span>
            <span>最近复习</span>
          </div>
          ${rows}
        </section>`;
    }).join('');
  }
  /* ---------------- 政治模块 ---------------- */

  function politicsSubject() {
    return getSubject('政治');
  }

  function initPolitics() {
    const subject = politicsSubject();
    const chapters = subject ? subject.chapters : [];

    const blockOptions = '<option value="">全部大块</option>' + chapters.map((chapter) => (
      `<option value="${chapter.id}">${esc(chapter.title)}</option>`
    )).join('');
    $('#pCardChapter').innerHTML = blockOptions;
    $('#pQChapter').innerHTML = blockOptions;
    $('#pCardFormChapter').innerHTML = chapters.map((chapter) => (
      `<option value="${chapter.id}">${esc(chapter.title)}</option>`
    )).join('');
    $('#pCardSection').innerHTML = '<option value="">全部章</option>';
    $('#pCardSection').disabled = true;
    populateCardFormSections(Number($('#pCardFormChapter').value));
    $('#pQCause').innerHTML = '<option value="">全部错因</option>' + state.politicsCauses.map((cause) => (
      `<option value="${esc(cause)}">${esc(cause)}</option>`
    )).join('');

    $('#pCardChapter').addEventListener('change', () => {
      populatePoliticsSections(Number($('#pCardChapter').value));
      loadPoliticsCards();
    });
    $('#pCardSection').addEventListener('change', loadPoliticsCards);
    $('#pCardFormChapter').addEventListener('change', () => {
      populateCardFormSections(Number($('#pCardFormChapter').value));
    });

    $('#politicsSearch').addEventListener('input', debounce(runPoliticsSearch, 300));

    $$('.politics-tab').forEach((tab) => {
      tab.addEventListener('click', () => setPoliticsTab(tab.dataset.ptab));
    });

    bindPoliticsFormToggles();
    bindPoliticsCardActions();
    bindAffairForm();
    bindAffairActions();
    bindFrameworkForm();
    bindFrameworkActions();
    bindPoliticsQuestionActions();

    $('#pCardDeletedToggle').addEventListener('click', () => togglePoliticsDeleted('cards'));
    $('#pAffairDeletedToggle').addEventListener('click', () => togglePoliticsDeleted('affairs'));
    $('#pFrameworkDeletedToggle').addEventListener('click', () => togglePoliticsDeleted('frameworks'));
    $('#pQDeletedToggle').addEventListener('click', () => togglePoliticsDeleted('questions'));

    $('#pQChapter').addEventListener('change', renderPoliticsQuestions);
    $('#pQCause').addEventListener('change', renderPoliticsQuestions);
    $('#pQYear').addEventListener('input', debounce(renderPoliticsQuestions, 250));
    $('#pQNew').addEventListener('click', goEntryPolitics);

    $('#politicsSearchResults').addEventListener('click', (event) => {
      const result = event.target.closest('[data-result-type]');
      if (!result) return;
      openPoliticsResult(result.dataset.resultType, Number(result.dataset.resultId), {
        chapterId: Number(result.dataset.chapterId) || null,
        sectionId: Number(result.dataset.sectionId) || null,
      });
    });

    setAffairDefaultDate();
  }

  function togglePoliticsDeleted(kind) {
    const stateKey = state.politics.showDeleted;
    stateKey[kind] = !stateKey[kind];
    const selectors = {
      cards: '#pCardDeletedToggle',
      affairs: '#pAffairDeletedToggle',
      frameworks: '#pFrameworkDeletedToggle',
      questions: '#pQDeletedToggle',
    };
    const button = $(selectors[kind]);
    const active = stateKey[kind];
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.textContent = active ? '退出回收站' : '回收站';
    reloadPoliticsKind(kind);
  }

  function reloadPoliticsKind(kind) {
    if (kind === 'cards') return loadPoliticsCards();
    if (kind === 'affairs') return loadAffairs();
    if (kind === 'frameworks') return loadFrameworks();
    if (kind === 'questions') return loadPoliticsQuestions();
    return Promise.resolve();
  }

  const POLITICS_RESOURCES = {
    cards: { path: '/api/politics/cards', name: '这张卡片' },
    affairs: { path: '/api/politics/affairs', name: '这条时政' },
    frameworks: { path: '/api/politics/frameworks', name: '这个框架' },
  };

  async function deletePoliticsItem(kind, id) {
    const resource = POLITICS_RESOURCES[kind];
    if (!window.confirm(`把${resource.name}移入回收站？之后可在「回收站」里恢复。`)) return;
    try {
      await api(`${resource.path}/${id}`, { method: 'DELETE' });
      toast('已移入回收站，可随时恢复。');
      await reloadPoliticsKind(kind);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function restorePoliticsItem(kind, id) {
    try {
      await api(`${POLITICS_RESOURCES[kind].path}/${id}/restore`, { method: 'POST' });
      toast('已恢复到列表。');
      await reloadPoliticsKind(kind);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function bindPoliticsItemActions(containerSelector, kind, findItem) {
    $(containerSelector).addEventListener('click', (event) => {
      const element = event.target.closest('[data-id]');
      if (!element) return;
      const item = findItem(Number(element.dataset.id));
      if (!item) return;
      if (event.target.closest('[data-pedit]')) {
        event.preventDefault();
        if (kind === 'cards') startCardEdit(item);
        else if (kind === 'affairs') startAffairEdit(item);
        else startFrameworkEdit(item);
        return;
      }
      if (event.target.closest('[data-pdelete]')) {
        event.preventDefault();
        deletePoliticsItem(kind, item.id);
        return;
      }
      if (event.target.closest('[data-prestore]')) {
        event.preventDefault();
        restorePoliticsItem(kind, item.id);
      }
    });
  }

  function setPoliticsTab(name) {
    state.politicsTab = name;
    $$('.politics-tab').forEach((tab) => {
      const active = tab.dataset.ptab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    ['cards', 'affairs', 'frameworks', 'questions'].forEach((key) => {
      const panel = $(`#panel-${key}`);
      if (panel) panel.classList.toggle('is-active', key === name);
    });
  }

  function refreshPolitics() {
    setPoliticsTab(state.politicsTab);
    Promise.all([
      loadPoliticsCards(),
      loadAffairs(),
      loadFrameworks(),
      loadPoliticsQuestions(),
    ]).catch((error) => toast(error.message, 'error'));
  }

  function populatePoliticsSections(chapterId) {
    const select = $('#pCardSection');
    const chapter = getChapter(chapterId);
    const sections = (chapter && chapter.sections) || [];
    if (!sections.length) {
      select.innerHTML = '<option value="">全部章</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = '<option value="">全部章</option>' + sections.map((section) => (
      `<option value="${section.id}">${esc(section.title)}</option>`
    )).join('');
  }

  function populateCardFormSections(chapterId) {
    const select = $('#pCardFormSection');
    const chapter = getChapter(chapterId);
    const sections = (chapter && chapter.sections) || [];
    select.disabled = !sections.length;
    select.innerHTML = '<option value="">不指定章</option>' + sections.map((section) => (
      `<option value="${section.id}">${esc(section.title)}</option>`
    )).join('');
  }

  function bindPoliticsFormToggles() {
    const pairs = [
      ['pCardNewToggle', 'pCardForm', 'pCardCancel', resetCardForm],
      ['pAffairNewToggle', 'pAffairForm', 'pAffairCancel', resetAffairForm],
      ['pFrameworkNewToggle', 'pFrameworkForm', 'pFwCancel', resetFrameworkForm],
    ];
    pairs.forEach(([toggleId, formId, cancelId, reset]) => {
      $(`#${toggleId}`).addEventListener('click', () => {
        const form = $(`#${formId}`);
        const opening = form.hidden;
        form.hidden = !opening;
        if (opening) {
          reset();
          const first = form.querySelector('input, textarea, select');
          if (first) first.focus();
        } else {
          reset();
        }
      });
      $(`#${cancelId}`).addEventListener('click', () => {
        $(`#${formId}`).hidden = true;
        reset();
      });
    });

    $('#pCardForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const chapterId = Number($('#pCardFormChapter').value);
      if (!chapterId) {
        toast('先选一个大块，再保存卡片', 'error');
        return;
      }
      const title = $('#pCardTitle').value.trim();
      if (!title) {
        toast('给卡片起个考点名', 'error');
        return;
      }
      const payload = {
        chapter_id: chapterId,
        section_id: Number($('#pCardFormSection').value) || null,
        title,
        body: $('#pCardBody').value,
      };
      const editing = state.politics.cardEditing;
      if (editing) {
        payload.view_count = Math.max(0, Number($('#pCardViewCount').value) || 0);
        payload.self_rating = $('#pCardRating').value;
      }
      try {
        await api(editing ? `/api/politics/cards/${editing}` : '/api/politics/cards', {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast(editing ? '卡片已更新。' : '卡片已收录，继续下一张。');
        $('#pCardForm').hidden = true;
        resetCardForm();
        await loadPoliticsCards();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }

  function resetCardForm() {
    state.politics.cardEditing = null;
    $('#pCardFormHint').textContent = '保存后可随时点卡片上的「编辑」改内容。';
    $('#pCardSave').textContent = '保存卡片';
    $('#pCardTitle').value = '';
    $('#pCardBody').value = '';
    $('#pCardStatsRow').hidden = true;
    $('#pCardRating').value = '';
    $('#pCardViewCount').value = '0';
    const formChapter = $('#pCardFormChapter');
    if (formChapter.options.length) {
      formChapter.value = $('#pCardChapter').value || formChapter.options[0].value;
    }
    populateCardFormSections(Number(formChapter.value));
    const formSection = $('#pCardFormSection');
    if ($('#pCardSection').value && !formSection.disabled) formSection.value = $('#pCardSection').value;
  }

  function startCardEdit(card) {
    state.politics.cardEditing = card.id;
    $('#pCardFormHint').textContent = '正在编辑这张卡片，保存后列表就地刷新。';
    $('#pCardSave').textContent = '保存修改';
    $('#pCardTitle').value = card.title;
    $('#pCardBody').value = card.body || '';
    $('#pCardStatsRow').hidden = false;
    $('#pCardRating').value = card.self_rating || '';
    $('#pCardViewCount').value = String(card.view_count || 0);
    $('#pCardFormChapter').value = String(card.chapter_id);
    populateCardFormSections(card.chapter_id);
    $('#pCardFormSection').value = card.section_id ? String(card.section_id) : '';
    $('#pCardForm').hidden = false;
    $('#pCardTitle').focus();
  }

  async function loadPoliticsCards() {
    const params = new URLSearchParams();
    const chapterId = $('#pCardChapter').value;
    const sectionId = $('#pCardSection').value;
    if (chapterId) params.set('chapter_id', chapterId);
    if (sectionId) params.set('section_id', sectionId);
    if (state.politics.showDeleted.cards) params.set('include_deleted', 'true');
    try {
      const data = await api(`/api/politics/cards?${params.toString()}`);
      state.politics.cards = data.items || [];
      renderPoliticsCards();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderPoliticsCards() {
    const items = state.politics.cards;
    $('#pCardCount').textContent = `${items.length} 张卡片`;
    const container = $('#cardList');
    if (!items.length) {
      container.innerHTML = `
        <div class="card empty-state">
          <span class="empty-icon">${ICONS.empty}</span>
          <h3>还没有知识点卡</h3>
          <p>点「新建卡片」，把考点名和关键词分开写。</p>
        </div>`;
      return;
    }
    container.innerHTML = items.map((card) => {
      const chapterText = [card.chapter_title, card.section_title].filter(Boolean).join(' · ');
      const deleted = Boolean(card.deleted_at);
      if (deleted) {
        return `
          <article class="knowledge-card is-deleted" data-id="${card.id}">
            <div class="kc-top">
              <span class="kc-chapter" title="${esc(chapterText)}">${esc(chapterText)}</span>
              <span class="kc-meta">${esc(cardMetaText(card))}</span>
            </div>
            <h3 class="kc-title">${esc(card.title)}</h3>
            <div class="politics-item-tools">
              <span class="meta-tag">已删除 · ${esc(fmtShort(card.deleted_at))}</span>
              <button type="button" class="link-btn" data-prestore>恢复</button>
            </div>
          </article>`;
      }
      return `
        <article class="knowledge-card" data-id="${card.id}">
          <div class="kc-top">
            <span class="kc-chapter" title="${esc(chapterText)}">${esc(chapterText)}</span>
            <span class="kc-meta" data-view-count>${esc(cardMetaText(card))}</span>
          </div>
          <h3 class="kc-title">${esc(card.title)}</h3>
          <div class="kc-mask" data-reveal role="button" tabindex="0">点击揭晓关键词</div>
          <p class="kc-body" hidden>${esc(card.body || '（还没有写背面内容）')}</p>
          <div class="kc-actions" hidden>
            <button type="button" class="btn btn-soft" data-rate="remembered">记住了</button>
            <button type="button" class="btn btn-ghost" data-rate="forgotten">没记住</button>
          </div>
          <div class="politics-item-tools">
            <button type="button" class="link-btn" data-pedit>编辑</button>
            <button type="button" class="link-btn is-danger" data-pdelete>删除</button>
          </div>
        </article>`;
    }).join('');
  }

  function cardMetaText(card) {
    const parts = [`看过 ${card.view_count || 0} 次`];
    if (card.last_viewed_at) parts.push(`上次 ${fmtShort(card.last_viewed_at)}`);
    if (card.self_rating) parts.push(card.self_rating === 'remembered' ? '自评：记住了' : '自评：没记住');
    return parts.join(' · ');
  }

  function bindPoliticsCardActions() {
    bindPoliticsItemActions('#cardList', 'cards', (id) => state.politics.cards.find((item) => item.id === id));

    $('#cardList').addEventListener('click', async (event) => {
      const cardEl = event.target.closest('.knowledge-card');
      if (!cardEl) return;
      const card = state.politics.cards.find((item) => item.id === Number(cardEl.dataset.id));
      if (!card || card.deleted_at) return;

      if (event.target.closest('[data-reveal]')) {
        revealPoliticsCard(cardEl, card);
        return;
      }
      const rateButton = event.target.closest('[data-rate]');
      if (rateButton) {
        ratePoliticsCard(card, rateButton.dataset.rate, cardEl);
      }
    });

    $('#cardList').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const mask = event.target.closest('[data-reveal]');
      if (!mask) return;
      event.preventDefault();
      const cardEl = mask.closest('.knowledge-card');
      const card = state.politics.cards.find((item) => item.id === Number(cardEl.dataset.id));
      if (card) revealPoliticsCard(cardEl, card);
    });
  }

  async function revealPoliticsCard(cardEl, card) {
    const mask = $('[data-reveal]', cardEl);
    mask.hidden = true;
    $('.kc-body', cardEl).hidden = false;
    $('.kc-actions', cardEl).hidden = false;
    try {
      const updated = await api(`/api/politics/cards/${card.id}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      Object.assign(card, updated);
      $('[data-view-count]', cardEl).textContent = cardMetaText(card);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function ratePoliticsCard(card, rating, cardEl) {
    try {
      const updated = await api(`/api/politics/cards/${card.id}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      Object.assign(card, updated);
      $('[data-view-count]', cardEl).textContent = cardMetaText(card);
      toast(rating === 'remembered' ? '标记为记住了' : '标记为没记住，再来一次');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function setAffairDefaultDate() {
    if ($('#pAffairDate').value) return;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    $('#pAffairDate').value = `${now.getFullYear()}-${month}-${day}`;
  }

  function bindAffairForm() {
    $('#pAffairTag').addEventListener('change', renderAffairs);
    $('#pAffairPointFilter').addEventListener('change', renderAffairs);

    $('#pAffairForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = $('#pAffairTitle').value.trim();
      if (!title) {
        toast('写一下时政事件', 'error');
        return;
      }
      const payload = {
        event_date: $('#pAffairDate').value,
        title,
        related_point: $('#pAffairPoint').value.trim(),
        tags: $('#pAffairTags').value.trim(),
        note: $('#pAffairNote').value.trim(),
      };
      const editing = state.politics.affairEditing;
      try {
        await api(editing ? `/api/politics/affairs/${editing}` : '/api/politics/affairs', {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast(editing ? '时政已更新。' : '时政已收录，关联考点会一起进搜索。');
        $('#pAffairForm').hidden = true;
        resetAffairForm();
        await loadAffairs();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }

  function resetAffairForm() {
    state.politics.affairEditing = null;
    $('#pAffairSave').textContent = '保存时政';
    $('#pAffairTitle').value = '';
    $('#pAffairPoint').value = '';
    $('#pAffairTags').value = '';
    $('#pAffairNote').value = '';
    setAffairDefaultDate();
  }

  function startAffairEdit(item) {
    state.politics.affairEditing = item.id;
    $('#pAffairSave').textContent = '保存修改';
    $('#pAffairDate').value = item.event_date || '';
    $('#pAffairTitle').value = item.title || '';
    $('#pAffairPoint').value = item.related_point || '';
    $('#pAffairTags').value = item.tags || '';
    $('#pAffairNote').value = item.note || '';
    $('#pAffairForm').hidden = false;
    $('#pAffairTitle').focus();
  }

  async function loadAffairs() {
    const params = new URLSearchParams({ limit: '300' });
    if (state.politics.showDeleted.affairs) params.set('include_deleted', 'true');
    try {
      const data = await api(`/api/politics/affairs?${params.toString()}`);
      state.politics.affairs = data.items || [];
      refreshAffairFilterOptions();
      renderAffairs();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function refreshAffairFilterOptions() {
    const tags = new Set();
    const points = new Set();
    state.politics.affairs.filter((item) => !item.deleted_at).forEach((item) => {
      (item.tags || '').split(/[，,]/).map((tag) => tag.trim()).filter(Boolean).forEach((tag) => tags.add(tag));
      if (item.related_point) points.add(item.related_point.trim());
    });
    const tagSelect = $('#pAffairTag');
    const pointSelect = $('#pAffairPointFilter');
    const tagValue = tagSelect.value;
    const pointValue = pointSelect.value;
    tagSelect.innerHTML = '<option value="">全部标签</option>' + Array.from(tags).map((tag) => (
      `<option value="${esc(tag)}">${esc(tag)}</option>`
    )).join('');
    pointSelect.innerHTML = '<option value="">全部关联考点</option>' + Array.from(points).map((point) => (
      `<option value="${esc(point)}">${esc(point)}</option>`
    )).join('');
    if (tagValue && tags.has(tagValue)) tagSelect.value = tagValue;
    if (pointValue && points.has(pointValue)) pointSelect.value = pointValue;
  }

  function renderAffairs() {
    const tag = $('#pAffairTag').value;
    const point = $('#pAffairPointFilter').value;
    const items = state.politics.affairs.filter((item) => {
      if (tag && !(item.tags || '').split(/[，,]/).map((value) => value.trim()).includes(tag)) return false;
      if (point && item.related_point !== point) return false;
      return true;
    });
    $('#pAffairCount').textContent = `${items.length} 条时政`;
    const container = $('#affairList');
    if (!items.length) {
      container.innerHTML = `
        <div class="card empty-state">
          <span class="empty-icon">${ICONS.empty}</span>
          <h3>还没有时政素材</h3>
          <p>按日期记事件，再补一句关联考点和命题角度。</p>
        </div>`;
      return;
    }
    container.innerHTML = items.map((item) => {
      const tags = (item.tags || '').split(/[，,]/).map((tag) => tag.trim()).filter(Boolean);
      const tools = item.deleted_at
        ? `<span class="meta-tag">已删除 · ${esc(fmtShort(item.deleted_at))}</span>
           <button type="button" class="link-btn" data-prestore>恢复</button>`
        : `<button type="button" class="link-btn" data-pedit>编辑</button>
           <button type="button" class="link-btn is-danger" data-pdelete>删除</button>`;
      return `
        <article class="affair-item${item.deleted_at ? ' is-deleted' : ''}" data-id="${item.id}">
          <span class="affair-date">${esc(item.event_date)}</span>
          <div class="affair-body">
            <h3>${esc(item.title)}</h3>
            ${item.note ? `<p>${esc(item.note)}</p>` : ''}
            <div class="affair-meta">
              ${item.related_point ? `<span class="meta-tag">考点：${esc(item.related_point)}</span>` : ''}
              ${tags.map((tag) => `<span class="meta-tag">${esc(tag)}</span>`).join('')}
            </div>
            <div class="politics-item-tools">${tools}</div>
          </div>
        </article>`;
    }).join('');
  }

  function bindAffairActions() {
    bindPoliticsItemActions('#affairList', 'affairs', (id) => state.politics.affairs.find((item) => item.id === id));
  }

  function bindFrameworkForm() {
    $('#pFrameworkType').addEventListener('change', renderFrameworks);
    $('#pFrameworkForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        question_type: $('#pFwType').value,
        template: $('#pFwTemplate').value,
        keywords: $('#pFwKeywords').value.trim(),
      };
      if (!payload.question_type) {
        toast('先选题型', 'error');
        return;
      }
      const editing = state.politics.frameworkEditing;
      try {
        await api(editing ? `/api/politics/frameworks/${editing}` : '/api/politics/frameworks', {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast(editing ? '框架已更新。' : '分析题框架已保存。');
        $('#pFrameworkForm').hidden = true;
        resetFrameworkForm();
        await loadFrameworks();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }

  function resetFrameworkForm() {
    state.politics.frameworkEditing = null;
    $('#pFwSave').textContent = '保存框架';
    $('#pFwTemplate').value = '';
    $('#pFwKeywords').value = '';
  }

  function setFrameworkType(value) {
    const select = $('#pFwType');
    const exists = Array.from(select.options).some((option) => option.value === value);
    if (!exists && value) select.add(new Option(value, value));
    select.value = value || select.options[0].value;
  }

  function startFrameworkEdit(item) {
    state.politics.frameworkEditing = item.id;
    $('#pFwSave').textContent = '保存修改';
    setFrameworkType(item.question_type);
    $('#pFwTemplate').value = item.template || '';
    $('#pFwKeywords').value = item.keywords || '';
    $('#pFrameworkForm').hidden = false;
    $('#pFwTemplate').focus();
  }

  async function loadFrameworks() {
    const params = new URLSearchParams();
    if (state.politics.showDeleted.frameworks) params.set('include_deleted', 'true');
    try {
      const data = await api(`/api/politics/frameworks?${params.toString()}`);
      state.politics.frameworks = data.items || [];
      renderFrameworks();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderFrameworks() {
    const type = $('#pFrameworkType').value;
    const items = state.politics.frameworks.filter((item) => !type || item.question_type === type);
    $('#pFrameworkCount').textContent = `${items.length} 个框架`;
    const container = $('#frameworkList');
    if (!items.length) {
      container.innerHTML = `
        <div class="card empty-state">
          <span class="empty-icon">${ICONS.empty}</span>
          <h3>还没有分析题框架</h3>
          <p>按原理类 / 意义类 / 措施类整理模板，考前一页翻完。</p>
        </div>`;
      return;
    }
    container.innerHTML = items.map((item) => {
      const keywords = (item.keywords || '').split(/[，,]/).map((word) => word.trim()).filter(Boolean);
      const tools = item.deleted_at
        ? `<span class="meta-tag">已删除 · ${esc(fmtShort(item.deleted_at))}</span>
           <button type="button" class="link-btn" data-prestore>恢复</button>`
        : `<button type="button" class="link-btn" data-pedit>编辑</button>
           <button type="button" class="link-btn is-danger" data-pdelete>删除</button>`;
      return `
        <article class="framework-item${item.deleted_at ? ' is-deleted' : ''}" data-id="${item.id}">
          <span class="framework-type">${esc(item.question_type)}</span>
          <h3>${esc(item.question_type)}答题框架</h3>
          <p>${esc(item.template || '（还没有写模板）')}</p>
          <div class="framework-meta">
            ${keywords.map((word) => `<span class="meta-tag">${esc(word)}</span>`).join('')}
            <span class="meta-tag">${fmtShort(item.created_at)}</span>
          </div>
          <div class="politics-item-tools">${tools}</div>
        </article>`;
    }).join('');
  }

  function bindFrameworkActions() {
    bindPoliticsItemActions('#frameworkList', 'frameworks', (id) => state.politics.frameworks.find((item) => item.id === id));
  }

  function goEntryPolitics() {
    const subject = politicsSubject();
    if (!subject) return;
    setView('entry');
    const chapter = subject.chapters[0];
    setEntrySelection('政治', chapter ? chapter.id : null, null, true);
    applyEntryMode();
    toast('已切到录题：政治选择题（错选项分析必填）');
    $('#entryForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadPoliticsQuestions() {
    const params = new URLSearchParams({ qtype: 'politics_choice', limit: '300' });
    if (state.politics.showDeleted.questions) params.set('include_deleted', 'true');
    try {
      const data = await api(`/api/questions?${params.toString()}`);
      state.politics.questions = data.items || [];
      renderPoliticsQuestions();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderPoliticsQuestions() {
    const chapterId = $('#pQChapter').value;
    const cause = $('#pQCause').value;
    const year = $('#pQYear').value.trim();
    const items = state.politics.questions.filter((item) => {
      if (chapterId && String(item.chapter_id) !== chapterId) return false;
      if (cause && item.cause !== cause) return false;
      if (year && !(item.exam_year || '').includes(year)) return false;
      return true;
    });
    $('#pQCount').textContent = `${items.length} 道选择题`;
    const container = $('#politicsQuestionList');
    if (!items.length) {
      container.innerHTML = `
        <div class="card empty-state">
          <span class="empty-icon">${ICONS.empty}</span>
          <h3>还没有政治选择题错题</h3>
          <p>政治不做重做队列，只记错选项分析和年份，考前翻一遍。</p>
          <button type="button" class="btn btn-soft" id="pQEmptyNew">＋ 录一道政治选择题</button>
        </div>`;
      const emptyButton = $('#pQEmptyNew');
      if (emptyButton) emptyButton.addEventListener('click', goEntryPolitics);
      return;
    }
    container.innerHTML = items.map((item) => {
      const thumb = item.image_url
        ? `<span class="q-thumb"><img src="${esc(item.image_url)}" alt="" loading="lazy"></span>`
        : `<span class="q-thumb"><span class="q-thumb-empty">${ICONS.doc}</span></span>`;
      const excerpt = item.content
        ? item.content.replace(/\s+/g, ' ').slice(0, 160)
        : '仅保存了题目照片';
      const section = item.section_title ? ` · ${esc(item.section_title)}` : '';
      const yearText = item.exam_year ? ` · ${esc(item.exam_year)}` : '';
      const side = item.deleted_at
        ? `<span class="meta-tag">已删除</span><button type="button" class="link-btn" data-qrestore>恢复</button>`
        : `<button type="button" class="link-btn is-danger" data-qdelete>删除</button>
           <span class="q-chevron" aria-hidden="true">${ICONS.chevron}</span>`;
      return `
        <article class="question-row${item.deleted_at ? ' is-deleted' : ''}" data-id="${item.id}" tabindex="0" role="button" aria-label="查看政治选择题详情">
          ${thumb}
          <div class="q-body">
            <p class="q-title${item.content ? '' : ' is-empty'}">${esc(excerpt)}</p>
            <div class="q-meta">
              <span>${esc(item.chapter_title)}${section}${yearText}</span>
              <span class="dot"></span>
              <span class="cause-tag">${esc(item.cause)}</span>
              <span class="dot"></span>
              <span>${fmtShort(item.created_at)}</span>
            </div>
          </div>
          <div class="q-side">${side}</div>
        </article>`;
    }).join('');
    $$('#politicsQuestionList .question-row').forEach((row) => {
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openDetail(Number(row.dataset.id));
      });
    });
  }

  async function deletePoliticsQuestion(id) {
    if (!window.confirm('把这道政治选择题移入回收站？可在本分区「回收站」里恢复。')) return;
    try {
      await api(`/api/questions/${id}`, { method: 'DELETE' });
      toast('已移入回收站，可随时恢复。');
      await loadPoliticsQuestions();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function restorePoliticsQuestion(id) {
    try {
      await api(`/api/questions/${id}/restore`, { method: 'POST' });
      toast('已恢复到列表。');
      await loadPoliticsQuestions();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function bindPoliticsQuestionActions() {
    $('#politicsQuestionList').addEventListener('click', (event) => {
      const row = event.target.closest('.question-row');
      if (!row) return;
      const id = Number(row.dataset.id);
      if (event.target.closest('[data-qdelete]')) {
        event.stopPropagation();
        deletePoliticsQuestion(id);
        return;
      }
      if (event.target.closest('[data-qrestore]')) {
        event.stopPropagation();
        restorePoliticsQuestion(id);
        return;
      }
      openDetail(id);
    });
  }

  function runPoliticsSearch() {
    const input = $('#politicsSearch');
    const query = input.value.trim();
    const results = $('#politicsSearchResults');
    const hint = $('#politicsSearchHint');
    if (!query) {
      results.hidden = true;
      results.innerHTML = '';
      hint.textContent = '输入关键词，四类内容一起搜。';
      return;
    }
    const token = ++state.politics.searchToken;
    hint.textContent = '搜索中…';
    api(`/api/politics/search?q=${encodeURIComponent(query)}`).then((data) => {
      if (token !== state.politics.searchToken) return;
      const items = data.items || [];
      hint.textContent = items.length ? `找到 ${items.length} 条结果` : '没有找到相关内容，换个关键词试试。';
      results.hidden = false;
      results.innerHTML = items.map((item) => {
        const label = { card: '知识点卡', affair: '时政', framework: '分析题框架', question: '错题' }[item.type] || item.type;
        return `
          <button type="button" class="politics-result" data-result-type="${esc(item.type)}" data-result-id="${item.id}"
            data-chapter-id="${item.chapter_id || ''}" data-section-id="${item.section_id || ''}">
            <span class="politics-result-type">${label}</span>
            <span class="politics-result-main">
              <strong>${esc(item.title || '')}</strong>
              <span>${esc(item.snippet || '')}</span>
              <em>${esc(item.meta || '')}</em>
            </span>
          </button>`;
      }).join('');
    }).catch((error) => {
      if (token !== state.politics.searchToken) return;
      hint.textContent = `搜索失败：${error.message}`;
    });
  }

  function openPoliticsResult(type, id, locator) {
    if (type === 'question') {
      setPoliticsTab('questions');
      openDetail(id);
      return;
    }
    if (type === 'card') {
      setPoliticsTab('cards');
      $('#pCardChapter').value = locator.chapterId ? String(locator.chapterId) : '';
      populatePoliticsSections(locator.chapterId || 0);
      $('#pCardSection').value = locator.sectionId ? String(locator.sectionId) : '';
      loadPoliticsCards().then(() => focusPoliticsItem('#cardList', id));
      return;
    }
    if (type === 'affair') {
      setPoliticsTab('affairs');
      $('#pAffairTag').value = '';
      $('#pAffairPointFilter').value = '';
      renderAffairs();
      focusPoliticsItem('#affairList', id);
      return;
    }
    if (type === 'framework') {
      setPoliticsTab('frameworks');
      $('#pFrameworkType').value = '';
      renderFrameworks();
      focusPoliticsItem('#frameworkList', id);
    }
  }

  function focusPoliticsItem(containerSelector, id) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`${containerSelector} [data-id="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('is-flash');
      setTimeout(() => el.classList.remove('is-flash'), 1200);
    });
  }

})();
