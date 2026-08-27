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
