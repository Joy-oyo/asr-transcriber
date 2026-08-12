# ASR Transcriber

Whisper speech recognition running **entirely in the browser**. Drop in audio or
video, or record from the microphone, and get timestamped text you can export as
TXT, SRT, WebVTT, or JSON.

No audio is uploaded. No API keys. No backend.

## How it works

1. **Decode** — the file is decoded with the Web Audio API, then downmixed and
   resampled to 16 kHz mono via `OfflineAudioContext`, which is the exact shape
   Whisper expects.
2. **Infer** — a Whisper ONNX checkpoint runs through
   [Transformers.js](https://huggingface.co/docs/transformers.js) inside a
   dedicated Web Worker, so the UI never blocks. WebGPU is used when the browser
   offers an adapter; otherwise it falls back to multi-threaded WASM.
3. **Stitch** — audio is processed in 5-minute blocks for progress reporting,
   while Whisper's own 30 s sliding window (with 5 s stride) handles overlap and
   de-duplication inside each block. Timestamps are shifted back onto the
   original timeline.
4. **Export** — segments are serialised to plain text, SubRip, WebVTT, or JSON.

Model weights are fetched once from the Hugging Face CDN and then cached by the
browser. After that first download, transcription works offline.

## Models

| Checkpoint | Size | Languages |
| --- | --- | --- |
| `Xenova/whisper-tiny.en` | ~42 MB | English only |
| `Xenova/whisper-tiny` | ~42 MB | Multilingual |
| `Xenova/whisper-base` | ~78 MB | Multilingual (default) |
| `Xenova/whisper-small` | ~250 MB | Multilingual — WebGPU recommended |

English-only checkpoints reject `language` and `task` arguments, so those
controls are disabled automatically when one is selected.

## Getting started

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (webpack) |
| `npm run build` | Production build |
| `npm run build:verify` | Production build into `.next-verify`, so it never clobbers a running dev server |
| `npm run lint` | ESLint |

## Deploying

This ships as its own Vercel project rather than as a route inside a larger site,
for two concrete reasons:

- The cross-origin isolation headers below apply to the whole origin. On a shared
  origin they would block any cross-origin image or script that does not opt in
  with CORP.
- Model weights, the worker bundle, and the framework version can move
  independently of whatever links to this demo.

Setup:

1. Import the repository on Vercel. Root directory is the repo root; the preset
   is detected as Next.js.
2. No environment variables are needed — there is no backend and no API key.
3. Add the custom domain (e.g. a `asr.` subdomain) in **Settings → Domains**.

The response headers in `next.config.ts` are applied by Vercel automatically, so
`SharedArrayBuffer` and multi-threaded WASM work in production without extra
configuration. Static hosts that cannot set headers (GitHub Pages, plain S3)
will still run the demo, but single-threaded and noticeably slower.

## Notes on the setup

- **Webpack, not Turbopack.** Transformers.js needs `sharp` and
  `onnxruntime-node` aliased away so the Node-only halves of the library never
  reach the client bundle. That aliasing is expressed in `next.config.ts` as a
  webpack config, so both `dev` and `build` pass `--webpack`.
- **Cross-origin isolation.** `Cross-Origin-Opener-Policy` and
  `Cross-Origin-Embedder-Policy` headers are set so ONNX Runtime Web can use
  `SharedArrayBuffer` for multi-threaded WASM. Without them inference still
  works, just single-threaded.
- **Dependency overrides.** `sharp` and `adm-zip` arrive only through
  transformers.js's optional Node dependencies and are never executed here, but
  they are pinned to patched releases so `npm audit` stays clean.
- **int8 weights on both backends.** Transformers.js defaults WebGPU to fp32,
  which turns the 78 MB `base` checkpoint into a ~280 MB download. int8 keeps
  the transfer close to the sizes listed above on every backend.

## Limits

- Audio longer than 60 minutes is rejected — an hour of 16 kHz float PCM is
  already ~230 MB in memory.
- Accuracy is bounded by the checkpoint size. `tiny` is fast but rough; use
  `base` or `small` for anything you intend to publish.
- Safari supports the pipeline but has no WebGPU adapter for this workload yet,
  so it runs on WASM.
