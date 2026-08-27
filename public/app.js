
let S={items:[],geo:"IN",type:"search",stage:"all",comp:"",search:""};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function sourceBadge(t){
  const raw=String(t.marketplace||t.platformName||t.source||"").toLowerCase();
  let name="Source", cls="source-generic";
  if(raw.includes("youtube")){name="YouTube";cls="source-youtube"}
  else if(raw.includes("instagram")){name="Instagram";cls="source-instagram"}
  else if(raw.includes("facebook")){name="Facebook";cls="source-facebook"}
  else if(raw.includes("amazon")){name=t.marketplace||t.source||"Amazon";cls="source-amazon"}
  else if(raw.includes("flipkart")){name="Flipkart";cls="source-flipkart"}
  else if(raw.includes("meesho")){name="Meesho";cls="source-meesho"}
  else if(raw.includes("ebay")){name=t.marketplace||t.source||"eBay";cls="source-ebay"}
  else if(raw.includes("walmart")){name=t.marketplace||t.source||"Walmart";cls="source-walmart"}
  else if(raw.includes("argos")){name="Argos";cls="source-argos"}
  else if(raw.includes("google trends")){name="Google Trends";cls="source-google"}
  return `<span class="source-badge ${cls}">${name}</span>`;
}

function filt(){return S.items.filter(t=>(S.stage==="all"||t.stage===S.stage)&&(!S.comp||t.competition===S.comp)&&(!S.search||t.title.toLowerCase().includes(S.search)))}
function render(){
 const a=filt();
 $("#rows").innerHTML=a.map(t=>`<div class="row" data-id="${t.id}">
 <div class="trend-name"><div class="title-line"><b>${E(t.title)}</b>${sourceBadge(t)}</div><small>${E(t.window||"")} ${t.verifiedSignal===false?"• derived from live search":""}</small></div>
 <div class="traffic">${E(t.stage)}</div><div class="growth">${E(t.trafficText||"Fresh")}</div>
 <div><span class="comp ${t.competition}">${t.competition}</span></div>
 <div class="score" style="--s:${t.score}"><span>${t.score}</span></div></div>`).join("")||`<div class="loading">${S.type==="product"?"No verified product cards were returned by the approved marketplaces right now. TrendPulse is hiding categories/navigation rather than showing bad data.":S.type==="video"?"No public video results were returned by YouTube, Instagram or Facebook right now.":"No matching opportunities."}</div>`;
 $$(".row").forEach(x=>x.onclick=()=>report(S.items.find(t=>t.id===x.dataset.id)));
}
async function load(){
 $("#rows").innerHTML='<div class="loading">Loading live feed…</div>';
 try{
  const r=await fetch(`/api/feed?geo=${S.geo}&type=${S.type}`),d=await r.json();if(!r.ok)throw Error(d.error);
  S.items=d.items; $("#hot").textContent=d.stats.hot;$("#signals").textContent=d.stats.signals;$("#low").textContent=d.stats.lowCompetition;$("#exploding").textContent=d.stats.exploding;
  let base=`${S.type==="product"?"Product signals":S.type==="video"?"Video signals":"Search trends"} • updated ${new Date(d.fetchedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} • ${d.geo}`;
  if(S.type==="product"&&Array.isArray(d.sourceStatus)&&d.sourceStatus.length){
    const ok=d.sourceStatus.filter(x=>x.available).length;
    base+=` • ${ok}/${d.sourceStatus.length} sources available`;
  }
  $("#updated").textContent=base;
  $$(".nav[data-feed]").forEach(b=>b.classList.toggle("active",b.dataset.feed===S.type));
  $("#feedType").value=S.type;
  render(); today();
 }catch(e){$("#rows").innerHTML=`<div class="loading">${E(e.message)}</div>`}
}
async function today(){
 $("#today").innerHTML='<div class="loading">Ranking opportunities…</div>';
 try{
  const r=await fetch(`/api/post-today?geo=${S.geo}&type=${$("#feedType").value}&platform=${encodeURIComponent($("#platform").value)}`),d=await r.json();if(!r.ok)throw Error(d.error);
  $("#today").innerHTML=d.opportunities.map((t,i)=>`<article class="today-item" data-id="${t.id}">
  <div class="today-top"><span class="rank">#${i+1} OPPORTUNITY</span>${sourceBadge(t)}</div><h3>${E(t.title)}</h3>
  <span class="pill good">${E(t.stage)}</span><span class="pill">${E(t.competition)} comp.</span><span class="pill">${E(t.type||S.type)}</span>
  <p>${E((t.hooks||[])[0]||t.action||"Fresh opportunity")}</p><div class="today-score">Fit ${t.fitScore}/100 →</div></article>`).join("");
  $$(".today-item").forEach(x=>x.onclick=()=>report(d.opportunities.find(t=>t.id===x.dataset.id)));
 }catch(e){$("#today").innerHTML=`<div class="loading">${E(e.message)}</div>`}
}
function report(t){
 $("#report").innerHTML=`<span class="eyebrow">OPPORTUNITY REPORT</span><div class="report-source">${sourceBadge(t)}</div><h2>${E(t.title)}</h2><p>${E(t.type||S.type)} • ${E(t.platform||"")}</p>
 <div class="report-grid"><div class="report-stat"><span>STAGE</span><b>${E(t.stage)}</b></div><div class="report-stat"><span>SCORE</span><b>${t.score}/100</b></div><div class="report-stat"><span>COMPETITION</span><b>${E(t.competition)}</b></div><div class="report-stat"><span>WINDOW</span><b>${E(t.window||"Act now")}</b></div></div>
 <div class="report-section"><h3>WHY IT'S MOVING</h3><p>${E(t.why||"Fresh live signal detected.")}</p></div>
 <div class="report-section"><h3>WHAT TO DO</h3><p>${E(t.action||"Create a fast explainer while attention is rising.")}</p></div>
 <div class="report-section"><h3>3 CONTENT HOOKS</h3><ul>${(t.hooks||[]).map(h=>`<li>${E(h)}</li>`).join("")}</ul></div>
 <div class="report-section"><h3>KEYWORDS</h3><p>${(t.keywords||[]).map(E).join(" • ")}</p></div>
 <div class="report-section"><h3>MONETIZATION</h3><p>${E(t.monetization||"Medium")} potential • ${(t.creators||[]).map(E).join(" • ")}</p></div>
 <div class="report-actions"><button onclick='useTrend(${JSON.stringify(t.title)})'>✦ Create content</button>${t.sourceUrl?`<button onclick='window.open(${JSON.stringify(t.sourceUrl)},"_blank")'>View source ↗</button>`:""}</div>`;
 $("#modal").classList.remove("hidden");
}
window.useTrend=t=>{$("#modal").classList.add("hidden");$("#trendInput").value=t;$("#generator").scrollIntoView({behavior:"smooth"})};
$("#close").onclick=$("#x").onclick=()=>$("#modal").classList.add("hidden");
$("#find").onclick=today;
$("#refresh").onclick=load;
$("#geo").onchange=e=>{S.geo=e.target.value;load()};
$("#feedType").onchange=e=>{S.type=e.target.value;load()};
$("#search").oninput=e=>{S.search=e.target.value.toLowerCase();render()};
$$(".nav[data-feed]").forEach(b=>b.onclick=()=>{S.type=b.dataset.feed;load();$("#feed").scrollIntoView({behavior:"smooth"});if(innerWidth<=760)$("#sidebar").classList.remove("open")});
$$(".chip").forEach(b=>b.onclick=()=>{$$(".chip").forEach(x=>x.classList.remove("active"));b.classList.add("active");S.stage=b.dataset.stage||"all";S.comp=b.dataset.comp||"";render()});
$$("[data-go]").forEach(b=>b.onclick=()=>{$("#"+b.dataset.go).scrollIntoView({behavior:"smooth"});if(innerWidth<=760)$("#sidebar").classList.remove("open")});
$("#menu").onclick=()=>$("#sidebar").classList.toggle("open");
$("#generate").onclick=async()=>{const t=$("#trendInput").value.trim();if(!t)return $("#trendInput").focus();const r=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trend:t,platform:$("#genPlatform").value})}),d=await r.json();$("#output").classList.remove("hidden");$("#output").innerHTML=[["Hook",d.hook],["Concept",d.concept],["Script",d.script],["Title",d.title],["Caption",d.caption],["Keywords",d.keywords],["Hashtags",d.hashtags],["Thumbnail",d.thumbnail]].map(([k,v])=>`<div><b>${k}</b><p>${E(v)}</p></div>`).join("")};
load();
