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
    view: 'overview',
    entryCause: null,
    entryImage: null,
    entryPreviewUrl: null,
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

  function renderCauses(container, selected) {
    container.innerHTML = state.causes.map((cause) => (
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
    if (!['overview', 'entry', 'list', 'review', 'mastery'].includes(name)) return;
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

    renderCauses($('#entryCauses'), null);
    bindCauseGroup($('#entryCauses'), (cause) => {
      state.entryCause = cause;
    });

    restoreEntrySelection();

    subjectSelect.addEventListener('change', () => {
      setEntrySelection(subjectSelect.value, null, null, true);
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
    state.entryPreviewUrl = URL.createObjectURL(file);
    $('#imagePreview').src = state.entryPreviewUrl;
    $('#imagePreview').hidden = false;
    $('#dropEmpty').hidden = true;
    $('#imageRemove').hidden = false;
    $('#dropzone').classList.add('has-image');
  }

  function clearEntryImage() {
    if (state.entryPreviewUrl) URL.revokeObjectURL(state.entryPreviewUrl);
    state.entryPreviewUrl = null;
    state.entryImage = null;
    $('#imageInput').value = '';
    $('#imagePreview').hidden = true;
    $('#imagePreview').removeAttribute('src');
    $('#dropEmpty').hidden = false;
    $('#imageRemove').hidden = true;
    $('#dropzone').classList.remove('has-image');
  }

  async function submitEntry(event) {
    event.preventDefault();
    const content = $('#entryContent').value.trim();
    if (!state.entryCause) {
      toast('先选一个错因标签', 'error');
      return;
    }
    if (!content && !state.entryImage) {
      toast('填写题目文字或上传照片', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('subject', $('#entrySubject').value);
    formData.append('chapter_id', $('#entryChapter').value);
    if ($('#entrySection').value) formData.append('section_id', $('#entrySection').value);
    formData.append('cause', state.entryCause);
    formData.append('content', content);
    formData.append('source', $('#entrySource').value.trim());
    formData.append('my_answer', $('#entryMyAnswer').value.trim());
    formData.append('correct_answer', $('#entryCorrectAnswer').value.trim());
    if (state.entryImage) formData.append('image', state.entryImage, state.entryImage.name);

    const button = $('#saveBtn');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = '保存中…';

    try {
      await api('/api/questions', { method: 'POST', body: formData });
      $('#entryContent').value = '';
      $('#entrySource').value = '';
      $('#entryMyAnswer').value = '';
      $('#entryCorrectAnswer').value = '';
      clearEntryImage();
      state.entryCause = null;
      renderCauses($('#entryCauses'), null);
      saveLastEntry();
      state.listLoaded = false;
      toast('已记入错题本，继续保持。');
      refreshOverview();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  /* ---------------- 错题本 ---------------- */

  function initList() {
    const subjectSelect = $('#filterSubject');
    subjectSelect.innerHTML = '<option value="">全部科目</option>' + state.subjects.map((subject) => (
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
    const section = question.section_title || '未细分小节';
    $('#detailEyebrow').textContent = `${question.subject} · ${section}`;
    $('#detailTitle').textContent = question.chapter_title;

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

    $('#detailMeta').innerHTML = [
      ['来源', question.source || '未填写'],
      ['错因', question.cause],
      ['录入时间', fmtFull(question.created_at)],
      ['上次复习', question.last_review_at ? fmtFull(question.last_review_at) : '尚未复习'],
      ['复习次数', `${question.review_count} 次`],
      ['当前状态', question.status === 'mastered' ? '已掌握' : '未掌握'],
    ].map(([label, value]) => (
      `<div><dt>${esc(label)}</dt><dd title="${esc(value)}">${esc(value)}</dd></div>`
    )).join('');

    const subject = getSubject(question.subject);
    $('#detailChapter').innerHTML = (subject ? subject.chapters : []).map((chapter) => (
      `<option value="${chapter.id}">${esc(chapter.title)}</option>`
    )).join('');
    $('#detailChapter').value = String(question.chapter_id);
    populateDetailSections(question.chapter_id, question.section_id);
    renderCauses($('#detailCauses'), question.cause);
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
    const button = $('#detailSave');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = '保存中…';
    try {
      await api(`/api/questions/${state.detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: chapterId,
          section_id: sectionValue ? Number(sectionValue) : null,
          cause: state.detailCause,
        }),
      });
      toast('分类已更新');
      closeDetail();
      state.listLoaded = false;
      state.mastery = null;
      refreshList();
      refreshOverview();
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
})();
