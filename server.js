
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({limit:"100kb"}));
app.use(express.static(path.join(__dirname, "public")));

const cache = new Map();
const TTL = 10 * 60 * 1000;

function stripCdata(s=""){
  return s.replace(/^<!\[CDATA\[/,"").replace(/\]\]>$/,"").trim();
}
function decodeXml(s=""){
  return stripCdata(s)
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function tag(block, name){
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decodeXml(m[1].trim()) : "";
}
function allTag(block, name){
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi");
  return [...block.matchAll(re)].map(m=>decodeXml(m[1].trim()));
}
function trafficNumber(s=""){
  const n = parseFloat((s.match(/[\d.]+/)||["0"])[0]);
  if (/M/i.test(s)) return n*1_000_000;
  if (/K/i.test(s)) return n*1_000;
  return n;
}
function scoreTrend(traffic, published, title){
  const ageHours = Math.max(0.25,(Date.now()-new Date(published).getTime())/36e5);
  const volume = Math.min(45, Math.log10(Math.max(10,traffic))*10);
  const freshness = Math.max(5, 32 - ageHours*1.5);
  const intent = /(price|buy|review|launch|release|best|vs|how|near me|sale|deal)/i.test(title) ? 14 : 8;
  return Math.max(42, Math.min(99, Math.round(volume+freshness+intent)));
}
function competition(score, traffic){
  if (traffic < 20_000 && score >= 75) return "Low";
  if (traffic < 100_000) return "Medium";
  return "High";
}
function growthEstimate(score, traffic){
  const base = Math.round((score-40)*5 + Math.min(500, Math.log10(Math.max(10,traffic))*55));
  return Math.max(24, base);
}
function xmlItems(xml){
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
}
function commerceScore(title, related=[]){
  const s=(title+" "+related.join(" ")).toLowerCase();
  const strong=["price","buy","sale","deal","launch","review","specs","amazon","flipkart","iphone","phone","laptop","watch","camera","car","bike","shoes","headphones","earbuds","console","tablet"];
  const medium=["release","new","best","vs","shop","store","brand","model","edition"];
  let n=0;
  strong.forEach(w=>{if(s.includes(w))n+=3});
  medium.forEach(w=>{if(s.includes(w))n+=1});
  return n;
}
function videoScore(title, related=[]){
  const s=(title+" "+related.join(" ")).toLowerCase();
  const words=["video","trailer","teaser","song","movie","match","highlights","live","episode","interview","viral","clip","goal","review"];
  return words.reduce((n,w)=>n+(s.includes(w)?2:0),0);
}
function makeHook(title){
  const clean=title.replace(/[“”"]/g,"");
  const hooks=[
    `Why is everyone suddenly searching for ${clean}?`,
    `${clean} is blowing up — here’s what changed.`,
    `You’re about to see ${clean} everywhere.`,
    `This trend is moving faster than most people realize: ${clean}.`
  ];
  let h=0; for(const c of clean) h=(h+c.charCodeAt(0))%hooks.length;
  return hooks[h];
}
function productAngle(title){
  return `Commerce opportunity around “${title}”`;
}
function videoAngle(title){
  return `Short-form explainer: why “${title}” is trending`;
}

async function getGoogleTrends(geo="IN"){
  geo = String(geo || "IN").toUpperCase().replace(/[^A-Z]/g,"").slice(0,2) || "IN";
  const key = `trends:${geo}`;
  const hit = cache.get(key);
  if (hit && Date.now()-hit.at < TTL) return {...hit.data, cached:true};

  const url = `https://trends.google.com/trending/rss?geo=${geo}`;
  const res = await fetch(url, {
    headers:{
      "User-Agent":"Mozilla/5.0 TrendPulse/1.1",
      "Accept":"application/rss+xml,text/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!res.ok) throw new Error(`Google Trends returned ${res.status}`);
  const xml = await res.text();

  let trends = xmlItems(xml).map((block, idx)=>{
    const title = tag(block,"title");
    const trafficText = tag(block,"ht:approx_traffic") || tag(block,"approx_traffic");
    const picture = tag(block,"ht:picture") || "";
    const published = tag(block,"pubDate") || new Date().toUTCString();
    const newsTitles = allTag(block,"ht:news_item_title");
    const newsUrls = allTag(block,"ht:news_item_url");
    const related = newsTitles.slice(0,3);
    const traffic = trafficNumber(trafficText);
    const score = scoreTrend(traffic,published,title);
    return {
      id:`g-${idx}-${Buffer.from(title).toString("base64url").slice(0,8)}`,
      title,
      traffic,
      trafficText: trafficText || (traffic ? `${traffic}+` : "Rising"),
      published,
      ageHours: Math.max(0,Math.round((Date.now()-new Date(published).getTime())/36e5)),
      score,
      growth:growthEstimate(score,traffic),
      competition:competition(score,traffic),
      status:score>=86 ? "Exploding" : "Rising",
      source:"Google Trends",
      sourceUrl:`https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(title)}`,
      picture,
      related,
      commerceScore:commerceScore(title,related),
      videoScore:videoScore(title,related),
      news: newsTitles.map((t,i)=>({title:t,url:newsUrls[i]||""})).slice(0,3)
    };
  }).filter(x=>x.title);

  trends.sort((a,b)=>b.score-a.score || b.traffic-a.traffic);

  const data = {
    geo,
    fetchedAt:new Date().toISOString(),
    trends
  };
  cache.set(key,{at:Date.now(),data});
  return data;
}

function createViews(raw){
  const keywords = raw.map(t=>({...t, viewType:"keyword", label:"Live search trend", angle:`Keyword opportunity: ${t.title}`}));

  let products = raw
    .filter(t=>t.commerceScore>0)
    .sort((a,b)=>(b.commerceScore*12+b.score)-(a.commerceScore*12+a.score))
    .map(t=>({...t,viewType:"product",label:"Product signal",angle:productAngle(t.title)}));

  // Keep Products useful even when today's feed contains few explicit product names.
  // Fallback items are transparently labeled "Commerce opportunity", not asserted as products.
  if(products.length<10){
    const used=new Set(products.map(x=>x.id));
    const fallback=raw.filter(t=>!used.has(t.id)).slice(0,10-products.length)
      .map(t=>({...t,viewType:"product",label:"Commerce opportunity",angle:productAngle(t.title),derived:true}));
    products=products.concat(fallback);
  }

  let videos = raw
    .slice()
    .sort((a,b)=>(b.videoScore*10+b.score)-(a.videoScore*10+a.score))
    .slice(0,20)
    .map(t=>({...t,viewType:"video",label:t.videoScore>0?"Video signal":"Video opportunity",angle:videoAngle(t.title),derived:t.videoScore===0}));

  const hooks = raw.slice(0,20).map(t=>({
    ...t,
    viewType:"hook",
    label:"Generated hook",
    angle:makeHook(t.title),
    hook:makeHook(t.title),
    derived:true
  }));

  return {all:keywords, product:products, video:videos, hook:hooks, keyword:keywords};
}

app.get("/api/health",(req,res)=>res.json({ok:true,version:"1.1",time:new Date().toISOString()}));

app.get("/api/trends", async (req,res)=>{
  try{
    const data = await getGoogleTrends(req.query.geo || "IN");
    const views = createViews(data.trends);
    const view = ["all","product","video","hook","keyword"].includes(req.query.view) ? req.query.view : "all";
    const trends=views[view];
    res.set("Cache-Control","public, max-age=300");
    res.json({
      geo:data.geo,
      fetchedAt:data.fetchedAt,
      view,
      trends,
      counts:{
        all:views.all.length,
        product:views.product.length,
        video:views.video.length,
        hook:views.hook.length,
        keyword:views.keyword.length
      },
      stats:{
        signals:trends.length,
        exploding:trends.filter(x=>x.status==="Exploding").length,
        lowCompetition:trends.filter(x=>x.competition==="Low").length,
        hot:trends.filter(x=>x.score>=80).length
      }
    });
  }catch(err){
    console.error(err);
    res.status(502).json({error:"Could not load live trends",detail:err.message});
  }
});

app.post("/api/generate",(req,res)=>{
  const trend = String(req.body?.trend || "").trim().slice(0,120);
  const platform = String(req.body?.platform || "YouTube Shorts").slice(0,40);
  if(!trend) return res.status(400).json({error:"Trend is required"});
  const clean = trend.replace(/[<>]/g,"");
  res.json({
    hook:`Everyone is searching for “${clean}” right now — but here’s the part most people are missing.`,
    concept:`Open with the trend on screen for 1–2 seconds. Explain why people care, show the strongest visual or useful angle, then end with a clear verdict or question.`,
    script:`“You’ve probably seen ${clean} everywhere today. Here’s why it suddenly started blowing up. The interesting part is what happens next. Would you jump on this trend or skip it?”`,
    title:`${clean}: Why Everyone Is Searching for This Right Now`,
    caption:`${clean} is picking up momentum fast. Here’s the quick breakdown. Save this before the trend gets crowded.`,
    keywords:[clean,"trending now","viral trend","rising searches",platform].join(", "),
    hashtags:["#trending","#viral","#trendalert","#"+clean.replace(/[^a-z0-9]/gi,"").slice(0,24)].join(" "),
    thumbnail:`Use a large visual related to ${clean}, one strong focal point, and 2–4 words: “WHY NOW?”`
  });
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`TrendPulse V1.1 running on http://localhost:${PORT}`));
