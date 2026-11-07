# What changed

## Gemini reliability
- NEW `server/src/services/llm/gemini/scheduler.js` - RPM/TPM/concurrency/priority/cooldown admission control
- NEW `server/src/services/llm/errors.js` - error classification, Retry-After parsing, backoff
- REWRITTEN `server/src/services/llm/geminiProvider.js` - timeouts, retries, fallback model, finish reasons, JSON-schema + image parts
- NEW `server/src/utils/{sleep,guestQuota,llmHttp}.js`; `errorHandler.js` sends `Retry-After`

## Context + generation
- REWRITTEN `llm/prompts.js` (outline, previous-section tail, continuation, figure rules, prompt-injection guard)
- NEW `generation/context.js` (outline, BM25 retrieval, context assembly), `generation/sectionRunner.js`
- REWRITTEN `generation/{generate,ask,simplify,runner,sectioning,confidence}.js`
- `controllers/generations.controller.js`: resume, supersede, no more hanging SSE after a failure/restart
- `controllers/ask.controller.js`: cancel on disconnect, 90s deadline, friendly HTTP errors
- `index.js`: interrupted generations/vision passes are marked resumable on boot
- FIXED follow-up segment ids colliding with main ids (`s_0` vs `fs_<id>_0`)

## Phase 5 (diagrams)
- NEW `ingest/{figures,visionPass,pdfjsPolyfills}.js`, `vision/{regions,geminiProvider,mockProvider}.js`
- Document: `visionStatus/visionProgress/regionCount`; Chunk: `regionRole/regionSeq/figure`

## Client
- `useDocStore`: de-duplicated segments (cached runs / reconnects used to double), stream state
- `sse.js`, `useGenerationStream.js`: progress/notice events, reconnect with re-sync
- NEW `GenerationStatus`, `WalkthroughControls`, `useWalkthrough`; `HighlightLayer` handles follow-ups, regions, walkthrough
- `DocumentPage`: stable loading effect (changing Level/Goal no longer reloads the page), Resume, diagram polling/banner

## Tests (76 server + 7 client)
`vitest.config.js` forces the mock providers so tests never spend your API quota.
