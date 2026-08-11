// update_stocks.js — GitHub Actions で毎日実行される株価自動更新スクリプト
// Yahoo Finance v8 API から最新株価を取得し、index.html 内のデータを更新する

const https = require('https');
const fs = require('fs');

// 対象銘柄リスト
const SYMBOLS = {
  JP: [
    { symbol: '285A.T', key: '285A.T' },
    { symbol: '4568.T', key: '4568.T' },
    { symbol: '6532.T', key: '6532.T' },
    { symbol: '7203.T', key: '7203.T' },
    { symbol: '8001.T', key: '8001.T' },
  ],
  US: [
    { symbol: 'ACN', key: 'ACN' },
    { symbol: 'SPCX', key: 'SPCX' },
    { symbol: 'ORCL', key: 'ORCL' },
    { symbol: 'WDC', key: 'WDC' },
    { symbol: 'NVDA', key: 'NVDA' },
    { symbol: 'V', key: 'V' },
    { symbol: 'MSFT', key: 'MSFT' },
  ],
  FX: [
    { symbol: 'JPY=X', key: 'USDJPY' },
  ]
};

function fetchQuote(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const meta = json.chart?.result?.[0]?.meta;
          if (meta && meta.regularMarketPrice) {
            resolve({
              symbol,
              price: meta.regularMarketPrice,
              previousClose: meta.chartPreviousClose || meta.previousClose,
              currency: meta.currency,
            });
          } else {
            console.warn(`⚠️ No data for ${symbol}`);
            resolve(null);
          }
        } catch (e) {
          console.warn(`⚠️ Parse error for ${symbol}: ${e.message}`);
          resolve(null);
        }
      });
      res.on('error', (e) => { console.warn(`⚠️ Fetch error for ${symbol}: ${e.message}`); resolve(null); });
    }).on('error', (e) => { console.warn(`⚠️ Request error for ${symbol}: ${e.message}`); resolve(null); });
  });
}

async function main() {
  console.log('📊 Fetching latest stock prices...');
  
  const allSymbols = [...SYMBOLS.JP, ...SYMBOLS.US, ...SYMBOLS.FX];
  const results = {};
  
  for (const s of allSymbols) {
    const quote = await fetchQuote(s.symbol);
    if (quote) {
      results[s.key] = quote;
      console.log(`  ✅ ${s.symbol}: ${quote.price} ${quote.currency}`);
    }
    // Rate limit: small delay between requests
    await new Promise(r => setTimeout(r, 300));
  }

  if (Object.keys(results).length === 0) {
    console.log('❌ No data fetched. Skipping update.');
    process.exit(0);
  }

  // Read index.html
  let html = fs.readFileSync('index.html', 'utf8');
  const today = new Date().toISOString().split('T')[0];
  let updatedCount = 0;

  // Update basePrice for each stock
  for (const [key, data] of Object.entries(results)) {
    if (key === 'USDJPY') {
      // Update USD/JPY rate
      const oldRateMatch = html.match(/currentRate:\s*([\d.]+)/);
      if (oldRateMatch) {
        html = html.replace(
          /currentRate:\s*[\d.]+/,
          `currentRate: ${data.price}`
        );
        console.log(`  💱 USD/JPY: ${oldRateMatch[1]} → ${data.price}`);
        updatedCount++;
      }
      continue;
    }
    
    // Find and update basePrice for stock symbol
    // Match pattern: symbol: 'XXX', ... basePrice: NNN
    const escapedKey = key.replace(/\./g, '\\.');
    const regex = new RegExp(
      `(symbol:\\s*'${escapedKey}'[^}]*?basePrice:\\s*)(\\d+(?:\\.\\d+)?)`,
      's'
    );
    const match = html.match(regex);
    if (match) {
      const oldPrice = match[2];
      const newPrice = data.price;
      html = html.replace(regex, `$1${newPrice}`);
      console.log(`  📈 ${key}: ${oldPrice} → ${newPrice}`);
      updatedCount++;
    } else {
      console.warn(`  ⚠️ Could not find basePrice pattern for ${key}`);
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync('index.html', html, 'utf8');
    console.log(`\n✅ Updated ${updatedCount} prices in index.html (${today})`);
  } else {
    console.log('\n⚠️ No prices were updated.');
  }
}

main().catch(e => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});
