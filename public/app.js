
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let profile=JSON.parse(localStorage.getItem("tpAgentProfileV2")||'{"geo":"US","niche":"All","platform":"Any","goal":"Audience Growth","intent":"video"}');
let watch=JSON.parse(localStorage.getItem("tpAgentWatchV2")||"[]"),latest=[],selected=null;

async function fetchJSON(url,options={},timeout=18000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeout);
 try{
   const r=await fetch(url,{...options,signal:controller.signal});
   const d=await r.json().catch(()=>({error:"Invalid server response"}));
   if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);
   return d;
 }catch(e){
   if(e.name==="AbortError")throw Error("The source took too long to respond. Try again or choose another discovery type.");
   throw e;
 }finally{clearTimeout(timer)}
}

function setBtn(btn,state,text){if(!btn)return;if(state){btn.dataset.old=btn.textContent;btn.disabled=true;btn.classList.add("is-loading");btn.textContent=text}else{btn.disabled=false;btn.classList.remove("is-loading");btn.textContent=text||btn.dataset.old||"Done"}}
function flash(btn,text="✓ Updated"){const old=btn.textContent;btn.disabled=false;btn.classList.remove("is-loading");btn.classList.add("is-success");btn.textContent=text;setTimeout(()=>{btn.classList.remove("is-success");btn.textContent=old},1100)}
function sync(){
 $("#agentGeo").value=profile.geo;$("#agentNiche").value=profile.niche;$("#agentPlatform").value=profile.platform;$("#agentGoal").value=profile.goal;$("#trackedCount").textContent=watch.length;
 $$("[data-intent]").forEach(x=>x.classList.toggle("active",x.dataset.intent===profile.intent));
 $("#setupTitle").textContent=profile.intent==="product"?"Set up your product discovery.":profile.intent==="search"?"Set up your search discovery.":"Set up your video discovery.";
 $("#agentPlatform").closest("select").style.display=profile.intent==="search"?"none":"";
}
function save(){profile={...profile,geo:$("#agentGeo").value,niche:$("#agentNiche").value,platform:$("#agentPlatform").value,goal:$("#agentGoal").value};localStorage.setItem("tpAgentProfileV2",JSON.stringify(profile))}
function watched(id){return watch.includes(id)}
window.toggleWatch=id=>{watch=watched(id)?watch.filter(x=>x!==id):[...watch,id];localStorage.setItem("tpAgentWatchV2",JSON.stringify(watch));$("#trackedCount").textContent=watch.length;render(latest);renderWatch()}

function sourceActionLabel(t){
 if((t.type||profile.intent)==="product")return "View product";
 if((t.type||profile.intent)==="video")return "Watch video";
 return "Open source";
}
window.openSource=(id)=>{
 const t=latest.find(x=>x.id===id);
 if(!t||!t.sourceUrl)return;
 window.open(t.sourceUrl,"_blank","noopener,noreferrer");
};

function source(t){return t.source||t.marketplace||t.platformName||"Live signal"}

function sourceIcon(t){
  const type=(t.type||profile.intent||"search").toLowerCase();
  const src=source(t).toLowerCase();
  if(src.includes("amazon"))return "a";
  if(src.includes("youtube"))return "▶";
  if(src.includes("instagram"))return "◎";
  if(src.includes("facebook"))return "f";
  if(src.includes("ebay"))return "e";
  if(src.includes("walmart"))return "w";
  if(type==="product")return "◇";
  if(type==="video")return "▶";
  return "↗";
}
function sourceClass(t){
  const src=source(t).toLowerCase();
  if(src.includes("amazon"))return "visual-amazon";
  if(src.includes("youtube"))return "visual-youtube";
  if(src.includes("instagram"))return "visual-instagram";
  if(src.includes("facebook"))return "visual-facebook";
  return (t.type||profile.intent)==="product"?"visual-product":(t.type||profile.intent)==="video"?"visual-video":"visual-search";
}
function visualFor(t){
  const fallback=`<span class="visual-fallback">${sourceIcon(t)}</span>`;
  if(t.imageUrl){
    return `<div class="card-visual image-visual ${sourceClass(t)}"><img src="${E(t.imageUrl)}" alt="${E(t.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">${fallback}</div>`;
  }
  return `<div class="card-visual ${sourceClass(t)}">${fallback}</div>`;
}
function metricRows(t){
  const type=(t.type||profile.intent||"search").toLowerCase();
  if(type==="product")return [["Demand",Number(t.score||0)>=85?"High":"Medium"],["Trend",t.stage||"Rising"],["Competition",t.competition||"Medium"],["Window",t.window||"2–5 days"]];
  if(type==="video")return [["Momentum",Number(t.score||0)>=85?"High":"Medium"],["Trend",t.stage||"Rising"],["Competition",t.competition||"Medium"],["Window",t.window||"2–5 days"]];
  return [["Demand",t.trafficText||"Rising"],["Trend",t.stage||"Rising"],["Competition",t.competition||"Medium"],["Window",t.window||"2–5 days"]];
}

