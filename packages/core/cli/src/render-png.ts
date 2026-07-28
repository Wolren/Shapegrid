/**
 * render-png.ts
 * Headless PNG renderer — opens the built viewer in headless Chromium
 * and captures the Three.js canvas at native resolution.
 * Produces pixel-identical output to the interactive web viewer.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

// ─── Renderer ─────────────────────────────────────────────────────────────────

export interface PngRenderOptions {
  /** Path to the directory containing the built viewer (index.html + assets/) */
  viewerDir: string;
  /** Output PNG path */
  outputPath: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Optional path to Chrome/Chromium executable */
  browserPath?: string;
}

/**
 * Render the shapegrid viewer to PNG using headless Chromium.
 *
 * Steps:
 *  1. Start a static HTTP server serving the viewer
 *  2. Launch headless Chromium via Puppeteer
 *  3. Navigate to the viewer — it auto-loads from ./assets/shapegrid-data.json
 *  4. Wait for the canvas to render
 *  5. Screenshot the canvas element at native resolution
 *  6. Save as PNG
 */
export async function renderPng(opts: PngRenderOptions): Promise<void> {
  const { viewerDir, outputPath, width, height } = opts;

  // 1. Start static server
  const server = await startServer(viewerDir);
  const port = (server.address() as any).port;
  const url = `http://localhost:${port}/`;

  try {
    // 2. Launch browser
    const puppeteer = await importPuppeteer();
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--disable-gpu-sandbox',
      ],
      executablePath: opts.browserPath,
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });

      // 3. Navigate and wait for render
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for the Three.js canvas to be present and populated
      await page.waitForSelector('#canvas-main', { timeout: 15000 });

      // Wait for the stats bar to show data (indicates data loaded)
      await page.waitForFunction(
        () => {
          const el = document.getElementById('stat-contrib');
          return el && el.textContent !== '\u2014' && el.textContent !== '\u2014';
        },
        { timeout: 15000 }
      );

      // Extra settle time for Three.js to finish rendering
      await sleep(1500);

      // 4. Capture the canvas
      const canvas = await page.$('#canvas-main');
      if (!canvas) throw new Error('Canvas element not found');

      // Render at native resolution
      await page.setViewport({ width, height, deviceScaleFactor: 1 });

      // Take screenshot of just the canvas
      const buffer = await canvas.screenshot({
        type: 'png',
        omitBackground: false,
      });

      // 5. Save
      writeFileSync(outputPath, buffer);
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startServer(rootDir: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      // Serve static files
      const url = new URL(req.url ?? '/', 'http://localhost');
      let filePath = join(rootDir, url.pathname === '/' ? 'index.html' : url.pathname);

      // Security: prevent path traversal
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end();
        return;
      }

      try {
        const content = readFileSync(filePath);
        const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
        const mime: Record<string, string> = {
          html: 'text/html',
          js: 'application/javascript',
          css: 'text/css',
          json: 'application/json',
          svg: 'image/svg+xml',
          png: 'image/png',
          wasm: 'application/wasm',
        };
        res.writeHead(200, { 'Content-Type': mime[ext] ?? 'application/octet-stream' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function importPuppeteer(): Promise<any> {
  try {
    // Try puppeteer first (bundled Chromium)
    return await import('puppeteer');
  } catch {
    // Fall back to puppeteer-core (user must provide browser)
    return await import('puppeteer-core');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

