(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const DEFAULT_URL = './reading-web/index.html?view=overview';
  const LINK_KEY = 'ielts-reading-bank-link-v2';

  function setStatus(title, detail) {
    const status = $('#readingPackageStatus');
    if (status) status.innerHTML = '<b>' + title + '</b><small>' + detail + '</small>';
  }

  function openUrl(url) {
    const win = window.open(url, '_blank', 'noopener');
    if (!win) window.location.href = url;
  }

  function init() {
    const openButton = $('#openReadingPackage');
    if (!openButton) return;

    setStatus('在线阅读题库已就绪', '电脑和手机都可直接进入，不需要上传或连接文件夹');
    openButton.disabled = false;
    openButton.onclick = () => openUrl(DEFAULT_URL);

    const input = $('#readingBankLink');
    const saved = localStorage.getItem(LINK_KEY) || '';
    if (input) input.value = saved;

    const save = $('#saveReadingLink');
    if (save) save.onclick = () => {
      const value = (input?.value || '').trim();
      if (value) localStorage.setItem(LINK_KEY, value);
      else localStorage.removeItem(LINK_KEY);
      setStatus('题库地址已保存', value || '已恢复为网站内置阅读题库');
    };

    const open = $('#openReadingLink');
    if (open) open.onclick = () => {
      const value = (input?.value || '').trim();
      openUrl(value || DEFAULT_URL);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();