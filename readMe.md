# ReAI: Split-Screen AI Document Explainer (MERN)

> Working title. A student or working professional uploads a document, asks the AI to explain it, and reads the explanation **side by side with the original document**. Every AI line is linked to the exact place in the document it came from, and the link works in both directions.

---

## 0. How to use this README (read first, especially if you are a code-generating model)

1. Read sections 1 to 5 fully before writing any code. They define the product, the stack and the folder structure.
2. Sections 6 (data model), 7 (ingestion), 8 (API) and 9 (AI generation) are **contracts**. Use the exact field names, ID formats and JSON shapes given there. Do not rename or invent fields.
3. Build in the order given in section 15. Each step has a "Done when" check. Do not start a step until the previous one passes its check.
4. If something is not specified, pick the simplest option that works and leave a comment `// TODO(decision): <what you chose and why>`.
5. Never put business logic in route files. Routes call controllers, controllers call services, services touch the database and external APIs.
6. All geometry (rectangles, scaling, hit-testing) lives in one file per side: `server/src/services/ingest/normalizeRect.js` and `client/src/lib/geometry.js`. All chunk and segment IDs are created in `server/src/utils/ids.js` only.
7. Use the **mock providers** (`LLM_PROVIDER=mock`, `VISION_PROVIDER=mock`) during development, so the whole app runs without any API key.

---

## 1. Product summary

### The problem
People do not trust AI summaries because they cannot see where each statement came from, and they get lost jumping between a long document and a chat window.

### The solution
A two-pane screen:

- **Left or right pane: the original document** (PDF viewer).
- **Other pane: AI-generated explanation**, split into small *segments* (a heading, a paragraph, a bullet, a step).
- **Hover or click an AI segment** and the document scrolls to and highlights the exact source passage (or image region).
- **Click a paragraph, line or image in the document** and the AI panel scrolls to the segment that explains it.
- The user controls the experience: close or reopen either pane, turn pointing off, pin a highlight, choose a level and a goal.

### Core user flow
1. Upload a file. The server parses it into **chunks** with page coordinates.
2. The user optionally types a question and optionally picks **Level** and **Goal**. If nothing is chosen, defaults apply (Medium, Understanding, question "Explain this document").
3. The server streams AI **segments**, each with `sources` (chunk IDs).
4. The user reads, hovers, clicks, selects text to ask follow-ups, or presses "I didn't get this" on any segment.

### Options (all optional)

| Option | Values | Default | What it changes |
|---|---|---|---|
| Level | `beginner`, `medium`, `experienced` | `medium` | How much background is explained |
| Goal | `exam`, `presentation`, `understanding` | `understanding` | The shape of the output |

---

## 2. Scope by phase

| Phase | Name | Contents |
|---|---|---|
| 1 | Text linking (MVP) | Upload text PDF, parse to chunks, generate segments with citations, two-way hover/click linking |
| 2 | Controls and comfort | Close/reopen panes, swap sides, drag divider, sync modes, pin, source preview, prev/next source, "Back to where I was", low-confidence dashed highlight, keyboard shortcuts |
| 3 | Level and Goal | The two chips, regeneration without re-upload, caching of each combination |
| 4 | Interaction features | Select-to-ask (text selection or drawn box) and "I didn't get this" per segment |
| 5 | Images and diagrams | Vision-model regions, region highlighting, workflow walkthrough (Play) |
| Later | Extras | PPT and DOCX (convert to PDF first), scanned files (OCR), mobile bottom-sheet layout, accounts |

**Out of scope for now:** real-time collaboration, editing the PDF, export of annotated PDFs, payments, multi-document chat.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Database | MongoDB 7 + Mongoose | Run locally with Docker |
| Server | Node 20+, Express 4, ES modules (`"type": "module"`) | Plain JavaScript |
| Validation | `zod` | Validate every request body, every env var, every LLM output line |
| Upload | `multer` (disk storage) | Size limit from env |
| PDF parsing (server) | `pdfjs-dist` (legacy build for Node) | Gives text items with positions |
| Office to PDF | LibreOffice headless (`soffice`) | Later phase |
| LLM | Provider interface, one real adapter + mock | Model name from env, never hard-coded |
| Vision | Provider interface, one real adapter + mock | Phase 5; a provider that returns bounding boxes (for example Gemini) |
| Security middleware | `helmet`, `cors`, `express-rate-limit` | |
| Logging | `pino` | |
| Client | React 18 + Vite, JavaScript | |
| Client state | `zustand` | One store for view state, one for document data |
| PDF viewer (client) | `react-pdf` (wraps pdf.js) | Canvas and text layer; we draw our own overlays |
| Split layout | `react-resizable-panels` | Draggable divider, collapsible panes |
| Styling | Tailwind CSS | Optional, any CSS approach works |
| Tests | `vitest` (both sides), `supertest` (API) | |

