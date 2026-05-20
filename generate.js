import fetch from 'node-fetch';
import fs from 'fs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`API error: ${JSON.stringify(data)}`);

  const raw = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const clean = raw.replace(/```json|```/g, '').trim();
  const i = clean.indexOf('{');
  const j = clean.lastIndexOf('}');
  if (i === -1 || j === -1) throw new Error('No JSON in response');
  return JSON.parse(clean.slice(i, j + 1));
}

async function fetchStockQuote(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose;
    const change = price - prev;
    const pct = (change / prev) * 100;
    return { price, change, pct };
  } catch {
    return null;
  }
}

function getWeekRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(now)}, ${now.getFullYear()}`;
}

function tagClass(topic) {
  if (!topic) return 'tag-general';
  const t = topic.toLowerCase();
  if (t.includes('programmatic') || t.includes('dsp')) return 'tag-programmatic';
  if (t.includes('privacy') || t.includes('identity') || t.includes('cookie')) return 'tag-privacy';
  if (t.includes('ctv') || t.includes('stream')) return 'tag-ctv';
  if (t.includes('retail')) return 'tag-retail';
  if (t.includes('ai') || t.includes('artificial')) return 'tag-ai';
  if (t.includes('fed') || t.includes('rate')) return 'tag-rates';
  if (t.includes('m&a') || t.includes('merger')) return 'tag-ma';
  if (t.includes('ad spend') || t.includes('spend')) return 'tag-adspend';
  return 'tag-general';
}

function fmtPrice(p) {
  if (p === null || p === undefined) return '—';
  return p >= 1000
    ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : p.toFixed(2);
}

function renderArticles(articles) {
  return articles.map(a => {
    const tc = tagClass(a.topic);
    const link = a.url ? `<a class="article-link" href="${a.url}" target="_blank">read →</a>` : '';
    return `<div class="article-card">
      <div class="article-top"><div class="article-title">${a.title}</div>${link}</div>
      <div class="article-meta"><span>${a.publication}</span><span class="tag ${tc}">${a.topic}</span></div>
      <div class="article-blurb">${a.blurb}</div>
    </div>`;
  }).join('');
}

function renderStockGroup(stocks, quotes) {
  return stocks.map((s, i) => {
    const q = quotes[i];
    const priceHTML = q
      ? `<div class="stock-price">$${fmtPrice(q.price)}</div>
         <div class="stock-change ${q.change >= 0 ? 'up' : 'down'}">
           ${q.change >= 0 ? '▲' : '▼'} ${Math.abs(q.pct).toFixed(2)}%
           <span class="change-abs">(${q.change >= 0 ? '+' : ''}${fmtPrice(q.change)})</span>
         </div>`
      : `<div class="stock-price flat">—</div>`;
    return `<div class="stock-card">
      <div class="stock-ticker">${s.t}</div>
      <div class="stock-name">${s.n}</div>
      ${priceHTML}
    </div>`;
  }).join('');
}

const ADTECH_STOCK_GROUPS = [
  { tier: 'Tier 1 — Direct comps', stocks: [
    { t: 'TTD', n: 'The Trade Desk' },
    { t: 'DV', n: 'DoubleVerify' },
    { t: 'IAS', n: 'Integral Ad Science' },
    { t: 'MGNI', n: 'Magnite' },
    { t: 'RAMP', n: 'LiveRamp' },
  ]},
  { tier: 'Tier 2 — Industry bellwethers', stocks: [
    { t: 'PUBM', n: 'PubMatic' },
    { t: 'DSP', n: 'Viant Technology' },
    { t: 'APP', n: 'AppLovin' },
    { t: 'GOOGL', n: 'Alphabet' },
    { t: 'META', n: 'Meta Platforms' },
  ]},
  { tier: 'Tier 3 — Thematic / strategic', stocks: [
    { t: 'FOUR', n: 'Outbrain/Teads' },
    { t: 'CRTO', n: 'Criteo' },
    { t: 'STGW', n: 'Stagwell' },
  ]},
];

const MACRO_STOCK_GROUPS = [
  { tier: 'Major indices', stocks: [
    { t: '^GSPC', n: 'S&P 500' },
    { t: '^IXIC', n: 'Nasdaq' },
    { t: '^DJI', n: 'Dow Jones' },
    { t: '^RUT', n: 'Russell 2000' },
  ]},
  { tier: 'Sector ETFs', stocks: [
    { t: 'XLC', n: 'Comm. Services' },
    { t: 'XLK', n: 'Technology' },
    { t: 'XLY', n: 'Consumer Disc.' },
    { t: 'IYZ', n: 'Telecom' },
  ]},
  { tier: 'Rates & commodities', stocks: [
    { t: '^TNX', n: '10Y Treasury' },
    { t: '^IRX', n: '3M T-Bill' },
    { t: 'GLD', n: 'Gold ETF' },
    { t: 'DX-Y.NYB', n: 'US Dollar Index' },
  ]},
];

async function main() {
  console.log('Generating AdTech digest...');
  const adtechDigest = await callClaude(
    `You are an AdTech industry analyst. Search the web for the most important AdTech news articles published in the past 7 days. Focus on: Programmatic/DSPs, Privacy & identity, CTV/streaming, Retail media, AI in advertising, General industry news. Prioritize AdExchanger, Digiday, MediaPost, Ad Age, The Trade Desk Blog, Campaign, Marketing Brew. Return ONLY valid JSON (no markdown, no backticks, no preamble): {"summary":"3-4 sentence executive summary of the most important themes this week","articles":[{"title":"","publication":"","topic":"","blurb":"1-2 sentences on why this matters","url":"real URL or null"}]} Return 8 articles. Only JSON.`
  );
  console.log('AdTech digest done.');

  console.log('Generating macro digest...');
  const macroDigest = await callClaude(
    `You are a macro economist and financial analyst. Search the web for the most important macro economic and financial news from the past 7 days that a corporate development executive at an adtech company should track. Focus on: US economy, interest rates/Fed policy, advertising spend forecasts, digital media M&A, tech sector earnings, trade/tariff impacts on media, consumer spending trends. Prioritize WSJ, FT, Bloomberg, Reuters, NYT Business, Axios Markets. Return ONLY valid JSON (no markdown, no backticks, no preamble): {"summary":"3-4 sentence executive summary of macro themes most relevant to adtech corporate development this week","articles":[{"title":"","publication":"","topic":"one of: Fed/rates, M&A, Ad spend, Tech earnings, Trade/tariffs, Consumer, Economy","blurb":"1-2 sentences on why this matters for adtech","url":"real URL or null"}]} Return 8 articles. Only JSON.`
  );
  console.log('Macro digest done.');

  console.log('Fetching stock quotes...');
  const adtechStockHTML = (await Promise.all(
    ADTECH_STOCK_GROUPS.map(async g => {
      const quotes = await Promise.all(g.stocks.map(s => fetchStockQuote(s.t)));
      return `<div class="tier-label">${g.tier}</div><div class="stocks-grid">${renderStockGroup(g.stocks, quotes)}</div>`;
    })
  )).join('');

  const macroStockHTML = (await Promise.all(
    MACRO_STOCK_GROUPS.map(async g => {
      const quotes = await Promise.all(g.stocks.map(s => fetchStockQuote(s.t)));
      return `<div class="tier-label">${g.tier}</div><div class="stocks-grid">${renderStockGroup(g.stocks, quotes)}</div>`;
    })
  )).join('');

  console.log('Stocks done. Building HTML...');

  const weekRange = getWeekRange();
  const generatedAt = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const stockTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';

  const html = buildHTML({
    weekRange,
    generatedAt,
    stockTime,
    adtechSummary: adtechDigest.summary,
    adtechArticles: renderArticles(adtechDigest.articles),
    macroSummary: macroDigest.summary,
    macroArticles: renderArticles(macroDigest.articles),
    adtechStockHTML,
    macroStockHTML,
  });

  fs.writeFileSync('index.html', html);
  console.log('index.html written successfully.');
}

function buildHTML({ weekRange, generatedAt, stockTime, adtechSummary, adtechArticles, macroSummary, macroArticles, adtechStockHTML, macroStockHTML }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Infillion Research Hub</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0a0f; --bg2: #111118; --bg3: #18181f; --bg4: #1e1e28;
    --border: rgba(255,255,255,0.07); --border2: rgba(255,255,255,0.12);
    --text: #e8e8f0; --text2: #9090a8; --text3: #5a5a72;
    --accent: #c8f060; --accent2: #8ab840;
    --red: #ff5a5a; --green: #4ddb8a; --amber: #f0b040; --blue: #60a8f0; --purple: #a080f0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; font-weight: 300; min-height: 100vh; line-height: 1.6; }

  header { border-bottom: 1px solid var(--border); padding: 0 2rem; display: flex; align-items: center; justify-content: space-between; height: 56px; position: sticky; top: 0; background: rgba(10,10,15,0.92); backdrop-filter: blur(12px); z-index: 100; }
  .logo { font-family: 'DM Serif Display', serif; font-size: 18px; color: var(--text); }
  .logo span { color: var(--accent); }
  .header-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text3); letter-spacing: 0.05em; }

  .section-nav { display: flex; padding: 0 2rem; border-bottom: 1px solid var(--border); background: var(--bg2); }
  .section-tab { padding: 14px 24px; font-size: 13px; color: var(--text3); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; font-family: 'DM Sans', sans-serif; }
  .section-tab:hover { color: var(--text2); }
  .section-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  .section-panel { display: none; }
  .section-panel.active { display: block; }

  .inner-tabs { display: flex; gap: 8px; padding: 1.5rem 2rem 0; }
  .inner-tab { padding: 6px 16px; font-size: 12px; font-family: 'DM Mono', monospace; color: var(--text3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; background: none; transition: all 0.15s; letter-spacing: 0.04em; }
  .inner-tab:hover { border-color: var(--border2); color: var(--text2); }
  .inner-tab.active { background: var(--accent); color: #0a0a0f; border-color: var(--accent); font-weight: 500; }

  .tab-panel { display: none; padding: 1.5rem 2rem 3rem; }
  .tab-panel.active { display: block; }

  .digest-header { margin-bottom: 1.5rem; }
  .digest-title { font-family: 'DM Serif Display', serif; font-size: 26px; line-height: 1.2; color: var(--text); }
  .digest-title em { color: var(--accent); font-style: italic; }
  .week-badge { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text3); margin-top: 4px; letter-spacing: 0.04em; }

  .summary-box { background: var(--bg3); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 6px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
  .summary-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.1em; color: var(--text3); text-transform: uppercase; margin-bottom: 8px; }
  .summary-text { font-size: 14px; color: var(--text2); line-height: 1.7; }

  .articles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
  .article-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 1rem 1.25rem; transition: border-color 0.15s; display: flex; flex-direction: column; gap: 8px; }
  .article-card:hover { border-color: var(--border2); }
  .article-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .article-title { font-size: 14px; font-weight: 500; color: var(--text); line-height: 1.4; flex: 1; }
  .article-link { color: var(--accent); text-decoration: none; font-size: 11px; font-family: 'DM Mono', monospace; white-space: nowrap; flex-shrink: 0; padding-top: 2px; }
  .article-link:hover { text-decoration: underline; }
  .article-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; font-family: 'DM Mono', monospace; color: var(--text3); }
  .tag { font-size: 10px; padding: 2px 8px; border-radius: 3px; border: 1px solid; font-family: 'DM Mono', monospace; letter-spacing: 0.03em; }
  .tag-programmatic { color: var(--blue); border-color: rgba(96,168,240,0.3); background: rgba(96,168,240,0.06); }
  .tag-privacy { color: var(--amber); border-color: rgba(240,176,64,0.3); background: rgba(240,176,64,0.06); }
  .tag-ctv { color: var(--purple); border-color: rgba(160,128,240,0.3); background: rgba(160,128,240,0.06); }
  .tag-retail { color: var(--green); border-color: rgba(77,219,138,0.3); background: rgba(77,219,138,0.06); }
  .tag-ai { color: var(--accent); border-color: rgba(200,240,96,0.3); background: rgba(200,240,96,0.06); }
  .tag-rates { color: var(--red); border-color: rgba(255,90,90,0.3); background: rgba(255,90,90,0.06); }
  .tag-ma { color: var(--purple); border-color: rgba(160,128,240,0.3); background: rgba(160,128,240,0.06); }
  .tag-adspend { color: var(--green); border-color: rgba(77,219,138,0.3); background: rgba(77,219,138,0.06); }
  .tag-general { color: var(--text3); border-color: var(--border); }
  .article-blurb { font-size: 12px; color: var(--text3); line-height: 1.6; }

  .stocks-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
  .stocks-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: var(--text); }
  .refresh-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text3); }
  .btn { padding: 7px 16px; font-size: 12px; font-family: 'DM Mono', monospace; letter-spacing: 0.04em; border-radius: 4px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border2); background: none; color: var(--text2); }
  .btn:hover { background: var(--bg3); color: var(--text); }

  .tier-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text3); margin: 1.5rem 0 0.75rem; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  .tier-label:first-of-type { margin-top: 0; }
  .stocks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
  .stock-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; transition: border-color 0.15s; }
  .stock-card:hover { border-color: var(--border2); }
  .stock-ticker { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 2px; }
  .stock-name { font-size: 10px; color: var(--text3); margin-bottom: 10px; line-height: 1.3; }
  .stock-price { font-family: 'DM Mono', monospace; font-size: 18px; font-weight: 500; color: var(--text); margin-bottom: 3px; }
  .stock-change { font-family: 'DM Mono', monospace; font-size: 11px; display: flex; align-items: center; gap: 4px; }
  .change-abs { color: var(--text3); font-size: 10px; }
  .up { color: var(--green); } .down { color: var(--red); } .flat { color: var(--text3); }

  .stocks-note { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text3); margin-top: 1.5rem; }

  .loading { display: flex; align-items: center; gap: 10px; color: var(--text3); font-size: 13px; font-family: 'DM Mono', monospace; padding: 2rem 0; }
  .dots { display: flex; gap: 4px; }
  .dot { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); animation: blink 1.2s infinite; }
  .dot:nth-child(2) { animation-delay: 0.2s; } .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%,80%,100%{opacity:0.15} 40%{opacity:1} }
</style>
</head>
<body>

<header>
  <div class="logo">Infillion <span>Research Hub</span></div>
  <div class="header-meta">${generatedAt}</div>
</header>

<nav class="section-nav">
  <button class="section-tab active" onclick="switchSection('adtech', this)">AdTech Weekly</button>
  <button class="section-tab" onclick="switchSection('macro', this)">Macro Weekly</button>
</nav>

<!-- ADTECH -->
<div class="section-panel active" id="section-adtech">
  <div class="inner-tabs">
    <button class="inner-tab active" onclick="switchTab('adtech','news',this)">News</button>
    <button class="inner-tab" onclick="switchTab('adtech','stocks',this)">Stocks</button>
  </div>

  <div class="tab-panel active" id="adtech-news">
    <div class="digest-header">
      <div class="digest-title">This week in <em>AdTech</em></div>
      <div class="week-badge">week of ${weekRange}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Summary</div>
      <div class="summary-text">${adtechSummary}</div>
    </div>
    <div class="articles-grid">${adtechArticles}</div>
  </div>

  <div class="tab-panel" id="adtech-stocks">
    <div class="stocks-header">
      <div class="stocks-title">AdTech Comps</div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="refresh-meta" id="adtech-stock-time">as of ${stockTime} Monday open</div>
        <button class="btn" onclick="refreshStocks('adtech')">↻ Refresh</button>
      </div>
    </div>
    <div id="adtech-stocks-output">${adtechStockHTML}</div>
    <div class="stocks-note">prices ~15 min delayed · click refresh for latest</div>
  </div>
</div>

<!-- MACRO -->
<div class="section-panel" id="section-macro">
  <div class="inner-tabs">
    <button class="inner-tab active" onclick="switchTab('macro','news',this)">News</button>
    <button class="inner-tab" onclick="switchTab('macro','stocks',this)">Markets</button>
  </div>

  <div class="tab-panel active" id="macro-news">
    <div class="digest-header">
      <div class="digest-title">Macro <em>conditions</em></div>
      <div class="week-badge">week of ${weekRange}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Summary</div>
      <div class="summary-text">${macroSummary}</div>
    </div>
    <div class="articles-grid">${macroArticles}</div>
  </div>

  <div class="tab-panel" id="macro-stocks">
    <div class="stocks-header">
      <div class="stocks-title">Markets Overview</div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="refresh-meta" id="macro-stock-time">as of ${stockTime} Monday open</div>
        <button class="btn" onclick="refreshStocks('macro')">↻ Refresh</button>
      </div>
    </div>
    <div id="macro-stocks-output">${macroStockHTML}</div>
    <div class="stocks-note">prices ~15 min delayed · click refresh for latest</div>
  </div>
</div>

<script>
function switchSection(id, btn) {
  document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('section-' + id).classList.add('active');
}

function switchTab(section, tab, btn) {
  const panel = document.getElementById('section-' + section);
  panel.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));
  panel.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(section + '-' + tab).classList.add('active');
}

const ADTECH_GROUPS = [
  { tier: 'Tier 1 — Direct comps', stocks: [{t:'TTD',n:'The Trade Desk'},{t:'DV',n:'DoubleVerify'},{t:'IAS',n:'Integral Ad Science'},{t:'MGNI',n:'Magnite'},{t:'RAMP',n:'LiveRamp'}] },
  { tier: 'Tier 2 — Industry bellwethers', stocks: [{t:'PUBM',n:'PubMatic'},{t:'DSP',n:'Viant Technology'},{t:'APP',n:'AppLovin'},{t:'GOOGL',n:'Alphabet'},{t:'META',n:'Meta Platforms'}] },
  { tier: 'Tier 3 — Thematic / strategic', stocks: [{t:'FOUR',n:'Outbrain/Teads'},{t:'CRTO',n:'Criteo'},{t:'STGW',n:'Stagwell'}] },
];

const MACRO_GROUPS = [
  { tier: 'Major indices', stocks: [{t:'^GSPC',n:'S&P 500'},{t:'^IXIC',n:'Nasdaq'},{t:'^DJI',n:'Dow Jones'},{t:'^RUT',n:'Russell 2000'}] },
  { tier: 'Sector ETFs', stocks: [{t:'XLC',n:'Comm. Services'},{t:'XLK',n:'Technology'},{t:'XLY',n:'Consumer Disc.'},{t:'IYZ',n:'Telecom'}] },
  { tier: 'Rates & commodities', stocks: [{t:'^TNX',n:'10Y Treasury'},{t:'^IRX',n:'3M T-Bill'},{t:'GLD',n:'Gold ETF'},{t:'DX-Y.NYB',n:'US Dollar Index'}] },
];

function fmtPrice(p) {
  if (!p && p !== 0) return '—';
  return p >= 1000 ? p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : p.toFixed(2);
}

async function fetchQuote(ticker) {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?interval=1d&range=2d';
    const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose;
    const change = price - prev;
    const pct = (change / prev) * 100;
    return { price, change, pct };
  } catch { return null; }
}

function stockCardHTML(s, q) {
  const priceHTML = q
    ? '<div class="stock-price">$' + fmtPrice(q.price) + '</div><div class="stock-change ' + (q.change >= 0 ? 'up' : 'down') + '">' + (q.change >= 0 ? '▲' : '▼') + ' ' + Math.abs(q.pct).toFixed(2) + '%<span class="change-abs">(' + (q.change >= 0 ? '+' : '') + fmtPrice(q.change) + ')</span></div>'
    : '<div class="stock-price flat">—</div>';
  return '<div class="stock-card"><div class="stock-ticker">' + s.t + '</div><div class="stock-name">' + s.n + '</div>' + priceHTML + '</div>';
}

async function refreshStocks(section) {
  const groups = section === 'adtech' ? ADTECH_GROUPS : MACRO_GROUPS;
  const output = document.getElementById(section + '-stocks-output');
  const timeEl = document.getElementById(section + '-stock-time');
  output.innerHTML = '<div class="loading"><div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><span>fetching quotes...</span></div>';
  let html = '';
  for (const g of groups) {
    const quotes = await Promise.all(g.stocks.map(s => fetchQuote(s.t)));
    html += '<div class="tier-label">' + g.tier + '</div><div class="stocks-grid">';
    g.stocks.forEach((s, i) => { html += stockCardHTML(s, quotes[i]); });
    html += '</div>';
  }
  output.innerHTML = html;
  timeEl.textContent = 'updated ' + new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
</script>
</body>
</html>`;
}

main().catch(e => { console.error(e); process.exit(1); });
