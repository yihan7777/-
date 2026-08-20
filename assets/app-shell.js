(() => {
  'use strict';
  const pages=[
    ['home','⌂','今日','学习总览'],
    ['speaking','◉','口语','题库、练习与记忆'],
    ['vocabulary','Aa','词汇','记忆卡片'],
    ['writing','✎','作文','模考、批改与复盘'],
    ['listening-hub','♫','听力','真题、精听与分析'],
    ['reading','▤','阅读','真题与背题'],
    ['plan','✓','计划','冲刺安排']
  ];
  const titles=Object.fromEntries(pages.map(x=>[x[0],x]));
  function session(){try{return JSON.parse(localStorage.getItem('ielts-cloud-session-v1')||'null')}catch(_){return null}}
  function init(){
    if(document.querySelector('.app-topbar'))return;
    document.body.insertAdjacentHTML('afterbegin',`
      <header class="app-topbar" aria-label="应用导航">
        <button class="app-menu-button" id="appMenuToggle" aria-label="打开学习板块"></button>
        <div class="app-topbar-title"><small>IELTS LAB</small><strong id="appPageTitle">今日学习</strong></div>
        <button class="app-cloud-avatar" id="appCloudAvatar" aria-label="云端账号">Y</button>
      </header>
      <div class="app-drawer-backdrop" id="appDrawerBackdrop"></div>
      <aside class="app-drawer" id="appDrawer" aria-label="学习板块">
        <div class="app-drawer-profile"><i id="appDrawerAvatar">Y</i><div><b>IELTS Lab</b><span id="appDrawerAccount">点击头像登录云端</span></div></div>
        <nav class="app-drawer-nav">${pages.map(x=>`<button data-app-jump="${x[0]}"><i>${x[1]}</i><span>${x[2]}<small>${x[3]}</small></span><b>›</b></button>`).join('')}</nav>
      </aside>`);
    const desktop=()=>window.matchMedia('(min-width:1180px)').matches;
    const close=()=>{if(!desktop())document.body.classList.remove('app-drawer-open')};
    const applyDesktopState=()=>{
      if(desktop()){
        document.body.classList.remove('app-drawer-open');
        document.body.classList.toggle('app-desktop-drawer-collapsed',localStorage.getItem('ielts-desktop-drawer-collapsed')==='1');
      }else{
        document.body.classList.remove('app-desktop-drawer-collapsed');
      }
    };
    applyDesktopState();
    window.addEventListener('resize',applyDesktopState);
    document.getElementById('appMenuToggle').onclick=()=>{
      if(desktop()){
        const collapsed=document.body.classList.toggle('app-desktop-drawer-collapsed');
        localStorage.setItem('ielts-desktop-drawer-collapsed',collapsed?'1':'0');
      }else document.body.classList.toggle('app-drawer-open');
    };
    document.getElementById('appDrawerBackdrop').onclick=close;
    document.querySelectorAll('[data-app-jump]').forEach(btn=>btn.onclick=()=>{
      const target=document.querySelector(`.app-tabs [data-page="${btn.dataset.appJump}"]`);
      if(target)target.click();
      setPage(btn.dataset.appJump);close();scrollTo({top:0,behavior:'smooth'});
    });
    document.getElementById('appCloudAvatar').onclick=()=>document.getElementById('cloudSyncTrigger')?.click();
    document.getElementById('appDrawerAvatar').onclick=()=>document.getElementById('cloudSyncTrigger')?.click();
    document.addEventListener('click',e=>{
      const tab=e.target.closest?.('.app-tabs [data-page]');
      if(tab)setTimeout(()=>setPage(tab.dataset.page),0);
    });
    updateAccount();
    const active=document.querySelector('.app-tabs [data-page].active')?.dataset.page||'home';setPage(active);
    window.addEventListener('storage',updateAccount);
    setInterval(updateAccount,5000);
  }
  function setPage(page){
    const info=titles[page]||titles.home;
    document.body.dataset.appPage=page;
    const title=document.getElementById('appPageTitle');if(title)title.textContent=info[2];
    document.querySelectorAll('[data-app-jump]').forEach(b=>b.classList.toggle('active',b.dataset.appJump===page));
  }
  function updateAccount(){
    const s=session(),logged=!!s?.access_token,email=s?.user?.email||'';
    const initial=(email||'Y').charAt(0).toUpperCase();
    const avatar=document.getElementById('appCloudAvatar'),drawer=document.getElementById('appDrawerAvatar'),label=document.getElementById('appDrawerAccount');
    if(avatar){avatar.textContent=initial;avatar.classList.toggle('logged-in',logged)}
    if(drawer)drawer.textContent=initial;
    if(label)label.textContent=logged?(email||'云端已连接'):'点击头像登录云端';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();