import './pdfjsPolyfills.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));

const MIN_IMAGE_PIXELS = 150 * 100; // ignore icons / bullets
const MIN_PATH_OPS = 8; // vector diagrams are many path operations

let canvasLib; // undefined = not tried, null = unavailable

/** @napi-rs/canvas ships prebuilt binaries; if it is missing we just skip diagram analysis. */
export async function loadCanvas() {
  if (canvasLib !== undefined) return canvasLib;
  try {
    canvasLib = await import('@napi-rs/canvas');
  } catch {
    canvasLib = null;
  }
  return canvasLib;
}

/**
 * Open a PDF for RENDERING. Note: no `useSystemFonts` - with it, pdf.js in Node
 * silently skips every non-embedded font, so diagram labels would be missing.
 */
export async function openForRender(pdfPath) {
  const data = new Uint8Array(await fs.readFile(pdfPath));
  return pdfjs.getDocument({
    data,
    isEvalSupported: false,
    verbosity: 0,
    standardFontDataUrl: path.join(pdfjsRoot, 'standard_fonts') + path.sep,
    cMapUrl: path.join(pdfjsRoot, 'cmaps') + path.sep,
    cMapPacked: true,
  }).promise;
}

/** Score a page by how "figure-like" it is. 0 = plain text page. */
export async function scorePage(page) {
  const ops = await page.getOperatorList();
  const O = pdfjs.OPS;
  let images = 0;
  let paths = 0;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintJpegXObject) {
      const a = ops.argsArray[i];
      const w = a?.[1] ?? a?.[0]?.width ?? 0;
      const h = a?.[2] ?? a?.[0]?.height ?? 0;
      if (!w || !h || w * h >= MIN_IMAGE_PIXELS) images++;
    } else if (fn === O.constructPath) {
      paths++;
    }
  }
  return { images, paths, score: images * 10 + (paths >= MIN_PATH_OPS ? paths : 0) };
}

/** Pages worth sending to the vision model, best candidates first, capped. */
export async function findFigurePages(pdf, maxPages) {
  const found = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const s = await scorePage(page);
    page.cleanup();
    if (s.score > 0) found.push({ page: n, ...s });
  }
  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages)
    .sort((a, b) => a.page - b.page);
}

/** Render one page to a JPEG (long side capped) for the vision model. */
export async function renderPageJpeg(pdf, pageNumber, { scale = 1.6, maxSide = 1600, quality = 82 } = {}) {
  const canvasMod = await loadCanvas();
  if (!canvasMod) throw new Error('CANVAS_UNAVAILABLE');

  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const fit = Math.min(scale, maxSide / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: fit });

  const canvas = canvasMod.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();

  return { buffer: canvas.toBuffer('image/jpeg', quality), mimeType: 'image/jpeg', width: canvas.width, height: canvas.height };
}
