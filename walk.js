(() => {
  'use strict';
  const progress = document.querySelector('#progress');
  const actor = document.querySelector('.journey-actor');
  const sprite = actor.querySelector('.journey-sprite');
  // A single canvas keeps the previous frame on screen until its replacement is ready.
  const canvas = document.createElement('canvas');
  canvas.width=200; canvas.height=316; canvas.setAttribute('aria-hidden','true');
  sprite.replaceChildren(canvas); sprite.style.backgroundImage='none';
  const context=canvas.getContext('2d'); context.imageSmoothingEnabled=false;
  const buffer=document.createElement('canvas'); buffer.width=200; buffer.height=316;
  const bufferContext=buffer.getContext('2d'); bufferContext.imageSmoothingEnabled=false;
  const toggle = document.querySelector('.motion-toggle');
  const replay = document.querySelector('.action-replay');
  const sections = [...document.querySelectorAll('.chapter'), document.querySelector('.ending')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const assets = {
    front: ['zhou-front-idle.png'],
    turn: [0,1,2,3].map(i=>`zhou-turn-${i}.png`),
    sit: [0,1,2,3].map(i=>`zhou-sit-${i}.png`),
    kungfu: [0,1,2,3].map(i=>`zhou-kungfu-${i}.png`),
    bookEntry: ['zhou-reading-start.png','zhou-reading-mid.png','zhou-reading-0.png'],
    bookLoop: [0,1,2,3,0,0].map(i=>`zhou-reading-${i}.png`),
    point: [0,1,2,3].map(i=>`zhou-point-${i}.png`),
    farewell: [0,1,2,3].map(i=>`zhou-farewell-walk-${i}.png`)
  };
  const fallback = {
    front: ['zhou-turn-3.png'],
    turn: [],
    sit: ['zhou-think-start.png','zhou-think.png'],
    kungfu: ['zhou-practice-start.png','zhou-practice.png'],
    bookEntry: ['zhou-reading-start.png','zhou-reading-0.png'],
    bookLoop: [0,1,2,3].map(i=>`zhou-reading-${i}.png`),
    point: ['zhou-defiant.png'], farewell: ['zhou-farewell.png']
  };
  const loaded = new Set(), settled = new Set(), retainedImages = new Map();
  const files = new Set(['zhou-side-walk.png', ...Object.values(assets).flat(), ...Object.values(fallback).flat()]);
  for (const name of files) {
    const image = new Image();
    retainedImages.set(name, image);
    image.onload = async () => {
      // Decode before treating the frame as ready. Keeping the Image objects
      // alive prevents a walk/turn/action swap from showing an empty frame.
      try { if (image.decode) await image.decode(); } catch (_) { /* loaded image remains usable */ }
      loaded.add(name); settled.add(name); requestTick();
    };
    image.onerror = () => { settled.add(name); requestTick(); };
    image.src = `assets/normalized/${name}`;
  }
  const seq = key => assets[key].every(name => loaded.has(name)) ? assets[key] : fallback[key].filter(name=>loaded.has(name));
  const entryKey = index => index===0 ? 'front' : index===1 ? 'sit' : index===2 ? 'kungfu' : index===3 ? 'bookEntry' : index===4 ? 'point' : null;
  const ready = key => !key || (assets[key].every(name=>loaded.has(name)) || (assets[key].every(name=>settled.has(name)) && fallback[key].every(name=>settled.has(name))));
  const entry = index => entryKey(index) ? seq(entryKey(index)) : [];
  let enabled = !reduced.matches;
  let raf=0, lastTime=0, x=null, y=null, facingRight=false, active=null, desired=0;
  let state='hidden', elapsed=0, walkTime=0, loopTime=0;
  let lastKind='', lastFile='', exitFrames=[];
  const walkSpeed=220, exitRate=6, walkRate=8;
  const entryRate = index => index===0 || index===1 || index===4 ? 3.2 : 5.5;
  function requestTick(){ if(!raf) raf=requestAnimationFrame(tick); }
  function dimensions(){
    return sections.map((section, i) => {
      const head=section.querySelector('.chapter-head') || section.querySelector('.end-content');
      const bounds=head.getBoundingClientRect();
      const inner=section.querySelector('.chapter-inner');
      const box=inner && inner.getBoundingClientRect();
      const endSprite=section.querySelector('.end-sprite');
      const px=i===5 ? (innerWidth-actor.offsetWidth)/2 : (i%2===0 ? box.right-actor.offsetWidth : box.left);
      const py=i===5 ? Math.max(innerHeight*.26,Math.min(innerHeight*.6,endSprite.getBoundingClientRect().bottom-actor.offsetHeight*.75)) : innerHeight*([.28,.50,.28,.50,.28][i]);
      return {docY:scrollY+bounds.top, x:px, y:py};
    });
  }
  function getScene(){
    const points=dimensions(), position=scrollY+innerHeight*.60;
    progress.style.width=(100*scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight))+'%';
    const visible=position>=points[0].docY-innerHeight*.20;
    let index=0;
    for(let i=1;i<points.length;i++) if(position>=points[i].docY) index=i;
    return {points,index,visible};
  }
  function transition(next){state=next;elapsed=0;}
  function show(file,kind,frame=0){
    if(!file || !loaded.has(file)) return;
    const image=retainedImages.get(file), walking=kind==='walk';
    if(!image || !image.naturalWidth || !image.naturalHeight) return;
    // Draw into an off-screen canvas first; present complete frames in one paint.
    bufferContext.clearRect(0,0,200,316);
    if(walking){
      const frameWidth=image.naturalWidth/4;
      bufferContext.drawImage(image,frame*frameWidth,0,frameWidth,image.naturalHeight,0,0,200,316);
    } else {
      bufferContext.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,0,0,200,316);
    }
    context.clearRect(0,0,200,316); context.drawImage(buffer,0,0);
    actor.dataset.pose=kind;
    actor.classList.toggle('face-right',(walking || kind==='turn') && facingRight);
    lastKind=kind;lastFile=file;
  }
  function loopFrame(index,now){
    if(index===0){const frames=seq('front');show(frames[0]||'zhou-turn-3.png','standing');return;}
    if(index===1){const frames=seq('sit');show(frames[frames.length-1]||'zhou-think.png','think');return;}
    if(index===2){const frames=seq('kungfu'); const ping=frames.slice().reverse().concat(frames.slice(1,-1));show(ping[Math.floor(loopTime*3)%ping.length]||'zhou-practice.png','practice');return;}
    if(index===3){const frames=seq('bookLoop');show(frames[Math.floor(loopTime*3)%frames.length]||'zhou-reading-0.png','reading');return;}
    if(index===4){const frames=seq('point');show(frames[frames.length-1]||'zhou-defiant.png','defiant');return;}
    const frames=seq('farewell'); show(frames[Math.floor(loopTime*6)%frames.length]||'zhou-farewell.png','farewell');
  }
  function tick(now){
    raf=0;
    const dt=lastTime ? Math.min(.05,Math.max(0,(now-lastTime)/1000)):0;
    lastTime=now;
    const scene=getScene(); desired=scene.index;
    actor.style.visibility=scene.visible?'visible':'hidden';
    if(!scene.visible){state='hidden';active=null;x=y=null;replay.disabled=true;lastTime=0;return;}
    if(active===null){ active=desired; x=scene.points[active].x; y=scene.points[active].y; transition(active>=0&&active<5?'enter':'loop'); }
    if(!enabled){actor.style.display='none';replay.disabled=true;lastTime=0;return;}
    actor.style.display='';
    if(state==='loop' && desired!==active) {
      const start=entry(active);
      const current=start.indexOf(lastFile);
      if(active===2 && current>=0) exitFrames=start.slice(0,current+1).reverse();
      else if(active===3){const pages=seq('bookLoop');const n=pages.indexOf(lastFile);exitFrames=(n>=0?pages.slice(n,4):[]).concat(start.slice().reverse());}
      else exitFrames=start.slice().reverse();
      transition(active>=0&&active<5?'exit':'travel');
    }
    if(state==='exit' || state==='replay-exit'){
      // Finish standing up / putting the book away before walking.
      const replaying=state==='replay-exit';
      let frames=exitFrames; elapsed+=dt;
      if(!frames.length || elapsed>=frames.length/exitRate){if(replaying){transition('enter');}else{facingRight=scene.points[desired].x>x;transition('turn-out');}}
      else show(frames[Math.min(frames.length-1,Math.floor(elapsed*exitRate))], ['standing','think','practice','reading','defiant'][active]);
    }
    let waiting=false;
    if(state==='turn-out' && !ready('turn')) waiting=true;
    if(state==='turn-out' && !waiting){
      const frames=seq('turn').slice().reverse();elapsed+=dt;
      if(!frames.length || elapsed>=frames.length/8) transition('travel');
      else show(frames[Math.min(frames.length-1,Math.floor(elapsed*8))],'turn');
    }
    if(state==='travel' && !settled.has('zhou-side-walk.png')) waiting=true;
    if(state==='travel' && !waiting){
      const target=scene.points[desired], dx=target.x-x,dy=target.y-y, dist=Math.hypot(dx,dy);
      if(dist<=1){x=target.x;y=target.y;active=desired;loopTime=0;transition(active>=0&&active<5?'turn-in':'loop');}
      else{
        const step=Math.min(dist,walkSpeed*dt);x+=dx/dist*step;y+=dy/dist*step;
        if(Math.abs(dx)>.2) facingRight=dx>0;
        walkTime+=dt;show('zhou-side-walk.png','walk',Math.floor(walkTime*walkRate)%4);
      }
    }
    if(state==='turn-in' && !ready('turn')) waiting=true;
    if(state==='turn-in' && !waiting){
      const frames=seq('turn');elapsed+=dt;
      if(!frames.length || elapsed>=frames.length/8) transition('enter');
      else show(frames[Math.min(frames.length-1,Math.floor(elapsed*8))],'turn');
    }
    if(state==='enter' && !ready(entryKey(active))) waiting=true;
    if(state==='enter' && !waiting){
      // Play an entry only after its frames have finished loading.
      const frames=entry(active), rate=entryRate(active); elapsed+=dt;
      if(!frames.length || elapsed>=frames.length/rate){transition('loop');loopTime=0;}
      else show(frames[Math.min(frames.length-1,Math.floor(elapsed*rate))], ['standing','think','practice','reading','defiant'][active]);
    }
    if(state==='loop'){loopTime+=dt;loopFrame(active,now);}
    actor.style.transform=`translate3d(${x}px,${scrollY+y-actor.offsetHeight*.25}px,0)`;
    actor.dataset.state=state;actor.dataset.chapter=String(active);
    replay.disabled=!(enabled && state==='loop' && active>=1 && active<=4 && desired===active);
    const animated=state!=='loop' || active===2 || active===3 || active===5 || desired!==active;
    if(animated && !waiting) requestTick(); else lastTime=0;
  }
  function onToggle(){
    enabled=!enabled;toggle.setAttribute('aria-pressed',String(enabled));
    toggle.textContent=`行走动画：${enabled?'开':'关'}`;
    actor.style.display=enabled?'':'none';
    document.querySelector('.ending .end-sprite').style.opacity=enabled?'0':'1';
    lastTime=0;requestTick();
  }
  toggle.setAttribute('aria-pressed',String(enabled));
  toggle.textContent=`行走动画：${enabled?'开':'关'}`;
  actor.style.display=enabled?'':'none';
  document.querySelector('.ending .end-sprite').style.opacity=enabled?'0':'1';
  replay.addEventListener('click',()=>{
    if(!enabled || state!=='loop' || active<1 || active>4 || desired!==active) return;
    exitFrames=entry(active).slice().reverse();
    transition('replay-exit'); replay.disabled=true; lastTime=0; requestTick();
  });
  toggle.addEventListener('click',onToggle);
  addEventListener('scroll',requestTick,{passive:true});
  addEventListener('resize',()=>{x=y=null;active=null;lastTime=0;requestTick()});
  document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden)requestTick()});
  requestTick();
})();
