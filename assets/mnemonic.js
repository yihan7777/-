(() => {
  'use strict';
  const panel = document.querySelector('#dictationMnemonic');
  const select = document.querySelector('#dictationArticle');
  if (!panel || !select) return;
  function update() {
    panel.hidden = select.disabled || select.value !== 'P4-001';
    if (panel.hidden) panel.open = false;
  }
  panel.addEventListener('toggle', () => {
    if (!panel.open) return;
    const image = panel.querySelector('img[data-src]');
    if (image && !image.src) image.src = image.dataset.src;
  });
  select.addEventListener('change', update);
  new MutationObserver(update).observe(select, {childList:true, attributes:true, attributeFilter:['disabled']});
  update();
})();
