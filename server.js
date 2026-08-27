
const express=require("express"),path=require("path");
const app=express(),PORT=process.env.PORT||3000;
app.use(express.json({limit:"100kb"}));
app.use(express.static(path.join(__dirname,"public")));

const CACHE=new Map(), TTL=10*60*1000;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const decode=s=>(s||"").replace(/^<!\[CDATA\[/,"").replace(/\]\]>$/,"")
 .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'")
 .replace(/&lt;/g,"<").replace(/&gt;/g,">").trim();
const tag=(b,n)=>{const m=b.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`,"i"));return m?decode(m[1]):""};
const allTag=(b,n)=>[...b.matchAll(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`,"gi"))].map(m=>decode(m[1]));
const items=x=>[...x.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
function hash(s){let n=0;for(const c of String(s))n=(n*31+c.charCodeAt(0))>>>0;return n}
function traffic(s=""){let n=parseFloat((s.match(/[\d.]+/)||["0"])[0]);if(/M/i.test(s))n*=1e6;if(/K/i.test(s))n*=1e3;return n}
function ageHours(d){const x=new Date(d).getTime();return Number.isFinite(x)?Math.max(0,Math.round((Date.now()-x)/36e5)):0}
function score(v,date,title,bonus=0){
 const age=Math.max(.2,(Date.now()-new Date(date).getTime())/36e5);
 const volume=Math.min(45,Math.log10(Math.max(10,v||1000))*10);
 const fresh=Math.max(5,32-age*1.25);
 const intent=/(price|buy|review|launch|best|deal|sale|video|trailer|teaser|viral|watch)/i.test(title)?14:8;
 return clamp(Math.round(volume+fresh+intent+bonus),45,99);
}
function comp(s,v){if(v<20000&&s>=75)return"Low";if(v<100000)return"Medium";return"High"}
function stage(s,age){if(age<8&&s>=86)return"Exploding";if(age<20&&s>=74)return"Early Rising";if(age<48)return"Rising";return"Established"}
function hooks(t){
 const a=[
  `Why is everyone suddenly talking about “${t}”?`,
  `You’re about to see “${t}” everywhere. Here’s why.`,
  `Before you jump on “${t}”, know these 3 things.`,
  `“${t}” is moving fast — here’s the angle most creators will miss.`
 ];
 let i=hash(t)%a.length; return [a[i],a[(i+1)%a.length],a[(i+2)%a.length]];
}
function commonEnrich(x,type){
 const monet=type==="product"?"High":"Medium";
 const window=x.stage==="Exploding"?"24–72 hours":x.stage==="Early Rising"?"3–7 days":x.stage==="Rising"?"2–5 days":"Act selectively";
 const platform=type==="video"?"YouTube Shorts / Reels":type==="product"?"YouTube Shorts / Reels":"Any short-form";
 return {...x,type,window,platform,monetization:monet,hooks:hooks(x.title),
  why:`This ${type} signal is showing fresh momentum in India. TrendPulse ranks it using recency, intent and source strength.`,
  action:type==="product"
   ?`Create a quick product-led video: problem → product → proof/demo → verdict. If you monetize, use a clearly disclosed affiliate link.`
   :`Create a fast reaction/explainer around why this video topic is getting attention. Lead with the strongest visual or curiosity gap.`,
  keywords:[x.title,`${x.title} India`,`${x.title} latest`,`${x.title} review`,`${x.title} trending`],
  creators:type==="product"?["Affiliate creators","UGC creators","Deal / gadget pages"]:["Short-form creators","Reaction channels","News / commentary pages"]
 };
}

function localeFor(geo){
 const m={IN:{hl:"en-IN",gl:"IN",ceid:"IN:en"},US:{hl:"en-US",gl:"US",ceid:"US:en"},GB:{hl:"en-GB",gl:"GB",ceid:"GB:en"},CA:{hl:"en-CA",gl:"CA",ceid:"CA:en"},AU:{hl:"en-AU",gl:"AU",ceid:"AU:en"}};
 return m[geo]||m.IN;
}
async function fetchText(url){
 const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 TrendPulse/2.1","Accept":"application/rss+xml,text/xml,text/html,*/*"}});
 if(!r.ok)throw Error(`Source returned ${r.status}`);
 return await r.text();
}
async function googleNewsSearch(query,geo="IN"){
 const l=localeFor(geo), key=`news:${geo}:${query}`;
 const hit=CACHE.get(key); if(hit&&Date.now()-hit.at<TTL)return hit.data;
 const url=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${l.hl}&gl=${l.gl}&ceid=${l.ceid}`;
 const xml=await fetchText(url);
 const out=items(xml).map((b,i)=>{
  const title=tag(b,"title").replace(/\s+-\s+[^-]+$/,"").trim();
  const link=tag(b,"link");
  const pub=tag(b,"pubDate")||new Date().toUTCString();
  const source=tag(b,"source")||"Google News";
  return {id:`n-${hash(title+link)}`,title,link,published:pub,ageHours:ageHours(pub),publisher:source};
 }).filter(x=>x.title);
 CACHE.set(key,{at:Date.now(),data:out}); return out;
}

async function getSearchTrends(geo="IN"){
 const key=`trends:${geo}`,hit=CACHE.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.data;
 const xml=await fetchText(`https://trends.google.com/trending/rss?geo=${geo}`);
 let ts=items(xml).map((b,i)=>{
  const title=tag(b,"title"),tt=tag(b,"ht:approx_traffic")||tag(b,"approx_traffic")||"Rising";
  const pub=tag(b,"pubDate")||new Date().toUTCString(),v=traffic(tt),a=ageHours(pub),sc=score(v,pub,title);
  return {id:`t-${i}-${hash(title)}`,title,traffic:v,trafficText:tt,published:pub,ageHours:a,score:sc,
   growth:clamp(Math.round((sc-40)*5+Math.log10(Math.max(10,v||1000))*50),25,800),
   competition:comp(sc,v),stage:stage(sc,a),source:"Google Trends",
   sourceUrl:`https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(title)}`};
 }).filter(x=>x.title).sort((a,b)=>b.score-a.score);
 CACHE.set(key,{at:Date.now(),data:ts});return ts;
}

function cleanProductTitle(s){
 return s.replace(/\b(price in india|launch date|launched in india|review|specifications|specs|sale|deal|offers?)\b/ig,"")
  .replace(/\s{2,}/g," ").replace(/[:|–-]\s*$/,"").trim();
}
async function getProducts(geo="IN"){
 const key=`products:${geo}`,hit=CACHE.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.data;
 const queries=geo==="IN"
 ?['("launch" OR "launched") ("price in India" OR India) gadget','("sale" OR "deal") (Amazon OR Flipkart) India electronics','("review" OR "specifications") smartphone India','wearable OR earbuds OR laptop launch India']
 :['product launch price review','best new gadgets deal sale','smartphone laptop earbuds launch'];
 let batches=await Promise.all(queries.map(q=>googleNewsSearch(q,geo).catch(()=>[])));
 let seen=new Set(),rows=[];
 for(const x of batches.flat()){
   let title=cleanProductTitle(x.title); if(title.length<4)continue;
   let k=title.toLowerCase(); if(seen.has(k))continue; seen.add(k);
   const syntheticTraffic=Math.max(5000,50000-x.ageHours*1200);
   const sc=score(syntheticTraffic,x.published,title,8),st=stage(sc,x.ageHours);
   rows.push(commonEnrich({...x,id:`p-${hash(k+x.link)}`,title,traffic:syntheticTraffic,trafficText:"Fresh commerce signal",
    score:sc,growth:clamp(120+(48-x.ageHours)*5,35,420),competition:x.ageHours<10?"Low":"Medium",stage:st,
    source:`Google News • ${x.publisher}`,sourceUrl:x.link,verifiedSignal:true},"product"));
 }
 if(rows.length<12){
   const trends=await getSearchTrends(geo).catch(()=>[]);
   const commerceWords=/phone|iphone|samsung|pixel|laptop|watch|earbuds|car|bike|camera|amazon|flipkart|price|launch|sale|deal/i;
   for(const t of trends.filter(t=>commerceWords.test(t.title))){
    const k=t.title.toLowerCase();if(seen.has(k))continue;seen.add(k);
    rows.push(commonEnrich({...t,id:`p-fallback-${hash(k)}`,trafficText:t.trafficText||"Live search signal",
     source:"Google Trends • commerce signal",verifiedSignal:false},"product"));
   }
 }
 rows.sort((a,b)=>b.score-a.score||a.ageHours-b.ageHours);
 const data=rows.slice(0,30);CACHE.set(key,{at:Date.now(),data});return data;
}

async function getVideos(geo="IN"){
 const key=`videos:${geo}`,hit=CACHE.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.data;
 const queries=geo==="IN"
 ?['("viral video" OR "video goes viral") India','(trailer OR teaser OR music video) India trending','(highlights OR viral clip) cricket OR football India','YouTube India viral video trending']
 :['viral video trending','trailer teaser viral video','sports highlights viral clip'];
 let batches=await Promise.all(queries.map(q=>googleNewsSearch(q,geo).catch(()=>[])));
 let seen=new Set(),rows=[];
 for(const x of batches.flat()){
   let title=x.title.trim(),k=title.toLowerCase();if(title.length<4||seen.has(k))continue;seen.add(k);
   const v=Math.max(6000,60000-x.ageHours*1300),sc=score(v,x.published,title,7),st=stage(sc,x.ageHours);
   rows.push(commonEnrich({...x,id:`v-${hash(k+x.link)}`,traffic:v,trafficText:"Fresh video signal",
    score:sc,growth:clamp(140+(48-x.ageHours)*5,40,450),competition:x.ageHours<8?"Low":"Medium",stage:st,
    source:`Google News • ${x.publisher}`,sourceUrl:x.link,verifiedSignal:true},"video"));
 }
 if(rows.length<12){
   const trends=await getSearchTrends(geo).catch(()=>[]);
   const videoWords=/video|trailer|teaser|song|movie|match|highlights|live|episode|goal|viral/i;
   for(const t of trends.filter(t=>videoWords.test(t.title))){
    const k=t.title.toLowerCase();if(seen.has(k))continue;seen.add(k);
    rows.push(commonEnrich({...t,id:`v-fallback-${hash(k)}`,source:"Google Trends • video signal",verifiedSignal:false},"video"));
   }
 }
 rows.sort((a,b)=>b.score-a.score||a.ageHours-b.ageHours);
 const data=rows.slice(0,30);CACHE.set(key,{at:Date.now(),data});return data;
}

app.get("/api/health",(q,r)=>r.json({ok:true,version:"2.1",sources:["google-trends","google-news-products","google-news-videos"]}));
app.get("/api/feed",async(q,r)=>{try{
 const geo=String(q.query.geo||"IN").toUpperCase(),type=q.query.type||"search";
 let data=type==="product"?await getProducts(geo):type==="video"?await getVideos(geo):await getSearchTrends(geo);
 r.json({geo,type,fetchedAt:new Date().toISOString(),items:data,stats:{signals:data.length,hot:data.filter(x=>x.score>=80).length,lowCompetition:data.filter(x=>x.competition==="Low").length,exploding:data.filter(x=>x.stage==="Exploding").length}});
}catch(e){r.status(502).json({error:e.message})}});
app.get("/api/post-today",async(q,r)=>{try{
 const geo=String(q.query.geo||"IN").toUpperCase(),type=q.query.type||"search",platform=q.query.platform||"Any";
 let data=type==="product"?await getProducts(geo):type==="video"?await getVideos(geo):await getSearchTrends(geo);
 const a=data.map(t=>({...t,fitScore:clamp(t.score+(platform==="Any"||String(t.platform||"").includes(platform.split(" ")[0])?5:0)+(t.competition==="Low"?4:0),0,99)})).sort((a,b)=>b.fitScore-a.fitScore);
 r.json({opportunities:a.slice(0,5)});
}catch(e){r.status(502).json({error:e.message})}});
app.post("/api/generate",(q,r)=>{const t=String(q.body?.trend||"").trim(),p=q.body?.platform||"YouTube Shorts";if(!t)return r.status(400).json({error:"Trend required"});const h=hooks(t);r.json({hook:h[0],concept:`Explain why “${t}” is moving now, show the strongest useful angle, and finish with a clear verdict or question.`,script:`${h[1]} Here’s what changed, why people care, and the opportunity before this gets crowded.`,title:`${t}: Why This Is Trending Right Now`,caption:`${t} is gaining momentum. Here’s what changed and why it matters.`,keywords:`${t}, ${t} India, ${t} trend, ${t} latest, ${p}`,hashtags:`#trending #viral #trendalert #${t.replace(/[^a-z0-9]/gi,"").slice(0,24)}`,thumbnail:`Strong visual for ${t} with 2–4 words: WHY NOW?`})});
app.get("*",(q,r)=>r.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`TrendPulse V2.1 running on ${PORT}`));