Important: coordinates are stored in PDF-derived normalized form (section 6.3), so it does not matter that the server and the client use different pdf.js versions.

---

## 4. Repository layout

```
reai/
├─ package.json                 # npm workspaces ["client","server"]; scripts: dev, test
├─ docker-compose.yml           # mongo:7 only
├─ .env.example
├─ README.md
├─ server/
│  ├─ package.json
│  └─ src/
│     ├─ index.js               # boot: validate env, connect DB, start HTTP
│     ├─ app.js                 # express app: middleware, routes, error handler
│     ├─ config/env.js          # zod-validated env; the ONLY place process.env is read
│     ├─ db/connect.js
│     ├─ models/                # Document.js, Chunk.js, Generation.js
│     ├─ schemas/               # zod: api.js, segment.js, chunk.js
│     ├─ middleware/            # guestAuth.js, upload.js, rateLimit.js, errorHandler.js
│     ├─ routes/                # documents.routes.js, generations.routes.js, ask.routes.js
│     ├─ controllers/           # thin: parse input, call service, send response
│     ├─ services/
│     │  ├─ storage/            # index.js (interface), localDisk.js
│     │  ├─ ingest/             # pipeline.js, convertToPdf.js, extractText.js, buildChunks.js,
│     │  │                      # detectFurniture.js, detectColumns.js, normalizeRect.js, constants.js
│     │  ├─ vision/             # index.js, geminiProvider.js, mockProvider.js   (Phase 5)
│     │  ├─ llm/                # index.js, anthropicProvider.js, mockProvider.js, prompts.js, ndjsonParser.js
│     │  └─ generation/         # generate.js, sectioning.js, validateSegments.js, confidence.js,
│     │                         # ask.js, simplify.js, runner.js (in-memory emitters)
│     └─ utils/                 # ids.js, hash.js, asyncHandler.js, logger.js, httpError.js
└─ client/
   ├─ index.html, vite.config.js
   └─ src/
      ├─ main.jsx, App.jsx
      ├─ api/                   # http.js, documents.js, generations.js, sse.js
      ├─ store/                 # useViewStore.js (UI state), useDocStore.js (document data)
      ├─ pages/                 # UploadPage.jsx, DocumentPage.jsx
      ├─ components/
      │  ├─ layout/             # SplitLayout.jsx, PaneHeader.jsx, EdgeTab.jsx, Toolbar.jsx
      │  ├─ pdf/                # PdfViewer.jsx, PdfPage.jsx, HighlightLayer.jsx, ChunkHitLayer.jsx,
      │  │                      # SelectionToolbar.jsx, BoxSelectLayer.jsx, ImageRegionLayer.jsx
      │  ├─ ai/                 # AiPanel.jsx, SegmentItem.jsx, SourceBadge.jsx, SourcePreview.jsx,
      │  │                      # LevelGoalChips.jsx, AskBar.jsx, WalkthroughControls.jsx
      │  └─ common/             # BackToWhereIWas.jsx, Spinner.jsx, ErrorBanner.jsx
      ├─ hooks/                 # useScrollSync.js, useHotkeys.js, useGenerationStream.js, useIsTouch.js
      └─ lib/                   # geometry.js, pageLayout.js, segmentIndex.js
```

---

## 5. Environment and running locally

`.env.example` (copy to `server/.env`; the client only needs `VITE_API_URL`):

```
PORT=4000
MONGO_URI=mongodb://localhost:27017/reai
CLIENT_ORIGIN=http://localhost:5173
STORAGE_DIR=./storage
MAX_FILE_MB=25
MAX_PAGES=300
GUEST_TTL_DAYS=7
COOKIE_SECRET=change-me

LLM_PROVIDER=mock            # mock | anthropic
LLM_API_KEY=
LLM_MODEL=                   # model name goes here, never hard-coded in code
SINGLE_PASS_LIMIT_CHARS=120000
SECTION_SIZE_CHARS=60000

VISION_PROVIDER=mock         # mock | gemini
VISION_API_KEY=
VISION_MODEL=
MAX_VISION_PAGES=30

SOFFICE_PATH=soffice         # Later phase
```

