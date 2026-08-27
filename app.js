
let state={trends:[],filter:"all",search:"",geo:"IN"};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

function esc(s=""){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmtTraffic(n,t){if(t)return esc(t);if(n>=1e6)return (n/1e6).toFixed(1)+"M+";if(n>=1e3)return Math.round(n/1e3)+"K+";return n||"Rising"}
function visible(){
  return state.trends.filter(t=>{
    const okType=state.filter==="all"||t.type===state.filter;
    const okSearch=!state.search||t.title.toLowerCase().includes(state.search);
    return okType&&okSearch;
  });
}
function render(){
  const rows=visible();
  $("#rows").innerHTML=rows.length?rows.slice(0,30).map(t=>`
    <div class="row" data-id="${esc(t.id)}">
      <div class="trend-name"><b>${esc(t.title)}</b><small>${esc(t.type)} • ${esc(t.status)} • ${t.ageHours}h ago</small></div>
      <div class="traffic">${fmtTraffic(t.traffic,t.trafficText)}</div>
      <div class="growth">+${t.growth}%</div>
      <div><span class="comp ${t.competition}">${t.competition}</span></div>
      <div class="score" style="--s:${t.score}"><span>${t.score}</span></div>
    </div>`).join(""):`<div class="loading">No trends match this filter.</div>`;

  $$(".row").forEach(r=>r.onclick=()=>{
    const t=state.trends.find(x=>x.id===r.dataset.id);
    if(t) selectTrend(t.title);
  });

  const categories={product:0,video:0,keyword:0};
  state.trends.forEach(t=>categories[t.type]=(categories[t.type]||0)+1);
  const max=Math.max(1,...Object.values(categories));
  $("#radar").innerHTML=Object.entries(categories).map(([k,v])=>`
    <div class="radar-item"><div><span>${k[0].toUpperCase()+k.slice(1)} signals</span><span>${v}</span></div>
    <div class="bar"><i style="width:${Math.max(12,v/max*100)}%"></i></div></div>`).join("");
}
async function load(force=false){
  $("#rows").innerHTML=`<div class="loading">Loading live signals…</div>`;
  try{
    const res=await fetch(`/api/trends?geo=${encodeURIComponent(state.geo)}${force?"&t="+Date.now():""}`);
    const data=await res.json();
    if(!res.ok)throw new Error(data.detail||data.error||"Request failed");
    state.trends=data.trends||[];
    $("#hot").textContent=data.stats.hot;
    $("#signals").textContent=data.stats.signals;
    $("#low").textContent=data.stats.lowCompetition;
    $("#exploding").textContent=data.stats.exploding;
    $("#updated").textContent=`Updated ${new Date(data.fetchedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} • ${data.geo} • Google Trends`;
    render();
  }catch(e){
    $("#rows").innerHTML=`<div class="loading">Could not load live trends: ${esc(e.message)}</div>`;
    $("#updated").textContent="Live feed unavailable";
  }
}
window.selectTrend=function(title){
  $("#trendInput").value=title;
  $("#generator").scrollIntoView({behavior:"smooth",block:"center"});
}
$("#refresh").onclick=()=>load(true);
$("#geo").onchange=e=>{state.geo=e.target.value;load(true)};
$("#search").oninput=e=>{state.search=e.target.value.trim().toLowerCase();render()};
$$(".chip").forEach(b=>b.onclick=()=>{
  $$(".chip").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  state.filter=b.dataset.filter;render();
});
$$(".nav[data-type]").forEach(b=>b.onclick=()=>{
  $$(".nav[data-type]").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  state.filter=b.dataset.type;
  $$(".chip").forEach(x=>x.classList.toggle("active",x.dataset.filter===state.filter));
  render();
});
$("#jumpGenerator").onclick=()=>$("#generator").scrollIntoView({behavior:"smooth"});
$("#menu").onclick=()=>$("#sidebar").classList.toggle("open");
$("#generate").onclick=async()=>{
  const trend=$("#trendInput").value.trim();
  if(!trend){$("#trendInput").focus();return}
  $("#generate").textContent="Generating…";
  try{
    const res=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trend,platform:$("#platform").value})});
    const d=await res.json();
    if(!res.ok)throw new Error(d.error||"Could not generate");
    $("#output").classList.remove("hidden");
    $("#output").innerHTML=[
      ["Hook",d.hook],["Concept",d.concept],["Script",d.script],["Title",d.title],
      ["Caption",d.caption],["Keywords",d.keywords],["Hashtags",d.hashtags],["Thumbnail",d.thumbnail]
    ].map(([k,v])=>`<div><b>${k}</b><p>${esc(v)}</p></div>`).join("");
  }catch(e){alert(e.message)}
  finally{$("#generate").textContent="✦ Generate content"}
};
load();
