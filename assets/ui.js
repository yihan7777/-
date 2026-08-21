(() => {
  'use strict';
  const key = 'ielts-lab-active-page-v1';
  const buttons = [...document.querySelectorAll('[data-page]')];
  const sections = [...document.querySelectorAll('[data-page-section]')];
  const valid = new Set(buttons.map(button => button.dataset.page));

  function activate(page, updateHistory = true, scrollToContent = true) {
    if (!valid.has(page)) page = 'home';
    buttons.forEach(button => {
      const selected = button.dataset.page === page;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      if (selected) button.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
    });
    sections.forEach(section => { section.hidden = section.dataset.pageSection !== page; });
    try { localStorage.setItem(key, page); } catch (_) {}
    if (updateHistory) history.replaceState(null, '', `#${page}`);
    if (scrollToContent) {
      const tabs = document.querySelector('.app-tabs-shell');
      window.scrollTo({top:tabs?.offsetTop || 0, behavior:'smooth'});
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  buttons.forEach(button => button.addEventListener('click', () => activate(button.dataset.page)));
  window.addEventListener('hashchange', () => activate(location.hash.slice(1), false));
  let initial = location.hash.slice(1);
  if (!valid.has(initial)) {
    try { initial = localStorage.getItem(key) || 'home'; } catch (_) { initial = 'home'; }
  }
  activate(initial, false, false);
})();