function card(t,i){
  const isTrack=watched(t.id);
  const type=(t.type||profile.intent||"opportunity").toUpperCase();
  const rows=metricRows(t);
  return `<article class="op-card">
    <div class="op-top"><span class="agent-rank">#${i+1} ${E(type)}</span><span class="agent-score">${t.agentScore||t.score}/100 ↗</span></div>
    <div class="op-main">${visualFor(t)}<div class="op-title-wrap"><h3>${E(t.title)}</h3><div class="agent-meta"><span class="pill">${E(source(t))}</span><span class="pill good">${E(t.stage||"Rising")}</span><span class="pill">${E(t.competition||"Medium")} comp.</span></div></div></div>
    <p class="op-summary">${E((t.hooks||[])[0]||t.why||"Fresh opportunity detected.")}</p>
    <div class="metric-box">${rows.map(([k,v])=>`<div><span>${E(k)}</span><b>${E(v)}</b></div>`).join("")}</div>
    <div class="agent-plan"><b>${E(t.plan?.priority||"Act today")}</b><p>${E(t.plan?.moneyAngle||t.action||"")}</p></div>
    <div class="agent-actions">
      <button class="primary" onclick='createFrom(${JSON.stringify(t.id)},this)'>Create content</button>
      ${t.sourceUrl?`<button class="source-btn" onclick='openSource(${JSON.stringify(t.id)})'>${sourceActionLabel(t)} ↗</button>`:""}
      <button class="track-btn ${isTrack?"watching":""}" onclick='toggleWatch(${JSON.stringify(t.id)})'>${isTrack?"♥ Tracked":"♡ Track"}</button>
    </div>
  </article>`;
}
function render(a){latest=a;$("#agentCards").innerHTML=a.length?a.map(card).join(""):'<div class="loading">No matching opportunities returned from the selected sources.</div>'}
function renderWatch(){
  const a=latest.filter(t=>watched(t.id));
  const wb=document.querySelector("#watchBadge"); if(wb)wb.textContent=a.length;
  $("#trackedCount").textContent=watch.length;
  $("#watchCards").innerHTML=a.length?a.map(t=>`
    <article class="watch-item">
      ${visualFor(t)}
      <div class="watch-copy"><div class="watch-name-row"><h3>${E(t.title)}</h3><span>${t.agentScore||t.score}/100</span></div><p>${E(source(t))} • ${E(t.stage||"Rising")}</p></div>
      <div class="watch-actions">${t.sourceUrl?`<button onclick='openSource(${JSON.stringify(t.id)})'>View ↗</button>`:""}<button class="watch-menu" onclick='toggleWatch(${JSON.stringify(t.id)})'>⋮</button></div>
    </article>`).join(""):'<div class="loading">Track an opportunity and it will appear here.</div>';
}
async function checkBackend(){
 const d=await fetchJSON("/api/health",{},8000);
 if(!d.ok)throw Error("TrendPulse backend is not ready.");
 return d;
}

