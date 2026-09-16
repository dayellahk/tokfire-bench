/* Progressive enhancement: no network, tracking, or benchmark simulation. */
(()=>{
 if(window.__tokfireCyber)return;
 window.__tokfireCyber=true;
 const start=()=>{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  const cards='.why-grid article,.pick-card,.workflow-grid article,.guide-card,.download-grid a,.fit-overview>div';
  const seen=new WeakSet();
  let paused=false;try{paused=localStorage.getItem('tokfire-motion')==='off';}catch{}
  const motionOff=()=>paused||reduced.matches;
  const syncMotion=()=>{
   document.documentElement.dataset.motion=motionOff()?'off':'on';
   document.querySelectorAll('[data-cyber-motion]').forEach(button=>{button.setAttribute('aria-pressed',String(paused));button.disabled=reduced.matches;});
   document.querySelectorAll('.core-wires').forEach(svg=>{if(motionOff())svg.pauseAnimations();else svg.unpauseAnimations();});
   if(motionOff())document.querySelectorAll('.cyber-pending').forEach(el=>el.classList.remove('cyber-pending'));
  };
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>entries.forEach(entry=>{
   if(entry.isIntersecting){entry.target.classList.remove('cyber-pending');entry.target.classList.add('cyber-visible');observer.unobserve(entry.target);}
  }),{threshold:0.08}):null;
  const enhance=()=>{
   document.querySelectorAll(cards).forEach(el=>{
    if(seen.has(el))return;seen.add(el);el.classList.add('cyber-card');
    if(observer&&!motionOff()&&el.getBoundingClientRect().top>innerHeight){el.classList.add('cyber-pending');observer.observe(el);}
   });
   syncMotion();
  };
  let scheduled=false;
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});};
  enhance();
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  reduced.addEventListener('change',()=>{document.querySelectorAll('.cyber-pending').forEach(el=>el.classList.remove('cyber-pending'));enhance();});
  let target=null,point=null,frame=0;
  document.addEventListener('pointermove',event=>{
   if(!fine.matches||motionOff())return;
   const card=event.target.closest?.('.cyber-card');
   if(!card)return;target=card;point={x:event.clientX,y:event.clientY};
   if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!target?.isConnected)return;const r=target.getBoundingClientRect();target.style.setProperty('--spot-x',(point.x-r.x)+'px');target.style.setProperty('--spot-y',(point.y-r.y)+'px');});
  },{passive:true});
  document.addEventListener('click',event=>{
   const toggle=event.target.closest?.('[data-cyber-motion]');
   if(toggle){paused=!paused;try{localStorage.setItem('tokfire-motion',paused?'off':'on');}catch{}syncMotion();return;}
   const button=event.target.closest?.('[data-cyber-job]');if(!button)return;
   const core=button.closest('[data-cyber-core]');const count=button.dataset.cyberJob;
   if(!core||!['1','2','3'].includes(count))return;
   core.dataset.jobs=count;
   core.querySelectorAll('[data-cyber-job]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   core.querySelector('[data-cyber-count]').textContent=count;
   core.querySelector('.core-topline>span:last-child').textContent='0'+count+' / 03';
  });
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
