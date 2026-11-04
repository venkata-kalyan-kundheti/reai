import { unionRects, verticalOverlap, isValidRect } from './normalizeRect.js';
import * as C from './constants.js';
import { chunkId } from '../../utils/ids.js';

const SHY = String.fromCharCode(173); // soft hyphen

function joinItems(items, pageW) {
  let text = '';
  let prev = null;
  for (const it of items) {
    if (prev) {
      const gapPts = (it.rect.x - (prev.rect.x + prev.rect.w)) * pageW + 2 * C.PAD_RATIO * prev.fontSize;
      if (gapPts > 0.12 * prev.fontSize && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
    }
    text += it.str;
    prev = it;
  }
  return text.normalize('NFKC').split(SHY).join('').replace(/ +/g, ' ').trim();
}

function makeLine(items, page) {
  const text = joinItems(items, page.width);
  if (!text) return null;
  const rect = unionRects(items.map((i) => i.rect));
  if (!rect) return null;
  const chars = items.reduce((s, i) => s + i.str.length, 0) || 1;
  const fontSize = items.reduce((s, i) => s + i.fontSize * i.str.length, 0) / chars;
  return {
    page: page.number,
    text,
    rect,
    fontSize,
    chars: text.length,
    centerY: rect.y + rect.h / 2,
    isFurniture: false,
    column: 0,
  };
}

export function buildLines(page) {
  const items = [...page.items].sort((a, b) => a.rect.y + a.rect.h / 2 - (b.rect.y + b.rect.h / 2));
  const groups = [];
  for (const it of items) {
    const g = groups[groups.length - 1];
    if (g && verticalOverlap(g.rect, it.rect) >= C.LINE_OVERLAP_MIN) {
      g.items.push(it);
      g.rect = unionRects([g.rect, it.rect]);
    } else {
      groups.push({ items: [it], rect: it.rect });
    }
  }

  const lines = [];
  for (const g of groups) {
    const sorted = g.items.sort((a, b) => a.rect.x - b.rect.x);
    let cur = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const p = sorted[i - 1];
      const it = sorted[i];
      const gapPts = (it.rect.x - (p.rect.x + p.rect.w)) * page.width;
      if (gapPts > C.LINE_SPLIT_GAP_EM * p.fontSize) {
        lines.push(makeLine(cur, page));
        cur = [it];
      } else {
        cur.push(it);
      }
    }
    lines.push(makeLine(cur, page));
  }
  return lines.filter(Boolean);
}

export function medianFontSize(allLines) {
  const pairs = allLines.filter((l) => !l.isFurniture).map((l) => [l.fontSize, l.chars]);
  pairs.sort((a, b) => a[0] - b[0]);
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let acc = 0;
  for (const [fs, c] of pairs) {
    acc += c;
    if (acc >= total / 2) return fs;
  }
  return 10;
}

const BULLET_RE = /^([-*•◦▪‣–—]|[0-9]{1,3}[.)]|[a-zA-Z][.)]|[(][0-9a-zA-Z]{1,3}[)]) /;
const CAPTION_RE = /^(figure|fig[.]|table) *[0-9]+/i;
const NUM_HEADING_RE = /^[0-9]+([.][0-9]+)+[.]? +[A-Z]/;
const SENTENCE_END_RE = /[.?!:)”]$/;
const PAGE_NUMBER_RE = /^[0-9]{1,4}$/;

function lineKind(line, bodySize) {
  const t = line.text;
  if (CAPTION_RE.test(t)) return 'caption';
  const big = line.fontSize >= bodySize * C.HEADING_FONT_RATIO && t.length <= 200;
  const letters = t.replace(/[^A-Za-z]/g, '');
  const allCaps = letters.length >= 3 && letters === letters.toUpperCase() && t.length <= 80;
  const numbered = NUM_HEADING_RE.test(t) && t.length <= 60 && !SENTENCE_END_RE.test(t);
  if (big || allCaps || numbered) return 'heading';
  if (BULLET_RE.test(t)) return 'list_item';
  return 'paragraph';
}

function shouldBreak(prev, line, kind, cur, page) {
  if (line.column !== prev.column) return true;
  if (kind === 'caption' || kind === 'list_item') return true;
  if (cur.kind === 'heading') {
    if (kind !== 'heading') return true;
    return Math.abs(line.fontSize - prev.fontSize) > prev.fontSize * 0.1;
  }
  if (kind === 'heading') return true;
  const dy = (line.centerY - prev.centerY) * page.height;
  if (dy > C.PARA_GAP_FACTOR * prev.fontSize || dy < -0.5 * prev.fontSize) return true;
  if (Math.abs(line.fontSize - prev.fontSize) > prev.fontSize * 0.15) return true;
  const indent = (line.rect.x - cur.lines[0].rect.x) * page.width;
  if (cur.kind === 'paragraph' && indent > prev.fontSize && SENTENCE_END_RE.test(prev.text)) return true;
  const size = cur.lines.reduce((s, l) => s + l.text.length, 0);
  if (size + line.text.length > C.MAX_CHUNK_CHARS && SENTENCE_END_RE.test(prev.text)) return true;
  return false;
}

function joinLines(lines) {
  let text = '';
  for (const l of lines) {
    if (!text) text = l.text;
    else if (text.endsWith('-') && /^[a-z]/.test(l.text)) text = text.slice(0, -1) + l.text;
    else text += ' ' + l.text;
  }
  return text;
}

function finishBlock(cur, pageNumber, index) {
  const text = joinLines(cur.lines).trim();
  const rects = cur.lines.map((l) => l.rect).filter(isValidRect);
  const bbox = unionRects(rects);
  if (text.length < 2 || !bbox || PAGE_NUMBER_RE.test(text)) return null;
  const chars = cur.lines.reduce((s, l) => s + l.chars, 0) || 1;
  const fontSize = cur.lines.reduce((s, l) => s + l.fontSize * l.chars, 0) / chars;
  return {
    chunkId: chunkId(pageNumber, index),
    page: pageNumber,
    type: cur.kind,
    text,
    rects,
    bbox,
    fontSize,
    column: cur.lines[0].column,
  };
}

export function buildChunksForPage(page, orderedLines, bodySize, startOrder) {
  const chunks = [];
  let cur = null;
  let prev = null;
  const flush = () => {
    if (!cur) return;
    const c = finishBlock(cur, page.number, chunks.length);
    if (c) chunks.push(c);
    cur = null;
  };

  for (const line of orderedLines) {
    const kind = lineKind(line, bodySize);
    if (cur && shouldBreak(prev, line, kind, cur, page)) flush();
    if (!cur) cur = { kind, lines: [line] };
    else cur.lines.push(line);
    prev = line;
  }
  flush();
  chunks.forEach((c, i) => {
    c.order = startOrder + i;
  });
  return chunks;
}

