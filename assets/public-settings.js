(() => {
  'use strict';

  const KEY = 'ielts-public-settings-v1';
  const MODULES = [
    ['speaking', '口语'],
    ['vocabulary', '词汇'],
    ['writing', '作文'],
    ['listening-hub', '听力'],
    ['reading', '阅读'],
    ['plan', '计划']
  ];
  const DEFAULTS = {
    siteName: '雅思考神小助手',
    examDate: '',
    targetOverall: '7.0',
    targetListening: '7.0',
    targetReading: '7.0',
    targetWriting: '6.5',
    targetSpeaking: '6.5',
    theme: 'honey',
    compact: false,
    hiddenModules: [],
    focus: ['listening-hub', 'writing']
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch (_) { return { ...DEFAULTS }; }
  }

  function save(next) {
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  let settings = load();

  function daysUntil(dateValue) {
    if (!dateValue) return null;
    const target = new Date(dateValue + 'T00:00:00');
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86400000);
  }

  function phaseText(days) {
    if (days == null) return '设置考试日期';
    if (days < 0) return '考试已结束，可改下一场';
    if (days === 0) return '今天考试';
    if (days <= 7) return '考前冲刺';
    if (days <= 21) return '强化提分';
    return '系统备考';
  }

  function moduleName(id) {
    return MODULES.find(item => item[0] === id)?.[1] || id;
  }

  function visibleFocus() {
    const hidden = new Set(settings.hiddenModules || []);
    const focus = (settings.focus || []).filter(item => !hidden.has(item));
    return focus.length ? focus : MODULES.map(item => item[0]).filter(item => !hidden.has(item)).slice(0, 2);
  }

  function applySettings() {
    const name = settings.siteName || DEFAULTS.siteName;
    document.title = name;
    document.body.dataset.publicTheme = settings.theme || 'honey';
    document.body.classList.toggle('public-compact', Boolean(settings.compact));

    MODULES.forEach(([id]) => {
      document.body.dataset['hide' + id.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())] = String((settings.hiddenModules || []).includes(id));
    });

    $$('.brand,.app-topbar-title strong,.app-drawer-profile b,footer span').forEach(node => { node.textContent = name; });
    $$('.app-topbar-title small').forEach(node => { node.textContent = 'IELTS ASSISTANT'; });
    const note = $('.hero-note');
    if (note) note.textContent = 'IELTS STUDY ASSISTANT';

    const days = daysUntil(settings.examDate);
    const daysLeft = $('#daysLeft');
    if (daysLeft) daysLeft.textContent = days == null ? '设置' : Math.max(0, days);
    const phase = $('#phase');
    if (phase) phase.textContent = phaseText(days);
    const newCount = $('#newCount');
    if (newCount) newCount.textContent = visibleFocus().map(moduleName).join(' / ') || '自由安排';
    const reviewCount = $('#reviewCount');
    if (reviewCount) reviewCount.textContent = `目标 ${settings.targetOverall || '7.0'}`;
    const minutes = $('#minutes');
    if (minutes) minutes.textContent = settings.compact ? '简洁' : '可调整';
    const todayDate = $('#todayDate');
    if (todayDate) todayDate.textContent = formatToday();

    const lead = $('.hero .lead');
    if (lead) {
      const examText = settings.examDate
        ? `距离考试 ${Math.max(0, days ?? 0)} 天`
        : '先设置考试日期';
      lead.textContent = `${examText} · 目标总分 ${settings.targetOverall || '7.0'} · 薄弱板块：${visibleFocus().map(moduleName).join('、') || '未设置'}。`;
    }

    renderPublicPlan(days);
    renderHomeTasks(days);
    syncForm();
  }

  function formatToday() {
    const date = new Date();
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function fillList(selector, rows) {
    const host = $(selector);
    if (!host) return;
    host.innerHTML = `<ul>${rows.map(row => `<li>${row}</li>`).join('')}</ul>`;
  }

  function renderHomeTasks(days) {
    const cards = $$('.task-card');
    if (cards[0]) {
      cards[0].querySelector('h3').textContent = '今日重点';
      fillList('#part1Tasks', visibleFocus().map(id => `优先练 ${moduleName(id)}`));
    }
    if (cards[1]) {
      cards[1].querySelector('h3').textContent = '真题训练';
      fillList('#newTasks', [
        days != null && days <= 14 ? '考前按整套题计时训练' : '按薄弱项选择一组练习',
        `目标总分 ${settings.targetOverall || '7.0'}`
      ]);
    }
    if (cards[2]) {
      cards[2].querySelector('h3').textContent = '错题复盘';
      fillList('#reviewTasks', ['查看做题记录', '整理错因和下次提醒', '把不熟表达加入卡片']);
    }
    const mockTask = $('#mockTask');
    if (cards[3]) cards[3].querySelector('h3').textContent = '记忆卡抽查';
    if (mockTask) mockTask.textContent = '从听力、阅读、口语或作文卡片中随机抽查，没熟的卡片会提高后续出现频率。';
    $$('.today .actions').forEach(node => { node.hidden = true; });
  }

  function renderPublicPlan(days) {
    const host = $('#publicPlan');
    if (!host) return;
    const focus = visibleFocus();
    const first = focus[0] || 'listening-hub';
    const second = focus[1] || 'reading';
    const cards = [
      ['今日重点', `${moduleName(first)} + ${moduleName(second)}`],
      ['复盘节奏', days != null && days <= 14 ? '错题当天复盘，次日再看' : 'D+1 / D+3 / D+7 复习'],
      ['建议模式', settings.compact ? '简洁模式，隐藏说明文字' : '完整模式，保留说明与记录']
    ];
    host.replaceChildren(...cards.map(([label, value]) => {
      const article = document.createElement('article');
      article.innerHTML = `<span>${label}</span><b>${value}</b>`;
      return article;
    }));
  }

  function syncForm() {
    const root = $('#publicSettings');
    if (!root) return;
    root.querySelector('[name="siteName"]').value = settings.siteName || DEFAULTS.siteName;
    root.querySelector('[name="examDate"]').value = settings.examDate || '';
    root.querySelector('[name="targetOverall"]').value = settings.targetOverall || '';
    root.querySelector('[name="targetListening"]').value = settings.targetListening || '';
    root.querySelector('[name="targetReading"]').value = settings.targetReading || '';
    root.querySelector('[name="targetWriting"]').value = settings.targetWriting || '';
    root.querySelector('[name="targetSpeaking"]').value = settings.targetSpeaking || '';
    root.querySelector('[name="compact"]').checked = Boolean(settings.compact);
    root.querySelectorAll('[data-public-theme]').forEach(button => {
      const selected = button.dataset.publicTheme === (settings.theme || 'honey');
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    root.querySelectorAll('[data-public-module]').forEach(input => {
      input.checked = !(settings.hiddenModules || []).includes(input.dataset.publicModule);
    });
    root.querySelectorAll('[data-public-focus]').forEach(input => {
      input.checked = (settings.focus || []).includes(input.dataset.publicFocus);
    });
  }

  function buildSettingsPanel() {
    if ($('#publicSettings')) return;
    const stats = $('.stats');
    if (!stats) return;
    const panel = document.createElement('details');
    panel.className = 'public-settings';
    panel.id = 'publicSettings';
    panel.setAttribute('data-page-section', 'home');
    panel.innerHTML = `
      <summary>
        <div><b>个性化设置</b><small>考试日期、目标分、主题色、显示板块</small></div>
        <span>点击展开</span>
      </summary>
      <div class="public-settings-grid">
        <section class="public-settings-card public-settings-main">
          <h3>我的备考</h3>
          <div class="public-field-grid">
            <label>网站名称<input name="siteName" maxlength="18"></label>
            <label>考试日期<input name="examDate" type="date"></label>
            <label>目标总分<input name="targetOverall" inputmode="decimal" placeholder="7.0"></label>
          </div>
          <div class="public-score-grid">
            <label>听力<input name="targetListening" inputmode="decimal"></label>
            <label>阅读<input name="targetReading" inputmode="decimal"></label>
            <label>写作<input name="targetWriting" inputmode="decimal"></label>
            <label>口语<input name="targetSpeaking" inputmode="decimal"></label>
          </div>
        </section>
        <section class="public-settings-card public-settings-options">
          <h3>显示方式</h3>
          <div class="public-choice-row">
            <button type="button" data-public-theme="honey">暖黄</button>
            <button type="button" data-public-theme="matcha">抹茶绿</button>
            <button type="button" data-public-theme="ocean">海盐蓝</button>
          </div>
          <label class="public-inline-check"><input name="compact" type="checkbox"> 简洁模式</label>
          <div class="public-plan" id="publicPlan"></div>
          <h3>显示板块</h3>
          <div class="public-module-list">
            ${MODULES.map(([id, label]) => `<label><input type="checkbox" data-public-module="${id}"> ${label}</label>`).join('')}
          </div>
          <h3>薄弱板块</h3>
          <div class="public-focus-tags">
            ${MODULES.filter(([id]) => id !== 'plan').map(([id, label]) => `<label><input type="checkbox" data-public-focus="${id}"> ${label}</label>`).join('')}
          </div>
        </section>
      </div>
    `;
    stats.insertAdjacentElement('afterend', panel);
  }

  function bindEvents() {
    const root = $('#publicSettings');
    if (!root) return;
    root.addEventListener('input', event => {
      const target = event.target;
      if (!target.name) return;
      if (target.name === 'compact') settings.compact = target.checked;
      else settings[target.name] = target.value.trim();
      save(settings);
      applySettings();
    });
    root.addEventListener('change', event => {
      const target = event.target;
      if (target.matches('[data-public-module]')) {
        const hidden = new Set(settings.hiddenModules || []);
        if (target.checked) hidden.delete(target.dataset.publicModule);
        else hidden.add(target.dataset.publicModule);
        settings.hiddenModules = [...hidden];
      }
      if (target.matches('[data-public-focus]')) {
        const focus = new Set(settings.focus || []);
        if (target.checked) focus.add(target.dataset.publicFocus);
        else focus.delete(target.dataset.publicFocus);
        settings.focus = [...focus];
      }
      save(settings);
      applySettings();
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-public-theme]');
      if (!button) return;
      settings.theme = button.dataset.publicTheme;
      save(settings);
      applySettings();
    });
  }

  function init() {
    buildSettingsPanel();
    bindEvents();
    applySettings();
    [120, 500, 1200, 2600].forEach(delay => window.setTimeout(applySettings, delay));
    window.addEventListener('load', () => window.setTimeout(applySettings, 0));
    window.addEventListener('ielts-review-data-changed', () => window.setTimeout(applySettings, 0));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