Run:

```
docker compose up -d         # starts MongoDB
npm install                  # installs both workspaces
npm run dev                  # server on :4000, client on :5173
npm test
```

`config/env.js` must parse the variables with zod, apply the defaults above, and **exit the process with a clear message** if a required variable is missing or invalid (for example `LLM_PROVIDER=anthropic` but `LLM_API_KEY` empty).

---
## 6. Data model, shared conventions and ID formats

### 6.1 Shared server conventions

- **Error format**: Every error response returns JSON with an `error` object: `{ "error": { "code": string, "message": string, "details": any } }`.
- **`utils/httpError.js`**:
```javascript
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
```
- **`utils/asyncHandler.js`**: Wrap all route handlers so Express catches rejections:
```javascript
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```
- **`utils/logger.js`**: Centralized pino logger:
```javascript
import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});
```
- **`middleware/errorHandler.js`**:
```javascript
import { ZodError } from 'zod';
import multer from 'multer';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() },
    });
  }

  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    return res.status(400).json({
      error: { code, message: err.message },
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  logger.error({ err, path: req.originalUrl }, 'Unhandled server error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected internal error occurred' },
  });
}
```
- **`middleware/guestAuth.js`**: Signed cookie `reai_guest` (7-day TTL):
```javascript
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function guestAuth(req, res, next) {
  let id = req.signedCookies?.reai_guest;
  if (!id) {
    id = crypto.randomUUID();
    res.cookie('reai_guest', id, {
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: env.GUEST_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  }
  req.guestId = id;
  next();
}
```

### 6.2 ID formats (`utils/ids.js`)

All IDs are generated **only** in `server/src/utils/ids.js`:
```javascript
export const chunkId = (page, index) => 'c_' + page + '_' + index; // page 1-based, index 0-based
export const regionId = (page, index) => 'r_' + page + '_' + index; // image region
export const segmentId = (order) => 's_' + order; // 0-based sequence
export const followupId = () => 'f_' + crypto.randomUUID().slice(0, 8);
export const followupSegmentId = (fId, order) => 'fs_' + fId + '_' + order;
export const SOURCE_ID_RE = /^[cr]_[0-9]+_[0-9]+$/;
```

Document IDs are standard MongoDB ObjectIds. Always validate with `mongoose.isValidObjectId(id)` and return `404 DOCUMENT_NOT_FOUND` on invalid IDs.

### 6.3 Data models (Mongoose)

#### `models/Document.js`
- `ownerGuestId`: String, required, indexed
- `originalName`: String, required, maxlength: 200
- `mimeType`: String, default: 'application/pdf'
- `sizeBytes`: Number, required
- `storageKey`: String, required (e.g., `<documentId>/original.pdf`)
- `fileHash`: String, sha256 hex, indexed
- `status`: String enum `['uploaded', 'parsing', 'ready', 'failed']`, default `uploaded`, indexed
- `errorCode`, `errorMessage`: String (set on failure)
- `pageCount`: Number
- `pages`: Array of `{ number, width, height, rotation, charCount }`
- `totalChars`: Number
- `expiresAt`: Date, indexed (now plus `GUEST_TTL_DAYS`)
- `timestamps`: true

#### `models/Chunk.js`
- `documentId`: ObjectId, ref Document, required, indexed
- `chunkId`: String, required (e.g., `c_1_0`)
- `page`: Number, 1-based
- `order`: Number, global sequence 0, 1, 2...
- `type`: String enum `['heading', 'paragraph', 'list_item', 'caption', 'image_region']`
- `text`: String, normalized text
- `rects`: Array of `{ x, y, w, h }` normalized coordinates in $[0, 1]$
- `bbox`: Union `{ x, y, w, h }`
- `fontSize`: Average font size in points
- `column`: 0 (single), 1 (left), 2 (right)
- Indexes: `{ documentId: 1, chunkId: 1 }` (unique), `{ documentId: 1, order: 1 }`

