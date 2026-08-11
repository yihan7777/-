const $ = s => document.querySelector(s);
const fmt = d => new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',weekday:'short'}).format(new Date(d+'T12:00:00'));
const list = (items, empty='今天无此项') => items.length ? `<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>` : `<p>${empty}</p>`;

Promise.all(['data/plan.json','data/topics.json','data/part1.json','data/progress.json','data/vocabulary.json'].map(x=>fetch(x).then(r=>r.json()))).then(([plan,topics,part1,progress,vocabulary])=>{
  const todayISO = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  const today = plan.days.find(d=>d.date===todayISO) || plan.days.find(d=>d.date>=todayISO) || plan.days.at(-1);
  const topicMap = Object.fromEntries(topics.map(t=>[t.id,t]));
  const p1Map = Object.fromEntries(part1.map(t=>[t.id,t]));
  const exam = new Date(plan.exam_date+'T12:00:00+08:00');
  const now = new Date();
  $('#daysLeft').textContent = Math.max(0,Math.ceil((exam-now)/86400000));
  $('#phase').textContent = today.phase;
  $('#minutes').textContent = `${today.minutes} 分钟`;
  $('#newCount').textContent = `${today.new_part2.length} 题`;
  $('#reviewCount').textContent = `${today.review_part2.length} 题`;
  $('#todayDate').textContent = fmt(today.date);
  $('#part1Tasks').innerHTML = list(today.part1.map(id=>p1Map[id].title));
  $('#newTasks').innerHTML = list(today.new_part2.map(id=>topicMap[id].title_zh),'今天不加新题');
  $('#reviewTasks').innerHTML = list(today.review_part2.map(id=>topicMap[id].title_zh),'今天没有到期复习');
  $('#mockTask').textContent = today.mock ? '完整完成 Part 1 + Part 2 + Part 3 模考，严格计时并提交反馈。' : '按今日 Context 开始 ChatGPT Live；结束后提交评分、纠错和下一步。';
  $('#feedbackLink').href = 'https://github.com/yihan7777/-/issues/new?template=speaking-feedback.yml';

  const clusterMeta = {};
  topics.forEach(t=>{ clusterMeta[t.cluster] ||= {name:t.cluster_name,anchor:t.anchor,count:0}; clusterMeta[t.cluster].count++; });
  $('#clusterGrid').innerHTML = Object.entries(clusterMeta).map(([k,c])=>`<article class="cluster"><span class="letter">${k}</span><h3>${c.name}</h3><p>${c.anchor}</p><small>${c.count} 道题共用</small></article>`).join('');
  $('#timeline').innerHTML = plan.days.map(d=>`<article class="day ${d.date===today.date?'today':''}"><span class="date">${fmt(d.date).replace('星期','周')}</span><div class="dots">${d.new_part2.length?'<i class="dot new"></i>':''}${d.review_part2.length?'<i class="dot review"></i>':''}${d.mock?'<i class="dot mock"></i>':''}</div><small>${d.phase}<br>${d.minutes} min</small></article>`).join('');

  const filters = ['ALL',...Object.keys(clusterMeta)]; let active='ALL';
  $('#filters').innerHTML = filters.map(x=>`<button class="filter ${x==='ALL'?'active':''}" data-filter="${x}">${x==='ALL'?'全部':x+' · '+clusterMeta[x].name}</button>`).join('');
  function render(){const q=$('#search').value.toLowerCase(); const rows=topics.filter(t=>(active==='ALL'||t.cluster===active)&&(`${t.title_zh} ${t.cue}`.toLowerCase().includes(q))); $('#topicList').innerHTML=rows.map(t=>`<article class="topic"><code>${t.id} · ${t.cluster}</code><h3>${t.title_zh}</h3><p>${t.cue}</p><details><summary>查看 Part 3</summary>${list(t.part3.slice(0,8))}</details></article>`).join('')||'<p>没有匹配题目。</p>'}
  $('#filters').addEventListener('click',e=>{if(!e.target.dataset.filter)return;active=e.target.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===e.target));render()});
  $('#search').addEventListener('input',render); render();

  const STORAGE='ielts-speaking-vocabulary-v1';
  let memoryState=JSON.parse(localStorage.getItem(STORAGE)||'{}'), deck='全部', queue=[], initial=0, reviewed=0, current=null;
  const categories=['全部',...new Set(vocabulary.map(c=>c.category))];
  $('#deckFilters').innerHTML=categories.map(c=>`<button class="deck-filter ${c==='全部'?'active':''}" data-deck="${c}">${c}</button>`).join('');
  const inDeck=c=>deck==='全部'||c.category===deck;
  const due=c=>(memoryState[c.id]?.due||0)<=Date.now();
  function saveMemory(){localStorage.setItem(STORAGE,JSON.stringify(memoryState))}
  function buildQueue(){queue=vocabulary.filter(c=>inDeck(c)&&due(c));if(!queue.length)queue=vocabulary.filter(inDeck).sort((a,b)=>(memoryState[a.id]?.due||0)-(memoryState[b.id]?.due||0)).slice(0,5);initial=queue.length;reviewed=0;showNext()}
  function showNext(){current=queue.shift();const card=$('#flashcard');card.classList.remove('flipped');$('#rating').classList.remove('ready');if(!current){$('#cardFront').textContent='今天完成了！';$('#cardMeaning').textContent='';$('#cardExample').textContent='';$('#cardNote').textContent='';$('#cardTag').textContent='完成';$('#dueCards').textContent='0';$('#memoryStatus').textContent=`本轮复习 ${reviewed} 张，明天继续。`;$('#memoryBar').style.width='100%';return}$('#cardFront').textContent=current.front;$('#cardMeaning').textContent=current.meaning;$('#cardExample').textContent=current.example;$('#cardNote').textContent=current.note;$('#cardTag').textContent=current.category;$('#dueCards').textContent=queue.length+1;$('#cardCounter').textContent=`本轮 ${reviewed+1} / ${Math.max(initial,reviewed+queue.length+1)}`;$('#memoryStatus').textContent='先说出中文意思，再点击卡片翻面。';$('#memoryBar').style.width=`${Math.min(100,reviewed/Math.max(1,initial)*100)}%`}
  $('#flashcard').addEventListener('click',()=>{if(!current)return;$('#flashcard').classList.toggle('flipped');$('#rating').classList.toggle('ready',$('#flashcard').classList.contains('flipped'))});
  $('#rating').addEventListener('click',e=>{const btn=e.target.closest('[data-grade]');if(!btn||!current||!$('#rating').classList.contains('ready'))return;const grade=btn.dataset.grade,old=memoryState[current.id]||{interval:0,reps:0};let delay=0,interval=old.interval;if(grade==='again'){old.reps=0;queue.splice(Math.min(3,queue.length),0,current)}if(grade==='hard'){delay=10*60*1000;interval=Math.max(.01,old.interval*.7)}if(grade==='good'){interval=old.interval?Math.max(1,old.interval*2):1;delay=interval*86400000;old.reps++}if(grade==='easy'){interval=old.interval?Math.max(4,old.interval*2.5):4;delay=interval*86400000;old.reps++}memoryState[current.id]={due:Date.now()+delay,interval,reps:old.reps,lastGrade:grade};saveMemory();reviewed++;showNext()});
  $('#speakCard').addEventListener('click',()=>{if(!current)return;const u=new SpeechSynthesisUtterance(current.front.replace(/\/.*?\//g,''));u.lang='en-GB';u.rate=.82;speechSynthesis.cancel();speechSynthesis.speak(u)});
  $('#deckFilters').addEventListener('click',e=>{if(!e.target.dataset.deck)return;deck=e.target.dataset.deck;document.querySelectorAll('.deck-filter').forEach(x=>x.classList.toggle('active',x===e.target));buildQueue()});
  $('#resetMemory').addEventListener('click',()=>{if(!confirm(`重新学习“${deck}”中的卡片吗？`))return;vocabulary.filter(inDeck).forEach(c=>delete memoryState[c.id]);saveMemory();buildQueue()});
  buildQueue();
}).catch(err=>{document.body.insertAdjacentHTML('afterbegin',`<p style="padding:12px;background:#ff795f">数据加载失败：${err.message}</p>`)});
