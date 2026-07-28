/**
 * render-png-ci.js
 * CI script: serves the built viewer and captures a card-layout PNG.
 *
 * Usage: node scripts/render-png-ci.js <viewerDir> <outputPath> [width] [height]
 *
 * Layout: centered grid canvas with title/stat above and legend bar below.
 * Requires: puppeteer (bundled Chromium) or puppeteer-core (with CHROME_PATH)
 */

const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { createServer } = require('http');

async function main() {
  const [, , viewerDir, outputPath, width = '1200', height = '800'] = process.argv;
  if (!viewerDir || !outputPath) {
    console.error('Usage: node scripts/render-png-ci.js <viewerDir> <outputPath> [width] [height]');
    process.exit(1);
  }

  const W = parseInt(width);
  const H = parseInt(height);
  const canvasW = W;
  const canvasH = Math.round(H * 0.78); // canvas gets ~78% of height, ~624px at 800

  // 1. Start static HTTP server
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let filePath = join(viewerDir, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!filePath.startsWith(viewerDir)) { res.writeHead(403); res.end(); return; }
    try {
      const content = readFileSync(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
      const mimes = {
        html: 'text/html', js: 'application/javascript', css: 'text/css',
        json: 'application/json', svg: 'image/svg+xml', png: 'image/png',
        wasm: 'application/wasm',
      };
      res.writeHead(200, { 'Content-Type': mimes[ext] ?? 'application/octet-stream' });
      res.end(content);
    } catch { res.writeHead(404); res.end('Not found'); }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://localhost:${port}/`;
  console.log(`Serving viewer at ${url}`);

  // 2. Load puppeteer
  let puppeteer, puppeteerErr;
  try {
    puppeteer = require('puppeteer');
    console.log('Using puppeteer (bundled Chromium)');
  } catch (e) {
    puppeteerErr = e;
    try {
      puppeteer = require('puppeteer-core');
      console.log('Using puppeteer-core (system Chromium)');
    } catch (e2) {
      console.error('Could not load puppeteer:', puppeteerErr.message);
      console.error('puppeteer-core:', e2.message);
      throw new Error('puppeteer not available');
    }
  }

  const launchOpts = {
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl',
      '--deterministic-fetch',
    ],
  };

  if (!puppeteer.executablePath) {
    const chromePaths = [
      process.env.CHROME_PATH, process.env.CHROMIUM_PATH,
      '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);
    for (const p of chromePaths) {
      if (!p) continue;
      try { readFileSync(p); launchOpts.executablePath = p; console.log(`Chrome: ${p}`); break; } catch {}
    }
    if (!launchOpts.executablePath) {
      try { launchOpts.executablePath = puppeteer.executablePath(); } catch {}
    }
  }

  const browser = await puppeteer.launch(launchOpts);
  console.log('Browser launched');

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#canvas-main', { timeout: 15000 });

    // Wait for data to load
    try {
      await page.waitForFunction(
        `document.getElementById('stat-contrib') &&
         document.getElementById('stat-contrib').textContent !== '\u2014'`,
        { timeout: 20000 }
      );
      console.log('Data loaded');
    } catch {
      console.log('Data load timeout, proceeding');
    }

    // Extra settle time for Three.js
    await new Promise(r => setTimeout(r, 3000));

    // Inject card layout CSS
    await page.addStyleTag({
      content: `
        /* Hide sidebar, header, footer */
        #panel, #header, #footer { display: none !important; }

        /* Reset main area to full-width card */
        #canvas-wrap {
          position: relative !important;
          margin: 0 auto !important;
          width: 100% !important;
          height: ${canvasH}px !important;
          top: 0 !important;
          left: 0 !important;
          background: var(--bg, #0d1117) !important;
        }
        #canvas-main { width: 100% !important; height: 100% !important; }

        /* Remove overlay */
        #overlay { display: none !important; }

        /* Stats row — centered above canvas, laid out horizontally */
        #stats-bar {
          position: relative !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 32px !important;
          padding: 10px 0 6px 0 !important;
          top: auto !important;
          left: auto !important;
          background: transparent !important;
          border: none !important;
          font-family: 'IBM Plex Sans', system-ui, sans-serif !important;
        }
        .stat-item {
          display: flex !important;
          align-items: baseline !important;
          gap: 6px !important;
        }
        .stat-value {
          font-size: 20px !important;
          font-weight: 600 !important;
          color: #e6edf3 !important;
        }
        .stat-item span:last-child {
          font-size: 11px !important;
          color: #8b949e !important;
          text-transform: none !important;
          letter-spacing: 0 !important;
        }

        /* Legend — centered below canvas */
        #legend {
          position: relative !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 8px 0 4px 0 !important;
          bottom: auto !important;
          left: auto !important;
          background: transparent !important;
          backdrop-filter: none !important;
        }
        .legend-label {
          font-size: 10px !important;
          color: #8b949e !important;
          font-family: 'IBM Plex Mono', monospace !important;
        }
        #legend-bar {
          width: 160px !important;
          height: 12px !important;
          border-radius: 4px !important;
        }

        /* Drag hint — hidden */
        #drag-hint { display: none !important; }
        #tooltip { display: none !important; }

        /* Body — centered column */
        body, #app {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          background: var(--bg, #0d1117) !important;
          min-height: 100vh !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      `
    });

    // Also set background from state
    await page.evaluate(() => {
      const bg = document.body.style.backgroundColor;
      document.documentElement.style.setProperty('--bg', bg || '#0d1117');
    });

    // Settle after CSS injection
    await new Promise(r => setTimeout(r, 500));

    // Capture the full app container
    const app = await page.$('#app');
    if (!app) throw new Error('#app not found');

    const buffer = await app.screenshot({ type: 'png', omitBackground: false });
    writeFileSync(outputPath, buffer);
    console.log(`PNG saved to ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error('PNG render failed:', err.message || err);
  process.exit(1);
});