async function run(trigger){
 if(trigger)setBtn(trigger,true,"⟳ Running Agent…");
 try{await checkBackend()}catch(e){
   showAgentError(`Backend error: ${e.message}`);
   if(trigger){trigger.disabled=false;trigger.classList.remove("is-loading");trigger.textContent="Try again"}
   return;
 }
 $("#agentCards").innerHTML='<div class="loading">Searching and ranking opportunities…</div>';
 try{const d=await fetchJSON(`/api/agent/recommendations?intent=${profile.intent}&geo=${profile.geo}&niche=${encodeURIComponent(profile.niche)}&platform=${encodeURIComponent(profile.platform)}&goal=${encodeURIComponent(profile.goal)}`);render(d.recommendations||[]);renderWatch();$("#agentUpdated").textContent=`${profile.intent==="product"?"Products":profile.intent==="search"?"Search trends":"Videos"} • ${d.geo} • updated ${new Date(d.fetchedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;$("#briefHeadline").textContent=`${d.recommendations?.length||0} ${profile.intent} opportunities found for you.`;$("#briefSub").textContent=`Ranked for ${profile.goal} in ${d.geo}.`;if(trigger)flash(trigger)}catch(e){showAgentError(e.message);if(trigger){trigger.disabled=false;trigger.classList.remove("is-loading");trigger.textContent="Try again"}}
}
$$("[data-intent]").forEach(b=>b.onclick=()=>{profile.intent=b.dataset.intent;if(profile.intent==="product"&&profile.goal==="Audience Growth")profile.goal="Affiliate Sales";if(profile.intent==="search"&&profile.goal==="Affiliate Sales")profile.goal="Traffic";localStorage.setItem("tpAgentProfileV2",JSON.stringify(profile));sync();run(null)});
$("#saveRun").onclick=()=>{save();sync();run($("#saveRun"))};$("#rerunAgent").onclick=()=>run($("#rerunAgent"));$("#menu").onclick=()=>$("#sidebar").classList.toggle("open");$$("[data-go]").forEach(b=>b.onclick=()=>$("#"+b.dataset.go).scrollIntoView({behavior:"smooth"}));
$("#globalSearch").oninput=e=>{const q=e.target.value.toLowerCase().trim();render(!q?latest:latest.filter(t=>t.title.toLowerCase().includes(q)))};
window.createFrom=(id,btn)=>{selected=latest.find(x=>x.id===id);if(!selected)return;$("#trendInput").value=selected.title;$("#generator").scrollIntoView({behavior:"smooth"});setTimeout(()=>generateContent(btn),300)};
async function generateContent(trigger=$("#generate")){
 const t=selected||{title:$("#trendInput").value.trim(),type:profile.intent,source:"Manual"};if(!t.title)return $("#trendInput").focus();
 setBtn(trigger,true,"✦ Generating…");
 try{const d=await fetchJSON("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trend:t.title,intent:profile.intent,type:t.type,source:source(t),stage:t.stage,competition:t.competition,score:t.agentScore||t.score,geo:profile.geo,goal:profile.goal,platform:$("#genPlatform").value})},18000);$("#output").classList.remove("hidden");$("#output").innerHTML=`<div class="content-context"><b>${E(profile.intent.toUpperCase())}</b><span>${E(source(t))}</span><span>${E(profile.geo)}</span><span>${E(profile.goal)}</span></div><div><b>3 Hook Options</b>${d.hooks.map((h,i)=>`<p><strong>${String.fromCharCode(65+i)}.</strong> ${E(h)}</p>`).join("")}</div><div><b>Script</b><p>${E(d.script)}</p></div><div><b>Shot List</b>${d.shots.map(x=>`<p>• ${E(x)}</p>`).join("")}</div><div><b>CTA</b><p>${E(d.cta)}</p></div><div><b>Title</b><p>${E(d.title)}</p></div><div><b>Caption</b><p>${E(d.caption)}</p></div><div><b>Keywords</b><p>${E(d.keywords.join(", "))}</p></div><div><b>Hashtags</b><p>${E(d.hashtags.join(" "))}</p></div><div><b>Thumbnail</b><p>${E(d.thumbnail)}</p></div>`;flash(trigger,"✓ Content Ready")}catch(e){trigger.disabled=false;trigger.classList.remove("is-loading");trigger.textContent="Try again";$("#output").classList.remove("hidden");$("#output").innerHTML=`<div><b>Generation failed</b><p>${E(e.message)}</p></div>`}
}
$("#generate").onclick=()=>{selected=null;generateContent($("#generate"))};sync();run();
