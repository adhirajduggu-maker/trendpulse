
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
function classify(title, related=[]){
  const s = (title+" "+related.join(" ")).toLowerCase();
  const productWords = ["price","launch","phone","iphone","samsung","honda","car","bike","laptop","camera","watch","shoes","amazon","flipkart","buy","review","specs"];
  const videoWords = ["trailer","movie","song","video","episode","match","highlights","live","teaser"];
  if (productWords.some(x=>s.includes(x))) return "product";
  if (videoWords.some(x=>s.includes(x))) return "video";
  return "keyword";
}
function scoreTrend(traffic, published, title){
  const ageHours = Math.max(0.25,(Date.now()-new Date(published).getTime())/36e5);
  const volume = Math.min(45, Math.log10(Math.max(10,traffic))*10);
  const freshness = Math.max(5, 32 - ageHours*1.5);
  const intent = /(price|buy|review|launch|release|best|vs|how|near me)/i.test(title) ? 14 : 8;
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

async function getGoogleTrends(geo="IN"){
  geo = String(geo || "IN").toUpperCase().replace(/[^A-Z]/g,"").slice(0,2) || "IN";
  const key = `trends:${geo}`;
  const hit = cache.get(key);
  if (hit && Date.now()-hit.at < TTL) return {...hit.data, cached:true};

  const url = `https://trends.google.com/trending/rss?geo=${geo}`;
  const res = await fetch(url, {
    headers:{
      "User-Agent":"Mozilla/5.0 TrendPulse/1.0",
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
    const related = allTag(block,"ht:news_item_title").slice(0,3);
    const traffic = trafficNumber(trafficText);
    const score = scoreTrend(traffic,published,title);
    const type = classify(title,related);
    return {
      id:`g-${idx}-${Buffer.from(title).toString("base64url").slice(0,8)}`,
      title,
      type,
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
      news: newsTitles.map((t,i)=>({title:t,url:newsUrls[i]||""})).slice(0,3)
    };
  }).filter(x=>x.title);

  trends.sort((a,b)=>b.score-a.score || b.traffic-a.traffic);

  const data = {
    geo,
    fetchedAt:new Date().toISOString(),
    trends,
    stats:{
      signals:trends.length,
      exploding:trends.filter(x=>x.status==="Exploding").length,
      lowCompetition:trends.filter(x=>x.competition==="Low").length,
      hot:trends.filter(x=>x.score>=80).length
    }
  };
  cache.set(key,{at:Date.now(),data});
  return data;
}

app.get("/api/health",(req,res)=>res.json({ok:true,time:new Date().toISOString()}));

app.get("/api/trends", async (req,res)=>{
  try{
    const data = await getGoogleTrends(req.query.geo || "IN");
    res.set("Cache-Control","public, max-age=300");
    res.json(data);
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
  const short = platform.toLowerCase().includes("youtube") ? "Short" : "video";
  const result = {
    hook:`Everyone is searching for “${clean}” right now — but here’s the part most people are missing.`,
    concept:`Open with the trend on screen for 1–2 seconds. Show why people care, give one surprising fact or demonstration, then finish with a clear verdict or question.`,
    script:[
      `“You’ve probably seen ${clean} everywhere today.”`,
      `“Here’s why it suddenly started blowing up.”`,
      `“The interesting part is what happens next…”`,
      `“Would you try this, or is it overhyped?”`
    ].join(" "),
    title:`${clean}: Why Everyone Is Searching for This Right Now`,
    caption:`${clean} is picking up momentum fast. Here’s the quick breakdown. Save this before the trend gets crowded.`,
    keywords:[clean,"trending now","viral trend","rising searches",platform].join(", "),
    hashtags:["#trending","#viral","#trendalert", "#"+clean.replace(/[^a-z0-9]/gi,"").slice(0,24)].join(" "),
    thumbnail:`Use a large close-up visual related to ${clean}, one strong reaction element, and 2–4 words: “WHY NOW?”`
  };
  res.json(result);
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log(`TrendPulse running on http://localhost:${PORT}`));