#### `models/Generation.js`
- `documentId`: ObjectId, ref Document, required, indexed
- `ownerGuestId`: String, required
- `level`: `beginner` | `medium` | `experienced`
- `goal`: `exam` | `presentation` | `understanding`
- `question`: String (default `Explain this document`)
- `cacheKey`: `${level}:${goal}:${question}`
- `status`: `pending` | `streaming` | `done` | `failed`
- `segments`: Array of `{ segmentId, order, type, depth, text, sources, confidence }`
- `followups`: Array of `{ followupId, kind, anchorSegmentId, selectionText, selectionRect, question, answerSegments, createdAt }`
- Index: `{ documentId: 1, cacheKey: 1 }` (unique cache)

---

## 7. Ingestion pipeline & geometry contract

### 7.1 Geometry contract (`normalizeRect.js`)

All geometry uses normalized rects: `{ x, y, w, h }` in $[0, 1]$, origin top-left, pointing right and down.

```javascript
export const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function multiply(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function normRect(minX, minY, maxX, maxY, pageW, pageH) {
  const x = clamp01(minX / pageW);
  const y = clamp01(minY / pageH);
  const x2 = clamp01(maxX / pageW);
  const y2 = clamp01(maxY / pageH);
  return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
}

export const isValidRect = (r) =>
  r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;

export function textItemToRect(item, viewport) {
  if (!item || !Array.isArray(item.transform) || !Number.isFinite(item.width)) return null;
  const tx = multiply(viewport.transform, item.transform);
  const fontH = Math.hypot(tx[2], tx[3]);
  const len = Math.hypot(tx[0], tx[1]);
  if (!fontH || !len) return null;
  const dx = (tx[0] / len) * item.width;
  const dy = (tx[1] / len) * item.width;
  const ox = tx[4];
  const oy = tx[5];
  const xs = [ox, ox + dx, ox + tx[2], ox + dx + tx[2]];
  const ys = [oy, oy + dy, oy + tx[3], oy + dy + tx[3]];
  const pad = fontH * 0.1;
  const r = normRect(
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
    viewport.width,
    viewport.height
  );
  return isValidRect(r) ? r : null;
}

export function unionRects(rects) {
  const list = rects.filter(isValidRect);
  if (!list.length) return null;
  const x = Math.min(...list.map((r) => r.x));
  const y = Math.min(...list.map((r) => r.y));
  const x2 = Math.max(...list.map((r) => r.x + r.w));
  const y2 = Math.max(...list.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

export function verticalOverlap(a, b) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const overlap = Math.max(0, bottom - top);
  return overlap / Math.min(a.h, b.h);
}

export function isHorizontalItem(item, viewport) {
  if (!item || !Array.isArray(item.transform)) return false;
  const tx = multiply(viewport.transform, item.transform);
  return Math.abs(tx[1]) <= Math.abs(tx[0]) * 0.3;
}
```

### 7.2 Ingestion stages (`pipeline.js`)

1. **Upload handling** (`upload.js`): Multer diskStorage to temp folder, checks `%PDF-` magic header bytes, computes SHA-256 for instant deduplication.
2. **Text extraction** (`extractText.js`): Uses `pdfjs-dist/legacy/build/pdf.mjs` to extract text items and dimensions.
3. **Line grouping** (`buildChunks.js`): Items with $\ge 50\%$ vertical overlap merge into lines; gaps $> 2.5\times$ font size split columns.
4. **Furniture detection** (`detectFurniture.js`): Detects and strips repeated headers, footers, and page numbers.
5. **Column ordering** (`detectColumns.js`): Identifies vertical gutters and sets 2-column reading order.
6. **Block & chunk creation** (`buildChunks.js`): Joins lines into paragraphs, headings, list items, and captions, enforcing `MAX_CHUNK_CHARS = 1200`.

---

## 8. API contract

| Method | Endpoint | Description | Status Codes |
|---|---|---|---|
| `GET` | `/api/health` | Health check | 200 |
| `POST` | `/api/documents` | Upload PDF file (multipart form `file`) | 202 (accepted), 200 (reused), 400, 415 |
| `GET` | `/api/documents/:id` | Poll document parsing status & metadata | 200, 404 |
| `GET` | `/api/documents/:id/chunks` | Retrieve extracted chunks with coordinates | 200, 404, 409 (not ready) |
| `GET` | `/api/documents/:id/file` | Stream original PDF file for viewer | 200, 404 |
| `DELETE` | `/api/documents/:id` | Cascade delete document, chunks & files | 200, 404 |
| `POST` | `/api/generations` | Start or retrieve cached AI generation | 200 (cached), 202 (started), 400, 404 |
| `GET` | `/api/generations/:id` | Fetch generation status & completed segments | 200, 404 |
| `GET` | `/api/generations/:id/stream` | SSE endpoint for real-time segment streaming | 200 (text/event-stream), 404 |
| `POST` | `/api/generations/:id/ask` | Select-to-ask follow-up question | 200, 400, 404 |
| `POST` | `/api/generations/:id/simplify` | "I didn't get this" simplification follow-up | 200, 400, 404 |

