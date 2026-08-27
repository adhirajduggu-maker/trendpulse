
let state={trends:[],view:"all",search:"",geo:"IN",counts:{}};
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmtTraffic(n,t){if(t)return esc(t);if(n>=1e6)return (n/1e6).toFixed(1)+"M+";if(n>=1e3)return Math.round(n/1e3)+"K+";return n||"Rising"}
function visible(){return state.trends.filter(t=>!state.search||(`${t.title} ${t.angle||""}`).toLowerCase().includes(state.search))}
function rowSubtitle(t){
  const bits=[t.label||t.viewType||"trend",t.status,`${t.ageHours}h ago`];
  if(t.derived) bits.unshift("Derived opportunity");
  return bits.join(" • ");
}
function render(){
  const rows=visible();
  $("#rows").innerHTML=rows.length?rows.slice(0,30).map(t=>`
    <div class="row" data-id="${esc(t.id)}">
      <div class="trend-name"><b>${esc(t.viewType==="hook" ? (t.hook||t.angle) : t.title)}</b>
      <small>${esc(rowSubtitle(t))}${t.angle && t.viewType!=="hook" ? ` • ${esc(t.angle)}`:""}</small></div>
      <div class="traffic">${fmtTraffic(t.traffic,t.trafficText)}</div>
      <div class="growth">+${t.growth}%</div>
      <div><span class="comp ${t.competition}">${t.competition}</span></div>
      <div class="score" style="--s:${t.score}"><span>${t.score}</span></div>
    </div>`).join(""):`<div class="loading">No opportunities match your search.</div>`;

  $$(".row").forEach(r=>r.onclick=()=>{
    const t=state.trends.find(x=>x.id===r.dataset.id);
    if(t) selectTrend(t.title);
  });

  const c=state.counts;
  $("#radar").innerHTML=[
    ["Products",c.product||0],["Videos",c.video||0],["Hooks",c.hook||0],["Keywords",c.keyword||0]
  ].map(([k,v])=>`<div class="radar-item"><div><span>${k}</span><span>${v}</span></div><div class="bar"><i style="width:${Math.min(100,Math.max(12,v*5))}%"></i></div></div>`).join("");
}
function activateView(view){
  state.view=view;
  $$(".nav[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===view));
  $$(".chip[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===view));
  load();
}
async function load(force=false){
  $("#rows").innerHTML=`<div class="loading">Loading ${esc(state.view)} opportunities…</div>`;
  try{
    const res=await fetch(`/api/trends?geo=${encodeURIComponent(state.geo)}&view=${encodeURIComponent(state.view)}${force?"&t="+Date.now():""}`);
    const data=await res.json();
    if(!res.ok)throw new Error(data.detail||data.error||"Request failed");
    state.trends=data.trends||[]; state.counts=data.counts||{};
    $("#hot").textContent=data.stats.hot;
    $("#signals").textContent=data.stats.signals;
    $("#low").textContent=data.stats.lowCompetition;
    $("#exploding").textContent=data.stats.exploding;
    $("#updated").textContent=`${state.view==="product"?"Product opportunities":state.view==="hook"?"Winning hooks":state.view==="video"?"Video opportunities":"Live trends"} • updated ${new Date(data.fetchedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} • ${data.geo}`;
    render();
  }catch(e){
    $("#rows").innerHTML=`<div class="loading">Could not load data: ${esc(e.message)}</div>`;
    $("#updated").textContent="Live feed unavailable";
  }
}
window.selectTrend=function(title){$("#trendInput").value=title;$("#generator").scrollIntoView({behavior:"smooth",block:"center"})}
$("#refresh").onclick=()=>load(true);
$("#geo").onchange=e=>{state.geo=e.target.value;load(true)};
$("#search").oninput=e=>{state.search=e.target.value.trim().toLowerCase();render()};
$$(".chip[data-view]").forEach(b=>b.onclick=()=>activateView(b.dataset.view));
$$(".nav[data-view]").forEach(b=>b.onclick=()=>activateView(b.dataset.view));
$("#jumpGenerator").onclick=()=>$("#generator").scrollIntoView({behavior:"smooth"});
$("#menu").onclick=()=>$("#sidebar").classList.toggle("open");
$("#generate").onclick=async()=>{
  const trend=$("#trendInput").value.trim(); if(!trend){$("#trendInput").focus();return}
  $("#generate").textContent="Generating…";
  try{
    const res=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trend,platform:$("#platform").value})});
    const d=await res.json(); if(!res.ok)throw new Error(d.error||"Could not generate");
    $("#output").classList.remove("hidden");
    $("#output").innerHTML=[["Hook",d.hook],["Concept",d.concept],["Script",d.script],["Title",d.title],["Caption",d.caption],["Keywords",d.keywords],["Hashtags",d.hashtags],["Thumbnail",d.thumbnail]]
      .map(([k,v])=>`<div><b>${k}</b><p>${esc(v)}</p></div>`).join("");
  }catch(e){alert(e.message)} finally{$("#generate").textContent="✦ Generate content"}
};
load();


// Mobile usability
document.querySelectorAll(".nav").forEach(btn=>{
  btn.addEventListener("click",()=>{
    if(window.innerWidth<=760){
      document.querySelector("#sidebar")?.classList.remove("open");
    }
  });
});
window.addEventListener("resize",()=>{
  if(window.innerWidth>760){
    document.querySelector("#sidebar")?.classList.remove("open");
  }
});
