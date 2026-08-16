(() => {
  'use strict';
  const panel = document.querySelector('#dictationMnemonic');
  const select = document.querySelector('#dictationArticle');
  const canvas = document.querySelector('#mnemonicCanvas');
  const subtitle = document.querySelector('#mnemonicSubtitle');
  const summary = document.querySelector('#mnemonicChineseSummary');
  if (!panel || !select || !canvas) return;
  const scenes = {
    'P4-001': {title:'Surtsey Island', image:'surtsey-island.webp', summary:'本篇介绍冰岛火山岛 Surtsey 的形成与生态演变：火山喷发和烟雾过后，花草、细菌等生物逐渐进入岛上；研究人员通过化石、无线电设备和附近房屋持续观察这座后来进入休眠状态的火山岛。', labels:[['volcano',15,18],['smoke',52,17],['flower',11,82],['grass',55,77],['bacteria',89,54],['carpet',27,66],['fossils',89,86],['radio',72,53],['houses',43,63],['dormant',82,23]]},
    'P4-002': {title:'New York Library Introduction', image:'new-york-library.webp', summary:'本篇介绍纽约图书馆的馆藏和公共服务。馆内不仅保存音乐、照片、报纸及劳工史资料，还设有展览、口述历史录音、公众课程，并涉及借阅证件办理和保险等实用信息。', labels:[['music',10,20],['photographs',30,23],['exhibition',49,26],['oral',68,26],['public',86,24],['course',12,69],['labour',34,68],['identification',55,69],['insurance',70,70],['newspapers',90,72]]},
    'P4-003': {title:'Fossil', image:'fossil.webp', summary:'本篇讲解化石如何在矿物土壤和沉积层中形成、埋藏与保存，并介绍野外采集和博物馆研究方法，例如测量岩石、拍照、使用柔软工具，以及小心处理昂贵而脆弱的标本。', labels:[['trace',12,52],['buried',25,57],['mineral soil',36,42],['exhibitions',76,23],['expensive',63,35],['tape measure',28,87],['rocks',13,83],['take photos',25,16],['soft',52,86],['sediment',39,55],['delicate',80,78]]},
    'P4-004': {title:'Public Monument Assignment', image:'public-monument.webp', summary:'本篇围绕一项公共纪念碑设计作业展开。学生需要进行规划和分析，展示设计与制作技能，选择材料并控制成本，同时考虑气候、周围环境、社会影响以及纪念碑带给公众的情感体验。', labels:[['success',51,25],['social',46,54],['planning',11,15],['skills',12,45],['materials',88,17],['analysis',88,45],['cost',11,81],['climate',53,82],['emotional',89,82],['environment',65,50]]}
  };
  let activeId = '';
  function loadImage() {
    const image = panel.querySelector('img[data-src]');
    if (image && !image.getAttribute('src')) image.src = image.dataset.src;
  }
  function render(scene, id) {
    if (activeId === id) return;
    activeId = id;
    subtitle.textContent = `${scene.title} · 用场景位置记住${scene.labels.length}个答案词`;
    summary.textContent = scene.summary;
    canvas.innerHTML = `<img data-src="assets/mnemonics/${scene.image}" alt="${scene.title} 主题答案词视觉记忆图">` + scene.labels.map(([word,x,y]) => `<i style="--x:${x}%;--y:${y}%">${word}</i>`).join('');
    if (panel.open) loadImage();
  }
  function update() {
    const scene = scenes[select.value];
    panel.hidden = select.disabled || !scene;
    if (panel.hidden) panel.open = false;
    else render(scene, select.value);
  }
  panel.addEventListener('toggle', () => { if (panel.open) loadImage(); });
  select.addEventListener('change', update);
  new MutationObserver(update).observe(select, {childList:true, attributes:true, attributeFilter:['disabled']});
  update();
})();