---

## 9. AI generation layer

1. **Provider abstraction** (`services/llm/index.js`):
   - `mockProvider.js`: Produces realistic, deterministic NDJSON streaming explanations without requiring API keys.
   - `anthropicProvider.js`: Streams Claude 3.5 Sonnet responses.
2. **NDJSON streaming parser** (`ndjsonParser.js`): Buffers incoming tokens, parses valid line-by-line segment JSON, and verifies cited chunk IDs against database.
3. **Confidence engine** (`confidence.js`): Measures vocabulary overlap between segment text and cited source chunks. Segments with weak citations flag as `'low'` confidence and render with dashed borders.
4. **Large document sectioning** (`sectioning.js`): Automatically breaks documents exceeding 120,000 characters into coherent sections.
5. **SSE stream runner** (`runner.js`): Manages in-memory pub/sub broadcasting `meta`, `segment`, and `done` events with replay for newly attached clients.

---

## 10. Follow-ups (Select-to-Ask & Simplify)

- **Select-to-Ask (`POST /api/generations/:id/ask`)**:
  Users select text or draw a bounding box over the PDF. Chunks intersecting the selection are extracted and sent to the LLM for targeted answers.
- **Simplify ("I didn't get this") (`POST /api/generations/:id/simplify`)**:
  Users click on any segment they find difficult. The LLM re-explains the underlying cited source using simpler vocabulary and intuitive analogies.

---

## 11. Vision and image regions (Phase 5)

Supports diagram and figure detection with normalized bounding boxes, stored as `type: 'image_region'` chunks with automated captions.

---

## 12. Client architecture

- **State management** (`Zustand`):
  - `useDocStore.js`: Document metadata, chunk map, generation data, followups.
  - `useViewStore.js`: Active/hovered segment, pinned chunk, page, zoom, split pane orientation, history stack.
- **Client geometry** (`client/src/lib/geometry.js`): Converts between normalized $[0, 1]$ coordinates and viewport DOM pixels.
- **Keyboard shortcuts**:
  - `j` / `k`: Next / previous AI explanation segment
  - `p`: Pin/unpin active source highlight
  - `Escape`: Clear active highlight and selection box
  - `+` / `-`: Zoom in / zoom out

---

## 13. Client components

- `SplitLayout.jsx`: Responsive two-pane resizable layout (`react-resizable-panels`) with collapse and side-swap.
- `PdfViewer.jsx` & `PdfPage.jsx`: Renders crisp vector PDF text and canvas layers (`react-pdf`).
- `HighlightLayer.jsx`: Interactive SVG overlay boxes (solid yellow for active, blue for pinned, dashed orange for low confidence).
- `ChunkHitLayer.jsx`: Transparent clickable hit-boxes over text chunks to trigger reverse scroll to AI segments.
- `AiPanel.jsx` & `SegmentItem.jsx`: Formatted explanation segments with interactive citation badges `[p.1 #0]`.
- `SourceBadge.jsx` & `SourcePreview.jsx`: Hoverable citation tags with floating snippet previews.
- `BackToWhereIWas.jsx`: One-click button to return to previous reading position.

---

## 14. Edge cases & maintenance

- Auto-restarts cleanup interrupted documents with `SERVER_RESTARTED`.
- Hourly cron deletes expired guest files and records.
- Path traversal protection in local disk storage.
- Scanned documents detected and flagged with `NO_TEXT_LAYER`.

---

## 15. Build order with "Done when" checks

All 15 steps are fully verified and passing:
- **Server unit tests**: `npm test -w server` (13/13 passing)
- **Client unit tests**: `npm test -w client` (4/4 passing)
- **Client production build**: `npm run build -w client` (built in 1.18s)
- **Full monorepo test**: `npm test` (17/17 passing)
