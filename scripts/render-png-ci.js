/**
 * render-png-ci.js
 * CI script: serves the built viewer and captures the Three.js canvas as PNG.
 *
 * Usage: node scripts/render-png-ci.js <viewerDir> <outputPath> [width] [height]
 *
 * Requires: puppeteer (bundled Chromium) or puppeteer-core (with CHROME_PATH)
 *            Set NODE_PATH or install in the workspace.
 */

const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { createServer } = require('http');

async function main() {
  const [, , viewerDir, outputPath, width = '1200', height = '630'] = process.argv;
  if (!viewerDir || !outputPath) {
    console.error('Usage: node scripts/render-png-ci.js <viewerDir> <outputPath> [width] [height]');
    process.exit(1);
  }

  const w = parseInt(width);
  const h = parseInt(height);

  // 1. Start static HTTP server
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let filePath = join(viewerDir, url.pathname === '/' ? 'index.html' : url.pathname);

    if (!filePath.startsWith(viewerDir)) {
      res.writeHead(403);
      res.end();
      return;
    }

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
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://localhost:${port}/`;

  console.log(`Serving viewer at ${url}`);

  // 2. Try to load puppeteer (bundled Chromium) or puppeteer-core
  let puppeteer;
  let puppeteerErr;

  try {
    puppeteer = require('puppeteer');
    console.log('Using puppeteer (bundled Chromium)');
  } catch (e) {
    puppeteerErr = e;
    try {
      puppeteer = require('puppeteer-core');
      console.log('Using puppeteer-core (system Chromium)');
    } catch (e2) {
      console.error('Could not load puppeteer or puppeteer-core');
      console.error('puppeteer error:', puppeteerErr.message);
      console.error('puppeteer-core error:', e2.message);
      throw new Error('puppeteer not available - install it or set NODE_PATH');
    }
  }

  // 3. Find browser
  const launchOpts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--deterministic-fetch',
    ],
  };

  // For puppeteer-core (no bundled browser), try to find system Chrome
  if (!puppeteer.executablePath) {
    const chromePaths = [
      process.env.CHROME_PATH,
      process.env.CHROMIUM_PATH,
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);

    for (const p of chromePaths) {
      if (!p) continue;
      try {
        readFileSync(p);
        launchOpts.executablePath = p;
        console.log(`Chrome found at: ${p}`);
        break;
      } catch {}
    }

    if (!launchOpts.executablePath) {
      // Try puppeteer's own discovery
      try {
        launchOpts.executablePath = puppeteer.executablePath();
      } catch {}
    }
  }

  const browser = await puppeteer.launch(launchOpts);
  console.log('Browser launched');

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    console.log('Page loaded, title:', await page.title());

    await page.waitForSelector('#canvas-main', { timeout: 15000 });
    console.log('Canvas found');

    // Debug: check stats content
    const statText = await page.evaluate(() => {
      const el = document.getElementById('stat-contrib');
      return el ? JSON.stringify(el.textContent) : 'null';
    });
    console.log('stat-contrib text:', statText);

    const dataCheck = await page.evaluate(() => {
      return typeof window.__shapegridLoaded !== 'undefined' ? 'loaded' : 'not set';
    });
    console.log('Data flag:', dataCheck);

    // Wait for data to load (stats bar populated - not the default em dash)
    try {
      await page.waitForFunction(
        `document.getElementById('stat-contrib') &&
         document.getElementById('stat-contrib').textContent !== '\u2014'`,
        { timeout: 20000 }
      );
      console.log('Data loaded');
    } catch {
      console.log('Timed out waiting for data, proceeding with current state');
    }

    // Settle time for Three.js
    await new Promise(r => setTimeout(r, 3000));

    // Capture the canvas element
    const canvas = await page.$('#canvas-main');
    if (!canvas) throw new Error('Canvas #canvas-main not found');

    const buffer = await canvas.screenshot({ type: 'png', omitBackground: false });
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
