
const express=require("express"), path=require("path");
const app=express(), PORT=process.env.PORT||3000;
app.use(express.json({limit:"100kb"}));
app.use(express.static(path.join(__dirname,"public")));

const CACHE=new Map(), TTL=10*60*1000;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const decode=s=>(s||"").replace(/^<!\[CDATA\[/,"").replace(/\]\]>$/,"")
.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'")
.replace(/&lt;/g,"<").replace(/&gt;/g,">").trim();
const tag=(b,n)=>{const m=b.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`,"i"));return m?decode(m[1]):""};
const items=x=>[...x.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
function hash(s){let n=0;for(const c of String(s))n=(n*31+c.charCodeAt(0))>>>0;return n}
function traffic(s=""){let n=parseFloat((s.match(/[\d.]+/)||["0"])[0]);if(/M/i.test(s))n*=1e6;if(/K/i.test(s))n*=1e3;return n}
function ageHours(d){const x=new Date(d).getTime();return Number.isFinite(x)?Math.max(0,Math.round((Date.now()-x)/36e5)):0}
function score(v,date,title,bonus=0){
 const age=Math.max(.2,(Date.now()-new Date(date).getTime())/36e5);
 return clamp(Math.round(Math.min(45,Math.log10(Math.max(10,v||1000))*10)+Math.max(5,32-age*1.2)+(/price|deal|sale|review|launch|viral|trending|shorts|reels/i.test(title)?14:8)+bonus),45,99);
}
function comp(s,v){if(v<20000&&s>=75)return"Low";if(v<100000)return"Medium";return"High"}
function stage(s,a){if(a<8&&s>=86)return"Exploding";if(a<20&&s>=74)return"Early Rising";if(a<48)return"Rising";return"Established"}
function hooks(t){
 const a=[`Why is everyone suddenly searching for “${t}”?`,`You’re about to see “${t}” everywhere. Here’s why.`,`Before you jump on “${t}”, know these 3 things.`,`“${t}” is moving fast — here’s the angle most creators will miss.`];
 let i=hash(t)%a.length; return[a[i],a[(i+1)%a.length],a[(i+2)%a.length]];
}
function productEnrich(x){
 const w=x.stage==="Exploding"?"24–72 hours":x.stage==="Early Rising"?"3–7 days":"2–5 days";
 return {...x,type:"product",window:w,platform:"YouTube Shorts / Reels",monetization:"High",hooks:hooks(x.title),
 why:`TrendPulse found this product signal on ${x.marketplace}. It is ranked using freshness, marketplace presence and commercial intent.`,
 action:`Create a product-led short: problem → product → proof/demo → verdict. Use a clearly disclosed affiliate link if you monetize.`,
 keywords:[x.title,`${x.title} review`,`${x.title} price`,`${x.title} India`,`${x.title} deal`],
 creators:["Affiliate creators","UGC creators","Deal pages","Product reviewers"]};
}
function videoEnrich(x){
 const w=x.stage==="Exploding"?"24–48 hours":x.stage==="Early Rising"?"2–4 days":"2–5 days";
 return {...x,type:"video",window:w,platform:x.platformName,monetization:"Medium",hooks:hooks(x.title),
 why:`TrendPulse found this public video/topic signal on ${x.platformName}. It is ranked using freshness and engagement-oriented intent.`,
 action:`Create a fast reaction, explainer or remix angle while the topic is still gaining attention. Avoid re-uploading copyrighted footage.`,
 keywords:[x.title,`${x.title} viral`,`${x.title} latest`,`${x.title} shorts`,`${x.title} reels`],
 creators:["Short-form creators","Reaction pages","Commentary channels","Theme pages"]};
}

async function fetchText(url,headers={},timeoutMs=6500){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",...headers},redirect:"follow",signal:controller.signal});
  if(!r.ok)throw Error(`${new URL(url).hostname} returned ${r.status}`);
  return await r.text();
 }catch(e){
  if(e.name==="AbortError")throw Error(`${new URL(url).hostname} timed out`);
  throw e;
 }finally{clearTimeout(timer)}
}

/* ---------- Search trends remain Google Trends only ---------- */
async function getSearchTrends(geo="IN"){
 const key=`search:${geo}`,hit=CACHE.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.data;
 const xml=await fetchText(`https://trends.google.com/trending/rss?geo=${geo}`);
 const data=items(xml).map((b,i)=>{
   const title=tag(b,"title"),tt=tag(b,"ht:approx_traffic")||"Rising",pub=tag(b,"pubDate")||new Date().toUTCString(),v=traffic(tt),a=ageHours(pub),sc=score(v,pub,title);
   return {id:`s-${i}-${hash(title)}`,title,traffic:v,trafficText:tt,published:pub,ageHours:a,score:sc,growth:clamp(100+(sc-50)*6,25,700),competition:comp(sc,v),stage:stage(sc,a),source:"Google Trends",sourceUrl:`https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(title)}`};
 }).filter(x=>x.title).sort((a,b)=>b.score-a.score);
 CACHE.set(key,{at:Date.now(),data});return data;
}

