/**
 * pdf.js (Node) wants DOMMatrix / Path2D / ImageData globals. When the optional prebuilt
 * @napi-rs/canvas package is installed we provide them; otherwise text extraction still works
 * and only diagram rendering is skipped. Import this BEFORE pdfjs-dist.
 */
try {
  const canvas = await import('@napi-rs/canvas');
  for (const name of ['DOMMatrix', 'Path2D', 'ImageData']) {
    if (!globalThis[name] && canvas[name]) globalThis[name] = canvas[name];
  }
} catch {
  /* optional dependency not installed */
}
export {};
