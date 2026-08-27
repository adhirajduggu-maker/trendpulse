# TrendPulse — Launch Ready V1

TrendPulse is a free-first live trend intelligence dashboard.

## Features
- Live Google Trends ingestion
- India, US, UK, Canada and Australia region selector
- TrendPulse opportunity scoring
- Competition and growth heuristics
- Search and category filters
- Free content generator
- Mobile-friendly dark dashboard

## Run locally

Install Node.js 20+, then:

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## Free deployment — Render

This project includes `render.yaml`.

### Recommended method

1. Create a free GitHub account/repository if you do not already have one.
2. Upload every file from this project to the repository.
3. Sign in to Render.
4. Choose **New → Blueprint** (or Web Service).
5. Connect your GitHub repository.
6. Render will detect `render.yaml`.
7. Choose the Free web-service plan if prompted.
8. Deploy.
9. Render will give you a public URL similar to:
   `https://trendpulse.onrender.com`

### Manual Web Service settings

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/api/health`

## Free-host caveat

Render free web services may sleep after inactivity, so the first visitor after an idle period can see a cold-start delay.

## Production roadmap

V1: Google Trends + TrendPulse scoring + free content generator
V1.1: trend detail pages and shareable URLs
V1.2: multi-source signal ingestion
V1.3: daily trend archive and SEO pages
V2: optional AI model integration and creator personalization


## V1.1 update
- Products is now a dedicated **Product Opportunities** feed.
- Videos is a dedicated short-form opportunity feed.
- Hooks is now populated from live trends.
- Keywords remains the raw live search-trend view.
- If there are not enough explicit product names in today's Google Trends RSS, Product Opportunities fills the list with clearly marked **derived commerce opportunities** rather than pretending they are verified trending products.


## V1.2 UI + monetization update
- Increased font sizes throughout the dashboard for readability.
- Improved mobile layout for phones and tablets.
- Sidebar becomes a mobile drawer.
- Trend rows simplify cleanly on small screens.
- Generator becomes single-column on mobile.
- Added reserved responsive Google AdSense banner areas.
- Added a native affiliate offer card.
- Added a sponsor placement card.
- Monetization placeholders are intentionally inactive until real ad/affiliate/sponsor IDs and links are added.


# TrendPulse V2.1 — Multi-Source India Fix

This build fixes the blank Products / Videos issue.

Sources:
- Search Trends: Google Trends RSS
- Products: Google News RSS queries focused on India launches, prices, deals, smartphones, wearables, laptops and ecommerce
- Videos: Google News RSS queries focused on viral videos, trailers, teasers, sports highlights and video topics
- Fallback: relevant Google Trends search signals if a dedicated source is temporarily thin

Important:
- Product/video entries from Google News are live topic signals, not ecommerce sales data.
- Fallback entries are transparently marked as derived from live search.
- TrendPulse score, competition and opportunity window are heuristic estimates.


# TrendPulse V2.2 — Platform-only Sources

India Product tab:
- Amazon India
- Flipkart
- Meesho
- No Google News product substitutions
- No generic news content

India Video tab:
- YouTube
- Instagram
- Facebook
- No news/search-engine video substitutions

Implementation notes:
- TrendPulse attempts to read publicly accessible marketplace/search pages.
- YouTube public search is parsed directly.
- Instagram and Facebook frequently require login or block automated public access. When they return no public results, TrendPulse shows no fabricated data.
- These sources can change markup or block hosting-provider IPs, so direct scraping is inherently less reliable than official APIs.
- TrendPulse score/growth/competition are still heuristic estimates, not marketplace sales or platform analytics.


## V2.3 source badge update
- Every Discover/Search result now shows a visible source badge.
- Supported badges: YouTube, Instagram, Facebook, Amazon, Flipkart, Meesho, Google Trends.
- Daily opportunity cards also show the source.
- Opportunity reports show the source prominently above the title.

## V2.4 Country-Aware Sources
Product feeds:
- India: Amazon India, Flipkart, Meesho
- United States: Amazon US, eBay US, Walmart
- United Kingdom: Amazon UK, eBay UK, Argos
- Canada: Amazon Canada, eBay Canada, Walmart Canada
- Australia: Amazon AU, eBay AU

Video feeds:
- YouTube, Instagram and Facebook public signals, queried with the selected country.
- No news substitution is used.

Discover sidebar remains user-friendly: Search Trends, Trending Products, Trending Videos, Post Today.
Individual results retain visible source badges.
Direct public-source access can be blocked by marketplaces/social networks; unavailable sources are not replaced with fabricated results.
