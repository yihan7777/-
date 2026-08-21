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
    'P4-004': {title:'Public Monument Assignment', image:'public-monument.webp', summary:'本篇围绕一项公共纪念碑设计作业展开。学生需要进行规划和分析，展示设计与制作技能，选择材料并控制成本，同时考虑气候、周围环境、社会影响以及纪念碑带给公众的情感体验。', labels:[['success',51,25],['social',46,54],['planning',11,15],['skills',12,45],['materials',88,17],['analysis',88,45],['cost',11,81],['climate',53,82],['emotional',89,82],['environment',65,50]]},
    'P4-005': {title:'Sea Lion Tracking', image:'sea-lion-tracking.webp', summary:'本篇介绍研究人员如何追踪海狮。他们需要关注海洋中的鲨鱼和意外风险，用安全颜料做标记，并借助直升机、轨迹图和岩石地形识别活动模式；部分海狮还会进入动物园接受照护，研究结果也会向公众展示。', labels:[['sharks',13,18],['ocean',51,54],['accidents',32,17],['paint',52,48],['helicopter',69,16],['pattern',82,55],['rocks',86,34],['diagram',17,53],['zoos',14,84],['public',88,84]]},
    'P4-006': {title:'The White-lipped Grove Snail', image:'grove-snail.webp', summary:'本篇介绍白唇林蜗牛的栖息环境、食物和研究采样，并说明它与人类贸易传播的关系。蜗牛生活在植物、土壤、树木或洞穴附近，可能随船只和贸易品迁移；研究者会采集样本，同时观察盐分等环境因素。', labels:[['plants',18,23],['soil',12,51],['collection',17,78],['salt',50,87],['cave',45,26],['food',70,79],['trade',74,53],['boats',82,25],['sample',92,77],['tree',92,13]]},
    'P4-007': {title:'Improving the Local Hospital Survey', image:'local-hospital.webp', summary:'本篇围绕改善当地医院服务的调查展开，内容包括病人交通、病房清洁、信息提供、社区与公众参与、医患沟通、睡眠环境、塑料医疗用品和员工培训，并讨论用奖励鼓励参与。', labels:[['transport',13,18],['clean',32,18],['information',57,18],['community',85,18],['reward',14,51],['public',86,51],['communication',14,82],['sleep',42,82],['plastic',65,82],['training',88,82]]},
    'P4-008': {title:'The Seahorse', image:'seahorse.webp', summary:'本篇介绍海马的栖息地、身体结构、食物与生存威胁。海马生活在浅水海草区，身体有骨板和冠状突起，以小虾为食；盐度和海流会影响它们，而捕鱼、压力及疾病都会带来风险。', labels:[['shallow',17,17],['grass',15,45],['plates',67,17],['crown',87,18],['shrimp',69,47],['salt',88,48],['currents',17,78],['fishing',35,79],['stress',60,78],['disease',86,78]]},
    'P4-009': {title:'19th Century British Photographers', image:'british-photographers.webp', summary:'本篇回顾19世纪英国摄影师的创作。摄影题材包括肖像、家庭、城堡、诗人与农业生活，作品常借助道具表达象征意义；同时还会讨论相机对焦、冲印方式、不同摄影方法及最终画面质量。', labels:[['portraits',15,18],['castle',49,14],['family',85,18],['symbolism',14,47],['prints',87,49],['poet',14,81],['focus',35,82],['farming',55,48],['quality',57,82],['methods',86,82]]},
    'P4-010': {title:'Ingmar Bergman: Film Director', image:'ingmar-bergman.webp', summary:'本篇介绍电影导演英格玛·伯格曼的创作特点。他通过演员、光线和画面纵深呈现强烈情感与创作目的，作品经常探索语言、神话、梦境和家庭关系，并表现人物最终面对或接受现实。', labels:[['depth',16,16],['actors',83,16],['light',16,40],['emotion',84,39],['purpose',50,27],['words',16,64],['myth',84,63],['dreams',16,86],['Family',50,86],['accept',84,86]]}
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