/* ---------- PRODUCT SOURCES: AMAZON / FLIPKART / MEESHO ONLY ---------- */

function extractJsonLdProducts(html, marketplace){
 const out=[], seen=new Set();
 const scripts=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 for(const raw of scripts){
   try{
     const j=JSON.parse(raw.trim());
     const arr=Array.isArray(j)?j:[j];
     const walk=o=>{
       if(!o||typeof o!=="object")return;
       if((o["@type"]==="Product"||o["@type"]?.includes?.("Product"))&&o.name){
         const name=String(o.name).trim();
         const url=o.url||o.offers?.url||"";
         const k=name.toLowerCase();
         if(name.length>3&&!seen.has(k)){seen.add(k);out.push({title:name,url});}
       }
       for(const v of Object.values(o)) if(v&&typeof v==="object") Array.isArray(v)?v.forEach(walk):walk(v);
     }; arr.forEach(walk);
   }catch{}
 }
 return out.slice(0,30).map((x,i)=>({marketplace,...x,rank:i+1}));
}

function extractAmazon(html){
 let rows=extractJsonLdProducts(html,"Amazon India");
 if(rows.length)return rows;
 const out=[],seen=new Set();
 const re=/<a[^>]+class="[^"]*(?:a-link-normal|a-text-normal)[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
 for(const m of html.matchAll(re)){
   const text=m[2].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
   if(text.length<8||text.length>180)continue;
   const k=text.toLowerCase();if(seen.has(k))continue;seen.add(k);
   out.push({marketplace:"Amazon India",title:text,url:m[1].startsWith("http")?m[1]:`https://www.amazon.in${m[1]}`,rank:out.length+1});
   if(out.length>=25)break;
 }
 return out;
}
function extractFlipkart(html){
 let rows=extractJsonLdProducts(html,"Flipkart");
 if(rows.length)return rows;
 const out=[],seen=new Set();
 for(const m of html.matchAll(/<a[^>]+href="([^"]*\/p\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)){
   const text=m[2].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
   if(text.length<6||text.length>180)continue;const k=text.toLowerCase();if(seen.has(k))continue;seen.add(k);
   out.push({marketplace:"Flipkart",title:text,url:m[1].startsWith("http")?m[1]:`https://www.flipkart.com${m[1]}`,rank:out.length+1});
   if(out.length>=25)break;
 }
 return out;
}
function extractMeesho(html){
 let rows=extractJsonLdProducts(html,"Meesho");
 if(rows.length)return rows;
 const out=[],seen=new Set();
 for(const m of html.matchAll(/<a[^>]+href="([^"]*\/[^"]+\/p\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)){
   const text=m[2].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
   if(text.length<6||text.length>180)continue;const k=text.toLowerCase();if(seen.has(k))continue;seen.add(k);
   out.push({marketplace:"Meesho",title:text,url:m[1].startsWith("http")?m[1]:`https://www.meesho.com${m[1]}`,rank:out.length+1});
   if(out.length>=25)break;
 }
 return out;
}
const COUNTRY={
 IN:{name:"India",amazon:"amazon.in",amazonLabel:"Amazon India",flipkart:true,meesho:true},
 US:{name:"United States",amazon:"amazon.com",amazonLabel:"Amazon US",ebay:"ebay.com",ebayLabel:"eBay US",walmart:"walmart.com",walmartLabel:"Walmart"},
 GB:{name:"United Kingdom",amazon:"amazon.co.uk",amazonLabel:"Amazon UK",ebay:"ebay.co.uk",ebayLabel:"eBay UK",argos:true},
 CA:{name:"Canada",amazon:"amazon.ca",amazonLabel:"Amazon Canada",ebay:"ebay.ca",ebayLabel:"eBay Canada",walmart:"walmart.ca",walmartLabel:"Walmart Canada"},
 AU:{name:"Australia",amazon:"amazon.com.au",amazonLabel:"Amazon AU",ebay:"ebay.com.au",ebayLabel:"eBay AU"}
};

function cleanText(html=""){
 return html.replace(/<script[\s\S]*?<\/script>/gi," ")
   .replace(/<style[\s\S]*?<\/style>/gi," ")
   .replace(/<[^>]+>/g," ")
   .replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
}
function strictLinks(html, host, label, pathRegex){
 const out=[],seen=new Set();
 for(const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
   let href=m[1]; if(href.startsWith("//"))href="https:"+href;
   if(href.startsWith("/"))href=`https://${host}${href}`;
   if(!href.startsWith("http"))continue;
   let u; try{u=new URL(href)}catch{continue}
   if(!u.hostname.includes(host.replace(/^www\./,"")))continue;
   if(!pathRegex.test(u.pathname))continue;
   let text=normalizeProductTitle(cleanText(m[2]));
   if(text.length<8||text.length>180)continue;
   if(/sign in|account|cart|privacy|terms|help|menu|shop by|category|see all|sponsored/i.test(text))continue;
   const key=(u.pathname+"|"+text.toLowerCase());
   if(seen.has(key))continue; seen.add(key);
   out.push({marketplace:label,title:text,url:u.href,rank:out.length+1});
   if(out.length>=30)break;
 }
 return out;
}
async function amazonSearch(domain,label,q){
 const html=await fetchText(`https://www.${domain}/s?k=${encodeURIComponent(q)}`);
 let rows=extractJsonLdProducts(html,label).filter(x=>/\/(?:dp|gp\/product)\//i.test(x.url||""));
 if(rows.length)return rows;
 return strictLinks(html,domain,label,/\/(?:dp|gp\/product)\//i);
}
async function ebaySearch(domain,label,q){
 const html=await fetchText(`https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(q)}&_sop=10`);
 let rows=extractJsonLdProducts(html,label).filter(x=>/\/itm\//i.test(x.url||""));
 if(rows.length)return rows;
 return strictLinks(html,domain,label,/\/itm\//i);
}
async function walmartSearch(domain,label,q){
 const html=await fetchText(`https://www.${domain}/search?q=${encodeURIComponent(q)}`);
 let rows=extractJsonLdProducts(html,label).filter(x=>/\/ip\//i.test(x.url||""));
 if(rows.length)return rows;
 return strictLinks(html,domain,label,/\/ip\//i);
}
async function argosSearch(q){
 const html=await fetchText(`https://www.argos.co.uk/search/${encodeURIComponent(q)}/`);
 let rows=extractJsonLdProducts(html,"Argos").filter(x=>/\/product\//i.test(x.url||""));
 if(rows.length)return rows;
 return strictLinks(html,"argos.co.uk","Argos",/\/product\//i);
}
async function marketplaceSearch(source,query,geo="IN"){
 const c=COUNTRY[geo]||COUNTRY.IN,q=String(query);
 if(source==="amazon")return amazonSearch(c.amazon,c.amazonLabel,q);
 if(source==="flipkart"){const html=await fetchText(`https://www.flipkart.com/search?q=${encodeURIComponent(q)}`);return extractFlipkart(html)}
 if(source==="meesho"){const html=await fetchText(`https://www.meesho.com/search?q=${encodeURIComponent(q)}`);return extractMeesho(html)}
 if(source==="ebay")return ebaySearch(c.ebay,c.ebayLabel,q);
 if(source==="walmart")return walmartSearch(c.walmart,c.walmartLabel,q);
 if(source==="argos")return argosSearch(q);
 return [];
}


function normalizeProductTitle(t=""){
 let s=String(t||"").replace(/\s+/g," ").trim();
 s=s.replace(/\s+(?:₹|Rs\.?|INR|\$|USD|£|GBP|€|EUR|C\$|A\$)\s*[\d,.]+(?:\s*(?:onwards|only)?)?$/i,"").trim();
 s=s.replace(/\s+\d{1,3}%\s*(?:off|discount).*$/i,"").trim();
 s=s.replace(/\s+(?:deal price|sale price|special price|mrp|price)\s*[:\-]?\s*(?:₹|Rs\.?|\$|£|€)?\s*[\d,.]+.*$/i,"").trim();
 return s;
}

function looksLikeProductTitle(t=""){
 const s=String(t||"").replace(/\s+/g," ").trim();
 if(s.length<8||s.length>180)return false;
 if(/^(?:₹|Rs\.?|INR|\$|USD|£|GBP|€|EUR|C\$|A\$)\s*[\d,.]+(?:\s*[-–]\s*(?:₹|Rs\.?|\$|£|€)?\s*[\d,.]+)?$/i.test(s))return false;
 if(/^(?:from|starting at|only|now)\s*(?:₹|Rs\.?|INR|\$|USD|£|GBP|€|EUR|C\$|A\$)\s*[\d,.]+/i.test(s))return false;
 if(/^\d{1,3}%\s*(?:off|discount)$/i.test(s))return false;
 if(/^(?:save|discount|offer)\s*(?:₹|Rs\.?|\$|£|€)?\s*[\d,.%]+/i.test(s))return false;
 if(/^(?:mrp|price|deal price|sale price|special price)\b/i.test(s))return false;
 const letters=(s.match(/[A-Za-z]/g)||[]).length;
 const digits=(s.match(/\d/g)||[]).length;
 if(letters<4 && digits>=letters)return false;
 if(/^(home|shop|products?|categories|deals?|offers?|new arrivals?|best sellers?|see all|more|electronics|fashion|grocery|beauty|sports|toys|books)$/i.test(s))return false;
 if(/shop by|browse|category|customer service|account|login|sign in|cart|wishlist|footer|header|delivery|returns?|payment/i.test(s))return false;
 return true;
}

async function getProducts(geo="IN"){
 const c=COUNTRY[geo]||COUNTRY.IN,key=`products:${geo}`,hit=CACHE.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.data;
 let sources=["amazon"];if(c.flipkart)sources.push("flipkart");if(c.meesho)sources.push("meesho");if(c.ebay)sources.push("ebay");if(c.walmart)sources.push("walmart");if(c.argos)sources.push("argos");
 const queries=["trending","best seller","new launch"];
 const jobs=sources.map(async source=>{
   let rows=[];
   for(const q of queries){
     try{
       const r=await marketplaceSearch(source,q,geo);
       rows.push(...r);
       if(rows.length>=12)break;
     }catch(e){console.warn("product",geo,source,q,e.message)}
   }
   return {source,rows,available:rows.length>0,count:rows.length};
 });
 const results=await Promise.allSettled(jobs);
 const all=[],status=[];
 for(const x of results){
   if(x.status==="fulfilled"){all.push(...x.value.rows);status.push({source:x.value.source,available:x.value.available,count:x.value.count})}
 }
 const seen=new Set(),now=new Date().toUTCString(),rows=[];
 for(const x of all){
   x.title=normalizeProductTitle(x.title);
   if(!looksLikeProductTitle(x.title))continue;
   const k=(x.marketplace+"|"+x.title).toLowerCase();if(seen.has(k))continue;seen.add(k);
   const synthetic=Math.max(7000,50000-(x.rank||10)*1800),sc=clamp(score(synthetic,now,x.title,8)-Math.min(8,(x.rank||1)/3),55,98),a=Math.min(18,x.rank||5);
   rows.push(productEnrich({id:`p-${hash(k)}`,title:x.title,marketplace:x.marketplace,traffic:synthetic,trafficText:`${x.marketplace} signal`,published:now,ageHours:a,score:Math.round(sc),growth:clamp(280-(x.rank||1)*7,40,300),competition:(x.rank||99)<=8?"Low":"Medium",stage:(x.rank||99)<=5?"Early Rising":"Rising",source:x.marketplace,sourceUrl:x.url,verifiedSignal:true}));
 }
 rows.sort((a,b)=>b.score-a.score);
 const data=rows.slice(0,40);data.sourceStatus=status;CACHE.set(key,{at:Date.now(),data});return data;
}

/* ---------- VIDEO SOURCES: YOUTUBE / INSTAGRAM / FACEBOOK ONLY ---------- */

function ytInitialData(html){
 const pats=[/var ytInitialData = ({[\s\S]*?});<\/script>/, /ytInitialData"\s*:\s*({[\s\S]*?})\s*,\s*"ytInitialPlayerResponse"/];
 for(const p of pats){const m=html.match(p);if(m){try{return JSON.parse(m[1])}catch{}}}
 return null;
}
function walk(obj,fn){
 if(!obj||typeof obj!=="object")return;
 fn(obj);
 for(const v of Object.values(obj)) if(v&&typeof v==="object") Array.isArray(v)?v.forEach(x=>walk(x,fn)):walk(v,fn);
}
async function youtubeSearch(query,geo="IN"){
 const html=await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=${geo}`);
 const data=ytInitialData(html),out=[],seen=new Set();
 if(data)walk(data,o=>{
   const v=o.videoRenderer;
   if(v&&v.videoId&&v.title){
     const title=(v.title.runs||[]).map(x=>x.text).join("")||v.title.simpleText||"";
     if(title&&!seen.has(v.videoId)){seen.add(v.videoId);out.push({platformName:"YouTube",title,sourceUrl:`https://www.youtube.com/watch?v=${v.videoId}`,viewText:v.viewCountText?.simpleText||"",publishedText:v.publishedTimeText?.simpleText||""});}
   }
 });
 return out.slice(0,25);
}
async function publicPlatformSearch(platform,query){
 // Instagram and Facebook public search pages frequently require login.
 // We attempt public pages; if blocked, return zero rather than fabricating data.
 const url=platform==="Instagram"
  ?`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`
  :`https://www.facebook.com/search/videos/?q=${encodeURIComponent(query)}`;
 try{
   const html=await fetchText(url);
   const out=[],seen=new Set();
   const re=platform==="Instagram"
     ?/href="(\/(?:reel|p)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
     :/href="([^"]*\/videos\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
   for(const m of html.matchAll(re)){
     const text=m[2].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
     const href=m[1];if(!href||seen.has(href))continue;seen.add(href);
     out.push({platformName:platform,title:text||`${platform} video result for ${query}`,sourceUrl:href.startsWith("http")?href:`https://www.${platform.toLowerCase()}.com${href}`});
     if(out.length>=20)break;
   }
   return out;
 }catch{return []}
}
async function getVideos(geo="IN"){
 const key=`videos:${geo}`,hit=CACHE.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.data;
 const country=(COUNTRY[geo]||COUNTRY.IN).name;
 const ytQueries=[`trending ${country}`,`viral ${country}`,`shorts ${country}`];
 const ytSettled=await Promise.allSettled(ytQueries.map(q=>youtubeSearch(q,geo)));
 let raw=[];
 for(const x of ytSettled)if(x.status==="fulfilled")raw.push(...x.value);

 // Instagram/Facebook are best-effort only and may require login.
 const socialJobs=[
   publicPlatformSearch("Instagram",`trending ${country}`),
   publicPlatformSearch("Instagram",`viral ${country}`),
   publicPlatformSearch("Facebook",`trending ${country}`),
   publicPlatformSearch("Facebook",`viral ${country}`)
 ];
 const socialSettled=await Promise.allSettled(socialJobs);
 for(const x of socialSettled)if(x.status==="fulfilled")raw.push(...x.value);

 const seen=new Set(),now=new Date().toUTCString(),rows=[];
 for(const x of raw){
   const k=(x.platformName+"|"+x.sourceUrl).toLowerCase();if(seen.has(k))continue;seen.add(k);
   const rank=rows.filter(y=>y.platformName===x.platformName).length+1;
   const synthetic=Math.max(8000,65000-rank*1700),sc=clamp(score(synthetic,now,x.title,7)-rank/4,55,98);
   rows.push(videoEnrich({id:`v-${hash(k)}`,title:x.title||`${x.platformName} video`,platformName:x.platformName,traffic:synthetic,trafficText:x.viewText||`${x.platformName} public signal`,published:now,ageHours:Math.min(18,rank),score:Math.round(sc),growth:clamp(320-rank*8,40,340),competition:rank<=8?"Low":"Medium",stage:rank<=5?"Early Rising":"Rising",source:x.platformName,sourceUrl:x.sourceUrl,verifiedSignal:true}));
 }
 rows.sort((a,b)=>b.score-a.score);
 const data=rows.slice(0,50);CACHE.set(key,{at:Date.now(),data});return data;
}

app.get("/api/health",(q,r)=>r.json({ok:true,version:"agent-v2.3-fixed",countryAware:true,productSources:{IN:["Amazon India","Flipkart","Meesho"],US:["Amazon US","eBay US","Walmart"],GB:["Amazon UK","eBay UK","Argos"],CA:["Amazon Canada","eBay Canada","Walmart Canada"],AU:["Amazon AU","eBay AU"]},videoSources:["YouTube","Instagram","Facebook"]}));
app.get("/api/feed",async(q,r)=>{try{
 const geo=String(q.query.geo||"IN").toUpperCase(),type=q.query.type||"search";
 let data=type==="product"?await getProducts(geo):type==="video"?await getVideos(geo):await getSearchTrends(geo);
 const sourceStatus=type==="product"?(data.sourceStatus||[]):[];
 r.json({geo,type,fetchedAt:new Date().toISOString(),items:data,sourceStatus,stats:{signals:data.length,hot:data.filter(x=>x.score>=80).length,lowCompetition:data.filter(x=>x.competition==="Low").length,exploding:data.filter(x=>x.stage==="Exploding").length}});
}catch(e){r.status(502).json({error:e.message})}});
app.get("/api/post-today",async(q,r)=>{try{
 const geo=String(q.query.geo||"IN").toUpperCase(),type=q.query.type||"search",platform=q.query.platform||"Any";
 let data=type==="product"?await getProducts(geo):type==="video"?await getVideos(geo):await getSearchTrends(geo);
 const a=data.map(t=>({...t,fitScore:clamp(t.score+(platform==="Any"||String(t.platform||t.platformName||"").includes(platform.split(" ")[0])?5:0)+(t.competition==="Low"?4:0),0,99)})).sort((a,b)=>b.fitScore-a.fitScore);
 r.json({opportunities:a.slice(0,5)});
}catch(e){r.status(502).json({error:e.message})}});
app.post("/api/generate",(q,r)=>{
 const b=q.body||{},t=String(b.trend||b.title||"").trim();if(!t)return r.status(400).json({error:"Opportunity required"});
 const intent=b.intent||b.type||"video", platform=b.platform||"YouTube Shorts", goal=normGoal(b.goal), geo=b.geo||"US", source=b.source||"", stage=b.stage||"Rising", competition=b.competition||"Medium", score=b.score||"";
 const hs=intent==="product"
 ?[`I found a product people are starting to notice — but is ${t} actually worth it?`,`Before you buy ${t}, watch this.`,`The reason ${t} is getting attention is simpler than you think.`]
 :intent==="search"
 ?[`Why is everyone suddenly searching for “${t}”?`,`“${t}” is rising right now — here’s what people actually want to know.`,`This search trend is moving fast: ${t}.`]
 :[`This ${t} trend is taking off — here’s the angle most creators are missing.`,`Before everyone copies ${t}, understand why it’s working.`,`${t} is gaining attention fast — use this angle before it gets crowded.`];
 let script,shots,cta;
 if(intent==="product"){
  script=`${hs[0]} Start with the buyer problem this product solves. Show the product immediately, demonstrate the most useful feature, then explain one real advantage and one limitation. Close with a clear verdict for the person most likely to benefit from it.`;
  shots=["0–3s: Show the problem + product immediately","3–8s: Close-up/demo of the key feature","8–18s: Show the product solving the problem","18–25s: One benefit + one limitation","25–30s: Verdict + CTA"];
  cta=goal==="Affiliate Sales"?"If it fits your needs, check the disclosed product link for the current offer.":"Would you actually use this? Comment below.";
 }else if(intent==="search"){
  script=`${hs[0]} Explain in one sentence what the term means or what triggered interest. Answer the main question searchers are trying to solve, add one useful fact or practical takeaway, then point viewers to a deeper resource.`;
  shots=["0–3s: Put the exact search question on screen","3–10s: Explain why it is rising","10–22s: Give the useful answer","22–28s: Add one takeaway","28–32s: CTA"];
  cta=goal==="Traffic"?"Read the full breakdown on our site.":"Follow for the next trend before it peaks.";
 }else{
  script=`${hs[0]} Open with the most visually interesting moment or question. Explain why the trend is getting attention without pretending unverified facts are true. Add your own angle, reaction or useful context, then end with a question that encourages discussion.`;
  shots=["0–2s: Pattern-interrupt visual + hook","2–7s: Show/explain the trend","7–18s: Your unique angle or context","18–26s: Payoff","26–30s: Comment/share CTA"];
  cta=goal==="Audience Growth"?"What do you think — trend or temporary hype?":"Follow for the next opportunity.";
 }
 const title=intent==="product"?`${t}: Worth the Hype?`:intent==="search"?`${t} Is Trending — Here’s Why`:`Why ${t} Is Blowing Up Right Now`;
 r.json({context:{intent,geo,source,stage,competition,score,platform,goal},hooks:hs,hook:hs[0],script,shots,cta,title,caption:`${t} is gaining attention right now. Here’s the useful angle without the hype. ${cta}`,keywords:[t,`${t} trend`,`${t} ${geo}`,`${t} latest`,intent==="product"?`${t} review`:`${t} explained`],hashtags:["#trending","#trendalert",`#${t.replace(/[^a-z0-9]/gi,"").slice(0,24)}`],thumbnail:intent==="product"?"WORTH IT?":intent==="search"?"WHY NOW?":"GOING VIRAL?"});
});


function normGoal(g="Audience Growth"){
 return ["Audience Growth","Affiliate Sales","Traffic","Lead Generation"].includes(g)?g:"Audience Growth";
}
function agentBoost(t,{niche="All",platform="Any",goal="Audience Growth"}={}){
 let s=Number(t.score||60);
 const text=(String(t.title||"")+" "+(t.keywords||[]).join(" ")).toLowerCase();
 if(niche&&niche!=="All"&&text.includes(niche.toLowerCase()))s+=6;
 if(platform&&platform!=="Any"&&String(t.platform||t.platformName||"").toLowerCase().includes(platform.split(" ")[0].toLowerCase()))s+=5;
 if(goal==="Affiliate Sales"&&t.type==="product")s+=10;
 if(goal==="Audience Growth"&&t.type==="video")s+=6;
 if(goal==="Traffic"&&t.type==="search")s+=6;
 if(t.competition==="Low")s+=5;
 if(t.stage==="Exploding")s+=5;
 return clamp(Math.round(s),0,99);
}
function moneyAngle(t,goal){
 if(goal==="Affiliate Sales")return t.type==="product"
   ?"Direct affiliate review/demo opportunity."
   :"Use this content to lead viewers toward a relevant commercial offer.";
 if(goal==="Lead Generation")return "Use the trend as a problem-awareness entry point and offer a useful lead magnet.";
 if(goal==="Traffic")return "Create search-led content with a clear CTA to a detailed page or tool.";
 return "Prioritize reach and engagement first; monetize later with affiliate links, sponsors or your own offer.";
}
function actionPlan(t,goal){
 const hs=t.hooks||hooks(t.title);
 return {
   priority:Number(t.score||0)>=88?"Act now":Number(t.score||0)>=78?"Act today":"Test selectively",
   moneyAngle:moneyAngle(t,goal),
   nextSteps:[
     `Publish one short-form post around “${t.title}”.`,
     `Use this hook: ${hs[0]||""}`,
     goal==="Affiliate Sales"?"Add a clearly disclosed affiliate CTA where relevant.":"Use a CTA aligned with your goal.",
     "Re-check the opportunity tomorrow and stop if momentum cools."
   ]
 };
}
async function agentPool(geo){
 const [searchRes, productRes, videoRes]=await Promise.allSettled([
   getSearchTrends(geo),
   getProducts(geo),
   getVideos(geo)
 ]);
 const search=searchRes.status==="fulfilled"?searchRes.value:[];
 const products=productRes.status==="fulfilled"?productRes.value:[];
 const videos=videoRes.status==="fulfilled"?videoRes.value:[];
 return [
   ...search.slice(0,20).map(x=>({...x,type:"search"})),
   ...products.slice(0,20).map(x=>({...x,type:"product"})),
   ...videos.slice(0,20).map(x=>({...x,type:"video"}))
 ];
}

function withTimeout(promise,ms=15000,label="Request"){
 return Promise.race([
   promise,
   new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timed out`)),ms))
 ]);
}

app.get("/api/agent/recommendations",async(q,r)=>{try{
 const geo=String(q.query.geo||"US").toUpperCase(), niche=q.query.niche||"All", platform=q.query.platform||"Any", goal=normGoal(q.query.goal), intent=q.query.intent||"video";
 let source=await withTimeout(intent==="product"?getProducts(geo):intent==="search"?getSearchTrends(geo):getVideos(geo),15000,`${intent} discovery`);
 if(!Array.isArray(source))source=[];
 let pool=source.slice(0,40).map(x=>({...x,type:intent}));
 let ranked=pool.map(t=>({...t,agentScore:agentBoost(t,{niche,platform,goal}),plan:actionPlan(t,goal)})).sort((a,b)=>b.agentScore-a.agentScore||b.score-a.score);
 r.json({geo,niche,platform,goal,intent,fetchedAt:new Date().toISOString(),recommendations:ranked.slice(0,12)});
}catch(e){r.status(502).json({error:e.message})}});
app.post("/api/agent/brief",async(q,r)=>{try{
 const geo=String(q.body?.geo||"US").toUpperCase(), niche=q.body?.niche||"All", platform=q.body?.platform||"Any", goal=normGoal(q.body?.goal), watch=Array.isArray(q.body?.watchlist)?q.body.watchlist:[];
 let pool=await agentPool(geo), byId=new Map(pool.map(x=>[x.id,x]));
 let watched=watch.map(id=>byId.get(id)).filter(Boolean).map(t=>({...t,plan:actionPlan(t,goal)}));
 let ranked=pool.map(t=>({...t,agentScore:agentBoost(t,{niche,platform,goal})})).sort((a,b)=>b.agentScore-a.agentScore);
 r.json({headline:watched.length?`${watched.length} tracked opportunities are still active.`:"Your fresh daily opportunities are ready.",newOpportunities:ranked.slice(0,3),watched,note:"TrendPulse Agent compares current live signals when you open the app. Background alerts require persistent storage and a scheduled worker."});
}catch(e){r.status(502).json({error:e.message})}});

app.get("*",(q,r)=>r.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`TrendPulse Agent V2.3 Fixed running on ${PORT}`));
