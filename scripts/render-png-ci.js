/**
 * render-png-ci.js
 * CI script: serves the built viewer and captures the Three.js canvas as PNG.
 *
 * Usage: node scripts/render-png-ci.js <viewerDir> <outputPath> [width] [height]
 *
 * Requires: puppeteer-core (with CHROME_PATH env var) or puppeteer (bundled)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const [, , viewerDir, outputPath, width = '1200', height = '630'] = process.argv;
  if (!viewerDir || !outputPath) {
    console.error('Usage: node render-png-ci.js <viewerDir> <outputPath> [width] [height]');
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

  // 2. Find browser executable path
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

  // 3. Dynamically import puppeteer
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
    console.log('Using puppeteer (bundled Chromium)');
  } catch {
    puppeteer = await import('puppeteer-core');
    console.log('Using puppeteer-core (system Chromium)');
  }

  const launchOpts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--disable-gpu-sandbox',
      '--deterministic-fetch',
    ],
  };

  // Try known Chrome paths if using puppeteer-core
  for (const p of chromePaths) {
    if (p) {
      try {
        readFileSync(p);
        launchOpts.executablePath = p;
        console.log(`Chrome found at: ${p}`);
        break;
      } catch {}
    }
  }

  const browser = await puppeteer.launch(launchOpts);
  console.log('Browser launched');

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#canvas-main', { timeout: 15000 });

    // Wait for data to load (stats bar populated)
    await page.waitForFunction(
      () => {
        const el = document.getElementById('stat-contrib');
        return el && el.textContent && el.textContent !== '\u2014';
      },
      { timeout: 15000 }
    );

    // Settle time for Three.js
    await new Promise(r => setTimeout(r, 2000));

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
  // Don't fail the CI build — the SVG fallback still works
  process.exit(1);
});
