# Leeward — Game Architecture Recommendation (Browser / WebGPU, Open-Source Edition)

*Senior staff architecture review · rev. 4.1 (hosting changed to Vercel), 17 Oct 2026 · repo reviewed read-only at commit `87a407a` (github.com/andrewgarrison/leeward)*

> **Constraints for this revision (set by the user):**
> 1. The game runs **in the browser on WebGPU**, building on the repo's MIT ocean, sky, and WGSL code.
> 2. It is **free and fully open source** (the game lives in the public repo) and **not sold**.
> 3. **No paid services.** Hosting is **Vercel's free Hobby plan** (allowed because the game is free and non-commercial). GitHub Pages and Cloudflare Pages are the free alternatives.
> 4. Saves are **local-first** in the browser.
> 5. Assets come from the **Apple Silicon Mac** pipeline and must be **redistributable in a public repo**.
>
> This replaces the Godot desktop plan, which is summarized in Appendix A.

---

## 0. TL;DR

| Decision | Recommendation |
|---|---|
| **Framework** | **Three.js (r186 or later, MIT) using `WebGPURenderer` and TSL** for the scene (glTF, skinning, shadows, materials, post-processing), with the repo's **WGSL ocean and sky compute ported into Three's compute pipeline**: the existing WGSL bodies are wrapped in `wgslFn` nodes writing to `StorageTexture`s, and the ocean surface becomes a TSL node material. Written in **TypeScript**, built with **Vite**. |
| **WebGL2 fallback** | **Yes, required.** Steam Deck (AMD on Linux), most Linux GPUs, and Firefox on Linux and Android don't get WebGPU by default in October 2026. Three's renderer falls back to WebGL2 automatically. The custom compute ocean can't, so ship an **"ocean lite"**: pre-baked looping FFT displacement and normal textures from the real simulation, or Gerstner waves, plus a simpler sky. |
| **Game layer** | Data-driven content in **JSON/YAML validated by JSON Schema**. A deliberately small simulation core. **Rapier (WASM, Apache-2.0)** for boats and buoyancy. Web Audio (via Howler.js, MIT). A DOM/HTML UI overlay. Pointer, touch, and Gamepad input. |
| **Saves** | **IndexedDB**, with a versioned schema, migrations, autosave, 5 rotating backups plus a daily snapshot, `navigator.storage.persist()`, one-click **export/import**, and **Web Locks** so two open tabs can't overwrite each other. **Install-as-app (PWA)** is strongly encouraged, because it exempts Safari home-screen apps from the 7-day eviction of script-writable storage. Time-away events run on the system clock with a monotonic high-water mark and a cap. Optional future cloud sync is designed so the game works if it disappears. |
| **Hosting** | **Vercel Hobby (free)** serves only the static app shell (Vite output, about 5 MB or less). No serverless functions are needed. Hobby includes per month: **100 GB Fast Data Transfer, 1M CDN requests, 10 GB Fast Origin Transfer**. **Going over pauses the feature for up to 30 days rather than billing you.** Hobby is for **non-commercial personal use only** (donations are allowed). Heavy island packs stay on **jsDelivr** (free and unmetered; 20 MB per file from GitHub by default), pinned to release tags of a separate assets repo, with **Cloudflare Pages** (free, unlimited static bandwidth, 25 MiB per file, 20k files) as mirror. A **service worker** caches everything, so repeat visits barely touch Vercel. **Use a custom domain** as the permanent origin, so the shell can move to GitHub Pages or Cloudflare Pages without stranding saves. Vercel's **preview deployment per PR** is a bonus for playtesting. |
| **Download budget** | **≤ 20 MB** (compressed) to the first playable beach. **≤ 40–60 MB per island pack.** **≤ 350 MB** for the whole castaway chapter. Total hosted asset footprint **≤ 700 MB** per release, which keeps the assets portable to any free host, including GitHub Pages' 1 GB cap. |
| **Assets** | The Apple Silicon pipeline from rev. 3, retargeted to the web:<br>**Generation:** FLUX.2 [klein] 4B (Apache-2.0) via mflux → BiRefNet (MIT) cutout → TripoSR (MIT) drafts or TRELLIS.2 (MIT) via trellis-mac for hero props → headless Blender cleanup.<br>**Web packaging:** **gltf-transform (MIT)** applies meshopt compression, **KTX2/Basis Universal** textures, LODs, and size budgets.<br>**Licensing:** only **CC0, CC-BY 4.0** (credited automatically), or own and generated work released as CC0. **No NC/ND licenses**, and no restricted-weight model outputs. |
| **Agent workflow** | Everything is text in git (TS code, JSON data, Blender Python, gltf-transform scripts). **Playwright** end-to-end and **screenshot tests of the ocean** run in CI, using SwiftShader WebGPU under Xvfb. Golden images are captured on the Mac's real GPU. **GitHub Actions** (free for public repos) runs tests. **Vercel's Git integration** builds previews per PR and deploys production from `main`, with branch protection requiring green CI before merge. |
| **Scale** | Static files plus local saves means **zero per-player server cost**. The only limits are bandwidth and size caps on the free hosts. Mitigations: offload assets to a CDN, use immutable hashed filenames, and cache in the service worker (§9). |
| **Unavoidable costs** | **None in money.** The Mac you own, electricity, and your time. A custom domain (about $10/yr) is **recommended but optional**: it keeps the save origin portable between hosts. Otherwise use the free `<project>.vercel.app` permanently. |


---

## 1. What the game is (from the story and design docs)

Sources: `docs/story/2026-10-17-leeward-story-outline.md`, `docs/brainstorms/2026-10-17-leeward-game-brainstorm.md`, `README.md`.

- **Genre:** a **solo** castaway and sailing game with **Old School RuneScape-style progression**: trades from 1 to 99, long curves, areas gated by trade level, interlocking skills, and skill *ceilings* that you lift by finding manuals and tools. The tone is grounded, modern, sunlit, and personal, like *Cast Away*. Nothing is magical. "The sea is the dangerous part."
- **World:** an archipelago inside **the Leeward Current**, a ring of weather and magnetic anomaly. The castaway chapter has six islands (First Light, Tallyrock, Ember Isle, Gullhaven, Saltglass Shoals, Lantern Key) and four hull tiers (log raft → dugout outrigger → sail canoe → deep-keeled sloop). It ends at the Storm Wall and the town of Harborlight. After that come the **Fogbound islands**, one per content update, and the endgame voyage to **the Eye**.
- **Loop and inputs:** "you choose a job and stay with it while it resolves". Sailing means packing, then clicking a heading. A crossing risks cargo, **never** progress.
- **Time away:** "The fire is still burning when you log back in." The tide brings wreckage "every few real days", fish traps fill while you're away, and weather changes which crossings are safe.
- **Narrative systems:** relics and a limited relic **shelf**. The relics you display decide which memory thread (Partner, Child, Parent, Sibling, Dog) opens the blue door. There is also a shared mystery about Flight 417 and the pilot.
- **Social:** explicitly solo. "Each person has their own save. Sharing the game means giving someone the same beach to start."
- **Build plan:** six playable builds (Morning → Work → First Boat → Full Island → Another Shore → The Door). "Builds 1–4 are the game."

## 2. What exists in the repo today

Sources: `README.md`, `package.json`, `build.mjs`, `server.mjs`, `index.html`, `js/main.js`, `js/boat.js`, `js/wgsl/*.js`, `LICENSE`, git history.

- **Stack:** raw **WebGPU and WGSL with no engine**, written as ES modules. The only dev dependency is `esbuild` (`package.json`). `build.mjs` bundles everything into self-contained `ocean.html` and `ocean.min.html` pages. `server.mjs` is a dependency-free dev server with `POST /__shot` and `/__log` endpoints, which the README says were used for screenshot critique by "critic subagents" in headless Chrome.
- **Rendering (from Noniv/web-ocean, MIT; commits `b346240` and `a07c7fd`):**
  - Tessendorf FFT ocean with **six 256² cascades** (1103 m → 0.26 m) and a JONSWAP + Donelan-Banner spectrum (`js/wgsl/sim.js`).
  - A 17-level CDLOD surface out to 160 km, LEAN-mapped sun glitter, foam advection, and whitecaps driven by the Jacobian (`js/wgsl/ocean.js`).
  - A Hillaire atmosphere with two analytic cloud layers (`js/wgsl/sky.js`), and HDR with 4× MSAA, bloom, and AgX tonemapping (`js/wgsl/post.js`).
  - About 6–8 ms per frame at 1440p on an RTX 5070 Ti, according to the README.
- **Game code (commit `e9a980c`):** `js/boat.js` has a procedural sailboat mesh (`buildSailboat`), click-to-sail steering (`stepBoat`), wave-sampled pitch and roll (`seaPose`, which reads a GPU height probe in `js/wgsl/objects.js`), and a chase camera. `js/main.js` (1,010 lines) contains the device setup and frame loop.
- **Not present:** terrain or shore, characters, animation, physics, audio, UI, saves, backend, tests, CI, or an asset pipeline. The README and the brainstorm's capabilities section both say so.
- **Bug to note (found by reading `build.mjs`, not by running it):** the minified bundle concatenates only the WGSL modules and `js/main.js`, leaving out `js/boat.js`. `ocean.min.html` calls `buildSailboat()` but contains no definition of it, so the minified page is likely broken since the sailboat was added. The new Vite build replaces `build.mjs` (§12), but fix it now if `ocean.min.html` is linked anywhere, by adding `js/boat.js` to the minified concatenation.

**Assessment:** the repo is an excellent open-source **browser** ocean and sky renderer, about 3,000 lines of MIT WebGPU code, and now it's also the starting point of the shipping client. What's missing is everything a framework provides (glTF and skinned characters, shadows, a material system, loaders, post-processing, input, audio) and everything a game provides (shore, interaction, saves, content). It was written for one 2026-class desktop GPU (6–8 ms per frame at 1440p on an RTX 5070 Ti), so **quality tiers for laptops and iPads** are new work.

---

## 3. Browser framework decision

### 3.1 Options (checked October 2026)

| | **Three.js r186+** (`WebGPURenderer` + TSL) | **Babylon.js 9** | **PlayCanvas engine** | **Raw WebGPU** (extend the repo) |
|---|---|---|---|---|
| License | MIT | Apache-2.0 | MIT. The **Editor frontend has been open source (MIT) since July 2025, but the Editor backend is a hosted, non-self-hostable service**, so it's engine-only here | MIT (your own code) |
| WebGPU + WebGL2 fallback | **Automatic fallback** inside one renderer. TSL compiles to WGSL or GLSL | Both backends, mature WebGPU support | Both backends | WebGPU only unless you write a second renderer |
| Using the existing WGSL | **`wgslFn` embeds raw WGSL functions** in compute and material nodes. `StorageTexture` with read-write access. Community demos also share one `GPUDevice` between Three and raw WGSL pipelines | WGSL `ShaderMaterial` and a `ComputeShader` class. Viable | Custom WGSL possible. Fewer examples | Zero porting. The code already runs |
| What you get for free | glTF/KTX2/meshopt loaders, skinning and animation mixer, shadows, PBR, a TSL post-processing pipeline (bloom, AgX, SSGI), a huge example corpus | The most "engine-like": GUI, inspector, physics plugins, audio, XR | A lean, fast runtime with good draw-call performance | Nothing. You'd write glTF loading, skinning, shadows, the material system, culling, and post-processing yourself |
| Ecosystem and agent familiarity | **Largest by far.** Models and agents know it best | Large | Medium | — |
| Risks | `WebGPURenderer` is officially "still experimental". Reported CPU overhead with many separate meshes, so batch and instance. Monthly releases change APIs, so **pin a version** | Bigger bundle. Different idioms. Fewer TSL-style WGSL hooks | Smaller community. Editor-centric documentation | Years of engine work for one person |

### 3.2 Recommendation: Three.js `WebGPURenderer`, with the repo's WGSL ported into its compute pipeline

- **Why Three.js:** it's the smallest step from where the repo is (WebGPU and WGSL) to a full scene framework. It provides the automatic WebGL2 fallback the Steam Deck and Linux need, lets the repo's WGSL be embedded nearly verbatim (`wgslFn`), and has the deepest open ecosystem: glTF, KTX2, meshopt, skinned characters, post-processing, and examples. It's also what coding agents produce most reliably.
- **Why not Babylon.js:** it's a credible runner-up, more batteries-included, and Apache-2.0. Choose it if you'd rather have a heavier engine with an inspector and integrated physics and audio. Three.js wins on how easily WGSL ports in and on ecosystem size.
- **Why not PlayCanvas:** the engine is excellent, but its productivity comes from the Editor, which depends on a hosted proprietary backend. Engine-only PlayCanvas loses its main advantage.
- **Why not raw WebGPU:** keep raw WebGPU only as the **fallback integration path for the ocean** (§3.3, option B), not as the game engine.

### 3.3 Integrating the ocean and sky

| Repo source | Target in Three.js | Notes |
|---|---|---|
| `js/wgsl/sim.js` (spectrum init, evolution, radix-2 FFT rows and columns in workgroup memory, Jacobian, foam advection) | **Option A (preferred):** compute nodes built from `wgslFn` wrapping the existing WGSL bodies, plus `workgroupArray` and barriers, writing displacement, slope, and foam into `StorageTexture` array layers. `renderer.compute()` runs each frame | Keeps one device, one resource manager, and correct synchronization with the render pass. The 6 cascades and `CASC_L` carry over unchanged |
| | **Option B (fallback):** create the `GPUDevice` yourself, give it to `WebGPURenderer`, and run the original raw WGSL pipelines on the same queue | Zero rewrite of the simulation, but sharing textures relies on less-public backend internals. Use only if Option A fights you |
| `js/wgsl/ocean.js` (CDLOD surface, LEAN glitter, subsurface, foam shading) | A custom `NodeMaterial` (TSL), with the shading math reused through `wgslFn` and a CDLOD mesh built in TS | The material then works with Three's depth, shadows, fog, and post-processing, which is needed once islands, boats, and characters share the frame |
| `js/wgsl/sky.js` (Hillaire LUTs, clouds) | LUT compute nodes plus a sky dome material, with the environment map refreshed every N frames for reflections and image-based lighting | Three's `PMREMGenerator` makes reflections for scene materials |
| `js/wgsl/post.js` (bloom, AgX) | Three's post-processing pipeline: bloom node plus AgX tone mapping | Mostly replaced |
| `js/wgsl/objects.js` `BOAT_PROBE` | GPU→CPU readback of a few height samples (async, one frame late), or a CPU-side evaluation of the low cascades | Feeds Rapier buoyancy (§5.4) |
| `js/boat.js` `stepBoat`, `seaPose`, `chasePosition`, `buildSailboat` | Ported to TypeScript as-is (they're pure math) | Already tuned |

**WebGL2 "ocean lite":** Three's WebGL2 fallback can't run compute-heavy WGSL (no storage textures or workgroup memory). Offline, run the real FFT and **bake a seamlessly looping sequence** (e.g. 64 frames × 3 cascades) of displacement and normal maps into KTX2 array textures, about 6–10 MB. Animate it with a TSL material that works on both backends. Add a simpler analytic sky. It looks close to the real ocean at gameplay distance, and it also serves as the low-end quality tier on WebGPU.

**Acceptance:** the Three.js port must match the repo's `docs/front.jpg`, `side.jpg`, and `high.jpg` at the same settings, in automated screenshot tests (§10) judged by critic agents and the user.

### 3.4 Language and tooling

- **TypeScript** in strict mode, **Vite** for dev server, HMR, and production bundles with hashed filenames. Use `vite-plugin-pwa` (Workbox) for the service worker and manifest.
- Keep WGSL as **`.wgsl` files imported as strings** (Vite `?raw`), so agents and editors treat shaders as first-class text.
- **Pin `three` to an exact version.** Upgrade deliberately behind the screenshot tests.

---

## 4. WebGPU availability (October 2026) and target devices

| Platform / browser | WebGPU by default? | Plan |
|---|---|---|
| Chrome / Edge on Windows, macOS, ChromeOS | ✅ | Full quality tiers |
| Chrome on Android (recent devices) | ✅ (on supported GPUs) | Mobile tier |
| **Safari 26** on macOS 26, **iOS 26, iPadOS 26** | ✅ (shipped in Safari 26) | iPad tier. Older iOS gets WebGL2 lite |
| Firefox on Windows and Apple Silicon macOS | ✅ | Full tiers |
| Firefox on Linux, Android, Intel Macs | ❌ (Linux stable only via `about:config`) | WebGL2 lite |
| **Chrome on Linux** | ⚠️ Only Intel Gen12+ GPUs by default since Chrome 144. **AMD (including Steam Deck) is behind flags** | **Steam Deck = WebGL2 lite** by default. Document the Chrome flag for enthusiasts. A future Tauri wrap won't fix Linux either (Appendix B) |
| Web3D Survey 2026 coverage (adapters reporting WebGPU) | Roughly 85% in Chrome, 81% in Safari, 61% in Firefox, 74% on Android, 86% on iOS | Expect **10–25% of players on WebGL2** |

### 4.1 Target devices and frame budgets

| Tier | Reference device | Target | Ocean config | Scene budget (visible) |
|---|---|---|---|---|
| **High** | Discrete desktop GPU, M-series Pro or Max | 60 fps at 1440p | 6 cascades × 256², env cube every 2 frames, MSAA 4× | ≤ 3M tris, ≤ 1,500 draw calls, ≤ 768 MB GPU memory |
| **Medium (the main target)** | **Mid-range laptop** (Apple M1/M2, recent Intel/AMD integrated) | 60 fps at 1080p, with dynamic resolution | 4 cascades × 256² (or 6 × 128²), env cube every 4 frames, FXAA/TAA | ≤ 1.5M tris, ≤ 800 draws, ≤ 512 MB |
| **iPad** | iPad Air or Pro (M-class) on Safari 26 | 60 fps at about 0.75× native | 4 × 128², reduced foam resolution | ≤ 1M tris, ≤ 500 draws, ≤ 384 MB. iOS kills tabs that use too much memory |
| **Lite (WebGL2)** | Steam Deck in Chrome or Firefox, older iOS, Linux | 30–40 fps at 800p | Baked looping ocean | ≤ 600k tris, ≤ 400 draws, ≤ 256 MB |

Rules: a **GPU timer HUD** (the repo already uses `timestamp-query`), **automatic quality selection** from a 3-second benchmark on first run (overridable), dynamic resolution, and instancing or `BatchedMesh` for vegetation and props (WebGPURenderer's per-mesh CPU cost is its known weak spot).

---

## 5. Client architecture

### 5.1 Repository layout (everything is text, in git)

```
leeward/                      (public, MIT code)
  index.html  vite.config.ts  tsconfig.json  package.json
  src/
    core/        # pure TS sim: skills, xpCurves, jobs, inventory, crossings, rng(seed),
                 #   offlineClock, saveSchema, migrations  (no DOM, no three)
    render/      # three.js setup, quality tiers, post pipeline
    ocean/       # *.wgsl (ported from js/wgsl), compute nodes, CDLOD, ocean material, lite path
    sky/         # Hillaire LUT compute, sky dome, env map
    world/       # island streaming, terrain, foliage instancing, POIs
    sailing/     # boat controller (ported stepBoat/seaPose), Rapier buoyancy, crossing resolver
    character/   # player controller, animation state machine, IK helpers
    ui/          # DOM overlay (Preact or plain TS): skills, inventory, relic shelf, chart, packing
    audio/       # Web Audio graph: ambience by wind/sea state, SFX, music
    input/       # pointer, touch, keyboard, Gamepad API → action map
    save/        # IndexedDB store, backups, export/import, persist(), Web Locks
  data/          # skills.yaml, items.yaml, recipes.yaml, relics.yaml, islands.yaml, hulls.yaml
  schemas/       # JSON Schemas for data/ and save files (validated in CI)
  tools/         # Blender scripts, gltf-transform pipeline, provenance → CREDITS generator,
                 #   ocean-lite baker, balance simulator
  tests/         # vitest (unit), playwright (e2e + screenshots)
  assets-src/    # small source specs (spec.yaml per asset), NOT raw generations
leeward-assets/               (separate public repo: optimized GLB/KTX2/audio, tagged per release)
```

### 5.2 Architecture principles

1. **Data-driven content:** items, skills, levels, recipes, relics, islands, hull stats, drop tables, and crossing risk models live in `data/*.yaml`, compiled to JSON at build time and **validated against JSON Schema** (e.g. Ajv) in CI. Agents edit data, not code, for most content work.
2. **Simulation core separated from rendering:** `src/core` is pure TypeScript, deterministic given a seed and a clock. It's unit-tested with Vitest and reused by a headless balance simulator (Node) that runs 10k simulated players through the XP curves (target from the story doc: about 50–60 in key trades by Harborlight).
3. **ECS: only if it earns its keep.** Leeward has a modest entity count (a camp, props, a few animals, one boat, one player). Plain classes plus systems are enough. If the entity count grows (fish schools, birds, debris), adopt **miniplex** (a small, TypeScript-friendly ECS) for the world layer rather than a data-oriented one like bitECS. Check licenses at adoption time.
4. **Seeded worlds:** "give someone the same beach" becomes a **seed in the URL** (`?seed=…`). Debris layout, tide schedule, and weather all derive from it, so sharing needs no server and is just a link.
5. **Streaming:** the ocean, sky, and boat are always resident. Islands load as **asset packs** when the boat approaches (by distance, with hysteresis) and unload when left far behind.

### 5.3 Physics, audio, UI, input

| Concern | Choice | Notes |
|---|---|---|
| Physics | **Rapier** (`@dimforge/rapier3d` 0.21, Apache-2.0, WASM) | Rigid-body hulls, colliders for terrain and props, character controller. **Buoyancy:** 4–8 pontoon points per hull sample the ocean height (§3.3). Apply spring and damping forces, and let the ported `stepBoat` provide the arcade steering layer. Run physics in a fixed-step loop, optionally in a Web Worker |
| Audio | **Web Audio API**, with **Howler.js (MIT)** for simple SFX and music handling, or a thin custom graph | Ambience beds crossfaded by wind and sea state. Positional audio for surf and birds. Unlock audio on the first user gesture (iOS) |
| UI | **DOM/HTML overlay** (Preact or plain TS components, CSS) | Accessible (screen readers, text scaling, localization) and fast to build. The OSRS-style screens (skills, inventory, shelf, chart) are classic UI, not 3D |
| Input | Pointer Events (mouse, pen, touch), keyboard, **Gamepad API** | The click-to-act design maps directly to **tap-to-act** on touch. Gamepad gets a focus-navigable UI plus a cursor or target cycling. Provide large touch targets and no hover-only affordances |
| Mobile and touch | Responsive UI, pinch-to-zoom camera, `devicePixelRatio` cap, pause on `visibilitychange`, wake lock during long jobs (optional) | iPad is a first-class target. Phones are best-effort |

---

## 6. Saves: local-first in the browser

### 6.1 Storage design

| Aspect | Design |
|---|---|
| Store | **IndexedDB** (works in every target browser) via a tiny wrapper. Object stores: `saves` (slot → current), `backups` (slot, timestamp), `meta` (schema version, persist status). **OPFS** is optional later for large blobs. It isn't needed for saves of about 50–200 KB |
| Format | A versioned JSON document `{schemaVersion, worldSeed, createdAt, lastSeenWall, lastSeenHigh, skills, inventory, camp, relics{displayed, stored, foundOrder}, islands, hulls, flags}` with a checksum. Optionally gzip-compressed with `CompressionStream` |
| Migrations | Each `schemaVersion` bump ships a pure migration function plus a test against **golden old saves** stored in `tests/fixtures/saves/`. Never break old saves: Fogbound updates will run for years |
| Autosave | On job completion, every 60 s while active, and on `visibilitychange` (hidden) and `pagehide`. Writes are atomic: write a new record, then swap the pointer |
| Backups | **5 rotating backups** plus **one daily snapshot for 7 days**. On load, validate the checksum and schema, and fall back to the newest valid backup with a visible notice |
| Multi-tab safety | **Web Locks API**: only the tab holding `leeward-save` may write. Other tabs show "Leeward is open in another tab". `BroadcastChannel` handles hand-off |
| Persistence | Call **`navigator.storage.persist()`** inside a user gesture *after* the first meaningful save (for example, lighting the first fire), not on page load. Show the result in settings. Use `navigator.storage.estimate()` to warn on low quota |
| Export / import | **One-click "Download save"** (`.leeward.json`, gzip-compressed) and **"Load save file"** (file picker or drag-and-drop), plus Web Share on mobile. Prompt for an export after major milestones ("You built your raft. Back up your castaway?") |

### 6.2 Browser eviction, and why the PWA matters

- **Default (best-effort) storage** can be evicted under storage pressure in every browser. When an origin's data is evicted, all of it goes at once.
- **Safari's Intelligent Tracking Prevention** deletes all script-writable storage (IndexedDB, localStorage, Cache API, service-worker registrations) for an origin after **7 days of Safari use without user interaction** with that site.
- **Home Screen web apps** (an installed PWA) on iOS, iPadOS, and macOS are **exempt from that 7-day cap**. From iOS and iPadOS 26, every added site opens as a web app by default. Safari 17+ supports `persist()` and grants it by heuristics such as whether the site is a Home Screen web app.
- **Caveat:** Home Screen app storage is **isolated from Safari's**. A save made in a Safari tab doesn't appear in the installed app, so on first launch of the installed app, offer "Import your save from the browser" (an export/import flow).
- **Recommendation:**
  - Ship a proper **PWA**: manifest, icons, `display: standalone`, and a service worker caching the shell and installed island packs for **offline play**.
  - Prompt **"Install Leeward"** after the first session.
  - Request `persist()`.
  - Nudge regular **save exports**.
  - Treat storage as best-effort everywhere else.

### 6.3 Time-away mechanics (system clock, capped)

- Track `lastSeenHigh = max(previous, Date.now())`. If the clock goes **backwards**, credit **zero** away-time and don't punish the player.
- Cap credited away-time per session (e.g. **72 h**): fires burn out, traps hold a capped catch, and the tide delivers at most one or two pieces of wreckage.
- Make schedules deterministic: wreckage drops = `hash(worldSeed, dayIndex)`.
- It's single-player and open source, so the goal is robustness, not anti-cheat.

### 6.4 Optional future cloud sync (designed to be removable)

- Sync is just **upload and download of the same export blob**, with `saveRevision` and `deviceId` for conflict detection ("Keep this device / keep cloud"). The game never needs it to run.
- Free, open-source-compatible options when wanted:
  - **remoteStorage** (an open protocol; the user brings their own storage).
  - A self-hosted **PocketBase (MIT)** on a free compute tier. That's a proprietary host with no uptime guarantee, and the operations work is yours.
- **Out of scope until players ask for it.** Export/import covers moving between devices.

---

## 7. Asset licensing for a public, open-source repo

Everything in `leeward` and `leeward-assets` is publicly downloadable, so **every asset must be redistributable in raw form**. A license that permits "use in a game" but forbids redistributing source files isn't enough.

| Class | Status | Rules |
|---|---|---|
| **CC0 / public domain** (Poly Haven, ambientCG, Kenney, most Quaternius packs (check each), MPFB2 assets and outputs, CC0-filtered Freesound and OpenGameArt) | ✅ Preferred | Record the source anyway |
| **CC-BY 4.0 / 3.0** | ✅ Allowed | Author, source URL, license, and **"changes made"** go in the asset manifest. `CREDITS.md` and the in-game credits screen are **generated automatically** from the manifest |
| **CC-BY-SA 4.0** | ⚠️ Case by case | Modified versions must stay BY-SA, so keep these assets isolated (don't bake them into shared atlases). Avoid unless the asset is unique |
| **MIT / Apache-2.0 / BSD** | ✅ For code and shaders | Keep notices (e.g. web-ocean's MIT notice in `LICENSE`) |
| **Own work** (Blender scripts, procedural meshes, hand edits) | ✅ | Recommend **code under MIT, original assets under CC0** (simplest for an open project; CC-BY 4.0 if attribution matters to you) |
| **AI-generated assets** | ✅ **Only** from models whose license puts no restrictions on output use or redistribution: **FLUX.2 [klein] 4B (Apache-2.0)**, **TripoSR (MIT)**, **TRELLIS.2 (MIT)**, **BiRefNet (MIT)**, **Kokoro (Apache-2.0)**. TRELLIS.2 also needs **Meta's DINOv3** weights (a custom, non-OSI license), so review and log it | Release them as **CC0**. Purely AI-generated material may not be copyrightable in the US anyway. Log model, version, prompt, and seed in provenance. Note AI use in the README for transparency |
| ❌ **Forbidden** | NC (non-commercial) or ND (no-derivatives) licenses, "free for personal use", store/marketplace licenses that forbid redistributing source files (e.g. Mixamo downloads, Unity/Unreal store assets, sound bundles whose terms forbid standalone redistribution), restricted model outputs (**Hunyuan3D**, with its territory limits; **Stability** community-licensed models; **RMBG-2.0**, CC BY-NC; NC music models) | The CI license gate rejects them |
| ⚠️ **CMU Motion Capture Database** | Caution | Free to use, but its terms bar reselling the data, even converted. The game isn't sold, but the repo makes the data freely extractable. Prefer **CC0 animation sets**, procedural or IK animation, and agent-keyframed clips. Use CMU only with its notice included, after reviewing the terms |

**Enforcement:** `tools/check-licenses.ts` fails CI if any file in the assets repo lacks a manifest entry with an allowed license. The same manifest produces `CREDITS.md`, `assets/LICENSES/`, and the in-game credits.

---

## 8. Asset pipeline: Apple Silicon Mac → web delivery

### 8.1 Sourcing order (unchanged in spirit, retargeted to glTF)

1. **CC0 libraries:** Poly Haven, ambientCG, Kenney, Quaternius.
2. **Procedural Blender 5.1** scripted by agents: terrain meshes, camp structures, hulls, rocks, vegetation.
3. **Local AI on the Mac** for props and relics.
4. **MPFB2 + Rigify** for humans and animals, with CC0 or keyframed animation.
5. **Kokoro TTS via `mlx-audio`** and CC0 SFX for audio.

### 8.2 The pipeline

```
 spec.yaml (id, real-world size, tri budget, texture tier, LODs, close-up?, license)
   │
 1. mflux + FLUX.2 [klein] 4B (Apache-2.0)        → reference image          [Mac, MLX]
 2. BiRefNet (MIT) via rembg                        → RGBA cutout   (never RMBG-2.0)
 3. TripoSR (MIT) draft  |  TRELLIS.2 (MIT) via trellis-mac (24 GB+)  → raw GLB   [MPS/Metal]
 4. blender -b -P tools/cleanup.py   → scale, pivot, remesh/decimate, UVs, bake normal/AO,
                                       LOD0/1/2, collision proxy, export glTF
 5. gltf-transform (MIT) script:     dedup · weld · prune · resample anims · quantize ·
                                     meshopt compression · KTX2/Basis (UASTC for normals &
                                     hero, ETC1S for albedo/background) · resize to tier ·
                                     inspect → fail if over budget
 6. license/provenance manifest entry  → CREDITS.md generation
 7. Playwright: load into a review scene → turntable + gameplay-camera screenshots
 8. Critic agent review → human approve → commit to leeward-assets, tag release
```

- **gltf-transform** (CLI and Node API, v4) supports meshopt geometry compression and KTX2 (UASTC and ETC1S) through its CLI, with textures encoded via KTX-Software. Three.js decodes with `MeshoptDecoder` and `KTX2Loader` (Basis transcoder in WASM). **Prefer meshopt over Draco:** faster decode, it covers animations and morph targets, and it's well supported in Three.js. Draco (Apache-2.0) is fine for static hero meshes if smaller.
- **Agents drive everything** from `package.json` scripts: `npm run asset:gen <spec>`, `asset:cleanup`, `asset:pack`, `asset:check`.

### 8.3 Web asset budgets

| Asset class | LOD0 triangles | Textures (KTX2) | Notes |
|---|---|---|---|
| Small prop / relic | 1–5k | 512–1K | Hero relics on the shelf: up to 15k and a 2K UASTC normal |
| Medium prop / structure | 5–20k | 1K | 3 LODs (100% / 40% / 12%) |
| Hulls, wrecks (hero) | 20–60k | 2K (UASTC normal, ETC1S albedo) | Modular, instanced parts |
| Characters (MPFB2) | 15–30k | 2K body + 1K clothes | 1 skeleton. Animation clips shared and resampled |
| Vegetation | 0.5–5k per instance | Atlased 1–2K | Instanced or `BatchedMesh`. Impostors beyond about 150 m |
| Terrain per island | Heightmap mesh, chunked, 4 LODs | Splat maps 2K + 4–6 tiling CC0 materials | |

| Download budget (compressed, over the wire) | Target |
|---|---|
| App shell (HTML/JS/WASM/WGSL) | **≤ 5 MB** |
| Ocean lite bake (needed for WebGL2 or the low tier) | ≤ 10 MB (loaded only when needed) |
| **First playable beach** (shell + character + beach pack + core audio) | **≤ 20 MB** |
| Each island pack (terrain, foliage, props, ambience) | **≤ 40–60 MB**, chunked into files ≤ 20 MB (jsDelivr's default per-file limit) |
| Whole castaway chapter (6 islands + Harborlight) | **≤ 350 MB** |
| Hosted asset footprint per release | **≤ 700 MB**, which keeps the assets portable (fits GitHub Pages' 1 GB cap if ever needed) |
| Runtime GPU memory | Per tier, §4.1 |

Audio: Opus or AAC at modest bitrates, with ambience loops of 30–60 s. Check Safari codec support during Phase 0.

### 8.4 Mac generation capability

See Appendix C for the memory tiers (16 / 24–32 / 64 GB+) and the free cloud-GPU fallback. The short version: **16 GB** runs FLUX.2 [klein] 4-bit and TripoSR. **24–32 GB** adds TRELLIS.2 at the 512 setting (about 3–5 min per asset on an M4 Pro 24 GB). **64 GB+** handles TRELLIS.2 at 1024.

### 8.5 Honest limits

Browser download and memory budgets cap fidelity below the desktop plans. Open models need cleanup. Characters and animation will be the weakest element. Mitigations:
- **Art direction:** grounded stylized realism, with the ocean, sky, and light as the hero visuals.
- **Camera:** a pulled-back click-to-act camera.
- **Memory flashes:** audio-led.
- **Consistency:** strict master materials keep the look coherent.

---

## 9. Hosting, delivery, and what "scale" means

### 9.1 Topology

```
 Player browser ──► https://play.<your-domain>/  (or https://leeward.vercel.app/)
       │            Vercel Hobby: static app shell (≤ 5 MB), manifest.json, service worker.
       │            No functions, no server code.
       ├──► https://cdn.jsdelivr.net/gh/<user>/leeward-assets@v0.4.0/...   island packs
       │        (immutable per tag, CORS, files ≤ 20 MB by default, no bandwidth limits)
       └──► fallback: https://leeward-assets.pages.dev/v0.4.0/...          Cloudflare Pages
                (free, unlimited static bandwidth, ≤ 25 MiB per file, ≤ 20,000 files)
 Service worker: precache shell; cache-first for versioned asset URLs; "download island for offline"
```

- **Vercel serves only the shell.**
  - Vite's hashed bundles get `Cache-Control: public, max-age=31536000, immutable` via `vercel.json` `headers`. Each header rule counts toward the 2,048 routes-per-deployment limit, which is no issue.
  - `index.html`, the manifest and the service worker get `no-cache` so updates roll out.
  - No Vercel Functions, Edge Middleware, Image Optimization or Analytics are used, so those Hobby quotas stay at zero.
- **Island packs never go through Vercel.** They're served from jsDelivr, or Cloudflare Pages as mirror. An **asset manifest** (hashes, sizes, URLs) ships with each app release. The loader tries base URLs in order (jsDelivr → Cloudflare) and verifies hashes. Don't proxy assets through Vercel rewrites: that would count against Vercel's transfer quotas and its 120 s proxy timeout.
- **GitHub Releases:** use for a downloadable **full offline zip** (and later Tauri builds), not for in-browser streaming. Release downloads aren't designed as a CDN for runtime fetches.
- **Don't use Git LFS for runtime assets.** jsDelivr and Cloudflare serve what's committed, and LFS has small free quotas. Keep raw AI generations **out of git**: archive them locally and commit only optimized, size-checked files.

### 9.2 Free-host limits (verified 17 Oct 2026)

| Host | Limits | Terms notes |
|---|---|---|
| **Vercel Hobby (app host)** | **Included per month:** **100 GB Fast Data Transfer**, **10 GB Fast Origin Transfer**, **1,000,000 CDN requests**, 1,000,000 function invocations, 4 h Active CPU, 360 GB-h provisioned memory (functions unused here).<br>**Deploys:** 100 deployments/day, 1 concurrent build, 45-min build limit, build machine with 2 vCPU / 8 GB.<br>**Files:** **100 MB source upload when deploying via CLI**, 15,000 source files per CLI deploy. No stated per-file or total cap on build output (only the 45-min build limit).<br>**Other:** 200 projects. Functions (if ever used) up to 300 s, 2 GB, 250 MB bundle. Edge middleware averages ≤ 50 ms CPU | **Non-commercial personal use only.** Ads, payments, selling, or being paid to build or host the site count as commercial. **Donations are explicitly allowed.** If you exceed a Hobby limit, that feature is generally **paused until 30 days have passed**, so a traffic spike can take the game offline rather than produce a bill. Hobby projects can't connect to repos owned by a GitHub *organization*; `andrewgarrison/leeward` is a personal repo, so it's fine. Runtime logs are kept 1 h |
| **jsDelivr (GitHub proxy, island packs)** | **20 MB per file by default** (raisable on request for legitimate projects). Package and directory listings limited to about 50 MB for GitHub (individual file URLs work regardless of repo size). **No bandwidth or request limits** | Free for personal and commercial use. **Not for general-purpose file or media hosting.** An open-source game's own versioned assets is a legitimate project use, but **open a courtesy issue with jsDelivr before launch** to confirm. Content must comply with GitHub's policies. Previously served immutable files may be kept permanently |
| **Cloudflare Pages (free; asset mirror, and alternative app host)** | **20,000 files per site, 25 MiB per file, unlimited static requests and bandwidth** | A proprietary free service that needs a free account. The best fallback for the shell too |
| **GitHub Pages (free alternative app host)** | Published site **≤ 1 GB**. Source repo recommended ≤ 1 GB. **100 GB/month soft bandwidth**. 10-min deploy timeout. Soft 10 builds/hour (not for custom Actions workflows). 100 MB per file | Not for commercial or e-commerce sites. Over the limits, GitHub may rate-limit (429) or ask you to use a CDN. Soft limits (throttling or an email) are gentler than Vercel Hobby's pause |

### 9.3 Why hundreds of thousands of players is fine

- There are **no servers and no per-player compute or storage**. Saves live on players' devices, and every request is a static file served from a global CDN.
- **Vercel Hobby math (shell only):**
  - **Transfer:** 100 GB ÷ 5 MB ≈ **20,000 first-time loads a month**.
  - **Requests:** a Vite build with about 30–50 files per first load (JS chunks, WGSL, WASM, icons, manifest) gives 1,000,000 ÷ ~50 ≈ **20,000 first loads**. With a lazily split build, only modestly more.
  - Returning players are nearly free, because the service worker serves the cached shell and only checks `index.html` and the service worker for updates (a few small requests per visit). So the binding limit is about **20k new players a month**, plus however many update checks the remaining requests allow.
  - **If the shell plus first beach (≈ 20 MB) were all served by Vercel**, transfer would cap at about **5,000 new players a month**. That's why the beach pack lives on jsDelivr too.
- **Assets via jsDelivr or Cloudflare:** 300,000 players × up to 350 MB ≈ **105 TB** over the game's life. Both are unmetered for this use, though "unlimited" depends on staying within their terms.
- **What happens at a spike:** going over a Hobby quota **pauses** it, possibly for the rest of the 30-day window. Mitigation:
  1. Watch the usage dashboard.
  2. Keep a ready-to-go **Cloudflare Pages (unlimited bandwidth) or GitHub Pages deploy of the same build**, produced by the same CI.
  3. **Because the origin is a custom domain**, repoint DNS to the fallback in minutes. Players keep their saves because the origin hasn't changed.

  With a bare `*.vercel.app` origin this failover is impossible without stranding saves. **If launch traffic is expected to be large, consider making Cloudflare Pages the primary app host from day one.**
- **Remaining limits, honestly:**
  - The free hosts' terms and goodwill.
  - Vercel Hobby's hard pause, and its non-commercial clause (fine while the game is free and ad-free; donations OK).
  - jsDelivr's per-file cap, handled by chunking.
  - **Your support load** (bug reports, lost saves).
- **Origin permanence (important):** browser saves (IndexedDB), the service worker, `persist()` grants and PWA installs are all bound to the **exact origin** (scheme + host + port).
  - Pick **one** production origin before the first public build and never change it. Either a custom domain such as `play.<your-domain>` (recommended, because DNS can move between Vercel, Cloudflare and GitHub Pages) or a fixed `<project>.vercel.app` name.
  - Don't rename the Vercel project once it's public, because the default `vercel.app` name follows the project name.
  - **Preview deployment URLs are different origins.** Their saves are separate from production's, which is good for testing. Never send players to a preview URL.
  - If the origin ever must change, ship an export/import migration banner on the old origin first.

---

## 10. Agent-friendly workflow, testing, and CI/CD

### 10.1 Everything is text

TypeScript, WGSL (`.wgsl`), YAML data and JSON Schemas, Blender Python, gltf-transform scripts, and Playwright tests all live in git. Agents edit any of them, and `npm run` scripts are the stable interface: `dev`, `test`, `test:e2e`, `shots`, `asset:*`, `balance`, `build`, `check:licenses`, `check:budgets`.

- **Agent browser control:** a Playwright MCP server (or plain Playwright scripts) lets agents load the game, play scripted scenarios, take screenshots, and read console logs. This continues the repo's existing `/__shot` + critic-subagent practice (`server.mjs`, README "How it was made").
- **Asset tools:** Blender headless, mflux, TripoSR, trellis-mac, and gltf-transform are all CLI-driven on the Mac.

### 10.2 Tests

| Layer | Tool | Coverage |
|---|---|---|
| Unit | **Vitest** | `src/core` (XP, jobs, crossings, offline clock and cap), save migrations against golden fixtures, data schema validation |
| Simulation | Node balance simulator | 10k simulated players. Pacing to Harborlight |
| E2E | **Playwright** (Chromium, plus WebKit and Firefox for UI and saves) | Boot, new game, save and reload, **export/import round trip**, multi-tab lock, offline service worker, `forceWebGL` fallback path, touch emulation |
| **Visual** | Playwright screenshots in **deterministic render mode** (`?test=1&seed=…&t=…&cam=…`, extending the repo's existing URL parameters) | Ocean goldens (front, side, high, matching `docs/*.jpg`), each island at fixed times of day, the lite ocean. Compare with tolerance. Critic agent reviews diffs |
| Performance | Local Mac script (real Metal GPU) reading `timestamp-query` GPU times and `renderer.info` | Per-tier frame-time and draw-call budgets |
| Budgets | Custom checks | Bundle ≤ 5 MB, pack sizes, per-file ≤ 20 MB, triangle and texture budgets from the manifest |

**WebGPU in CI:** GitHub-hosted runners have no GPU. Run Chromium (full browser, not headless shell) with **SwiftShader WebGPU** flags under **Xvfb**: headless WebGPU screenshots can come out black. Keep **separate goldens** for SwiftShader (CI) and for the real GPU (captured on the Mac).

### 10.3 CI/CD (GitHub Actions, free for public repos)

1. **On every PR:** typecheck, lint, Vitest, schema checks, license gate, budget checks, Playwright e2e plus SwiftShader screenshots.
2. **Deploy to Vercel.** Two options. Start with A.
   - **A. Vercel Git integration (recommended).**
     - Connect `andrewgarrison/leeward` to a Vercel Hobby project (framework preset: Vite, output: `dist`).
     - Every PR or branch push gets a **preview deployment** with its URL posted on the PR. Playtesters and critic agents can try each change, and Playwright can also run against the preview URL.
     - Merging to `main` deploys **production**. Turn on **GitHub branch protection** requiring the CI checks above before merge, so production only ever builds from green commits.
     - Hobby previews may sit behind Vercel Authentication (Deployment Protection) by default. Use shareable links or relax it for previews.
   - **B. GitHub Actions + Vercel CLI**, if you want deploys strictly gated inside one workflow:
     - Run `vercel pull --yes --environment=<preview|production>`, `vercel build [--prod]`, then `vercel deploy --prebuilt [--prod]` with `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as repo secrets.
     - The PR job deploys a preview and comments its URL. The `main` job deploys production.
     - CLI deploys are capped at a 100 MB upload on Hobby (the ≤ 5 MB shell is far under).
   - Either way, stay under **100 deployments a day** (1 concurrent build on Hobby). Also deploy the same `dist/` to **Cloudflare Pages or GitHub Pages** as the warm standby (§9.3).
3. **On tagging `leeward-assets`:** validate and pack, then the new jsDelivr tag URL is immutable. Optionally deploy the mirror to Cloudflare Pages. Bump the asset manifest in `leeward`. Assets never deploy to Vercel.
4. **Releases:** attach an offline zip to GitHub Releases.

---

## 11. Phased roadmap

Durations assume one developer plus agents and are indicative only.

### Phase 0: Foundations and spikes (3–4 weeks)
- Vite + TypeScript + Three.js (pinned) scaffold. CI on GitHub Actions. Vercel Git integration (preview per PR, production from `main`), plus a standby deploy to Cloudflare or GitHub Pages.
- **Ocean port:** sim compute via `wgslFn`/`StorageTexture` (Option A), or a shared-device raw pipeline (Option B). Ocean NodeMaterial. Match the goldens.
- **Quality tiers and GPU timer HUD.** Measure on the Mac (Chrome and Safari), an iPad (Safari 26), and any x86 laptop. Target: Medium tier ≤ 16.6 ms on an M1-class laptop at 1080p.
- **Ocean lite:** bake the looping FFT to KTX2 and verify on `forceWebGL` and on a Steam Deck or Linux machine if available.
- **Saves:** IndexedDB + export/import + persist() + Web Locks prototype. Golden-save fixture.
- **Assets:** 10 relics through §8.2 into a tagged `leeward-assets`, served via jsDelivr, within budgets.
- **Decide the final origin:** a custom domain on Vercel (recommended) or a fixed `<project>.vercel.app`.

### Phase 1: Build 1 "Morning" playable in the browser (2–4 months)
- Shoreline and surf, an MPFB2 castaway (GLB, CC0 or keyframed animations), walk and interact, water, fire, lean-to, sleep, day/night.
- Saves with backups. **The fire is still burning after you return** (capped clock).
- PWA install and offline. Credits screen generated from the manifest.

### Phase 2: Builds 2–4, alpha (6–12 months)
- Data-driven trades, hunger and thirst, jobs that change the camp.
- **Raft and crossings:** Rapier buoyancy, the scripted surf flip, cargo loss.
- **First Light as streamed packs:** lagoon, cliffs, jungle, lookout, waterfall cave. The relic shelf and audio-led memory flashes.
- Balance simulator in CI. Playtests via shared links (seed URLs).

### Phase 3: Public release of "First Light", then Build 5 (6–9 months)
- Announce. Courtesy issue to jsDelivr. Cloudflare mirror live.
- Per-island offline download. Tallyrock and Ember Isle. Moving your home island.
- Accessibility, localization (DOM UI), iPad polish.

### Phase 4: Build 6 and Fogbound islands
- Storm Wall, Harborlight, reunion. New islands as new asset tags.
- Optional cloud sync (§6.4). Optional desktop wrap (Appendix B).

---

## 12. What to keep and reuse from the current repo

| Repo item | Fate |
|---|---|
| `js/wgsl/sim.js`, `ocean.js`, `sky.js`, `common.js` | **Core of the new client.** Moved to `src/ocean/*.wgsl` and `src/sky/*.wgsl`, wrapped into Three.js compute and material nodes (§3.3) |
| `js/wgsl/post.js` | Replaced by Three's post-processing (bloom + AgX). Keep as reference |
| `js/wgsl/objects.js` (`OBJECTS`, `BOAT_PROBE`) | The probe idea is reused for buoyancy sampling. The object shading is replaced by Three materials |
| `js/boat.js` | Ported to TS (`src/sailing/`). `buildSailboat` becomes the template for procedural Blender hulls |
| `js/main.js` | Mined for device setup, settings defaults, `CASC_L`, the URL-parameter test hooks, and GPU timing, then retired |
| `index.html` HUD and settings panel | Becomes the DOM UI overlay and debug panel |
| `build.mjs`, `ocean.html`, `ocean.min.html` | **Replaced by Vite.** Keep `ocean.html` as a standalone "ocean demo" page if wanted. **Known bug:** `build.mjs` leaves `js/boat.js` out of the minified bundle (`ocean.min.html` calls an undefined `buildSailboat()`) |
| `server.mjs` (`/__shot`, `/__log`) | Superseded by the Vite dev server plus Playwright screenshots. The critic workflow carries over |
| `docs/front.jpg`, `side.jpg`, `high.jpg` | Golden visual targets |
| `docs/story`, `docs/brainstorms` | The design bible. Source for `data/*.yaml` |
| `LICENSE` (MIT, web-ocean attribution) | Kept. Add `CREDITS.md` (generated) and an assets license notice |

---

## 13. Key risks

1. **Two render paths, because WebGPU isn't universal.** Steam Deck (AMD on Linux), most Linux setups, and Firefox on Linux and Android need WebGL2. *Mitigation:* Three's automatic fallback plus the baked ocean lite, tested in CI with `forceWebGL`.
2. **Performance on mid-range laptops and iPads.** The repo's ocean costs 6–8 ms on a high-end GPU at 1440p, and WebGPURenderer adds CPU overhead per mesh. *Mitigation:* quality tiers, fewer and smaller cascades, env-map throttling, instancing and `BatchedMesh`, dynamic resolution, and budgets enforced in CI.
3. **Three.js WebGPURenderer maturity and API churn.** It's officially still experimental, with monthly releases. *Mitigation:* pin versions, gate upgrades on screenshot tests, and keep raw-WebGPU Option B for the ocean.
4. **Browser save loss.** Eviction, "clear site data", Safari's 7-day rule outside a PWA, PWA/Safari storage isolation, private browsing, and origin changes. *Mitigation:* persist(), PWA install, backups, prominent export/import, and fixing the origin early.
5. **Dependence on free hosts' goodwill.** Vercel Hobby **pauses** on overage (up to 30 days) and is non-commercial only. Also jsDelivr and Cloudflare terms. *Mitigation:* Vercel serves only the ≤ 5 MB shell; service-worker caching; a custom-domain origin with a warm Cloudflare or GitHub Pages standby for DNS failover; assets on jsDelivr/Cloudflare; a courtesy issue to jsDelivr; no ads or paid features, to stay non-commercial.
6. **Asset licensing in a public repo.** One NC asset or restricted model output is a takedown risk. *Mitigation:* the CI license gate and provenance manifest.
7. **Fidelity vs. download size.** Browser budgets force lower fidelity than desktop. *Mitigation:* art direction, camera, and streaming per island.
8. **Single-Mac development.** *Mitigation:* Playwright across Chromium, WebKit, and Firefox, plus iPad, Windows, Android, and Deck playtesters via shared links.

---

## 14. Open questions that would change the plan

| Question | Why it matters |
|---|---|
| **Final URL / origin:** custom domain on Vercel (about $10/yr) or a fixed `<project>.vercel.app`? | Saves are origin-bound. Changing later strands players' saves. Only a custom domain allows failover to another free host without losing saves |
| **Which devices matter most?** (Desktop only? iPad? Phones? Steam Deck?) | Sets the Medium/iPad budgets and how much effort goes into touch and the lite path |
| **Is the WebGL2 "ocean lite" acceptable**, or should non-WebGPU browsers just see "use Chrome/Safari 26"? | Dropping the fallback saves real effort but excludes the Steam Deck and Linux by default |
| **Mac chip and unified memory** | Decides whether TRELLIS.2 is in the pipeline (24 GB+) |
| **License for original assets:** CC0 or CC-BY 4.0? Allow CC-BY-SA inputs? | Changes the credits and isolation rules |
| **Cloud sync ever wanted?** | If yes, prototype remoteStorage or PocketBase in Phase 4. If no, invest more in export/import UX |
| **Any analytics?** | The default is none (privacy, no services). Opt-in local logs attached to GitHub issues |
| **Desktop wrap later?** | See Appendix B. Tauri doesn't fix Linux WebGPU (WebKitGTK), but Electron could |

---

## 15. Costs

**$0 in services.** Vercel Hobby, GitHub Actions (public repo), jsDelivr, Cloudflare Pages, and GitHub Pages (alternative) are all free. Vercel Hobby stays free only while the game is non-commercial: no ads or payments; donations are allowed. All libraries and models in this plan are open source or permissively licensed. What remains: the **Mac you already own**, electricity, your time, and optionally a domain (about $10/yr). Free proprietary services are still involved (Vercel, GitHub, jsDelivr, Cloudflare, Apple's browser and OS), but nothing is paid.

---

## Appendix A: Godot desktop plan (rev. 2–3) vs. this browser plan

| | Godot 4.7 desktop (previous plan) | Browser / WebGPU (this plan) |
|---|---|---|
| Reach | Download and install (itch.io, GitHub Releases, optionally Steam) | **A link.** Zero install. PWA install optional |
| Fidelity ceiling | Higher (native GPU, bigger downloads, editor tooling, SDFGI/VoxelGI) | Lower (download and memory budgets, WebGL2 path) |
| Ocean | Port WGSL → Godot GLSL compute | **Reuse the WGSL nearly verbatim** |
| Tooling | Full editor (terrain, foliage, animation) | No editor: Blender acts as the level and asset editor, plus code and data |
| Agent-friendliness | Very good (text `.tscn`, MCP servers) | **Excellent** (all TS/JSON/WGSL, Playwright) |
| Saves | Local files plus Steam Cloud | IndexedDB, export/import, PWA (eviction risks) |
| Steam Deck | Native Linux Vulkan, full quality | WebGL2 lite unless the user enables Chrome flags |
| Distribution cost | $0 on itch.io (Steam $100, Apple $99/yr optional) | **$0** |

If the project later outgrows the browser (fidelity, Deck quality), the TypeScript simulation core, data files, assets (glTF), and WGSL ocean all carry over to Godot or a desktop wrap.

## Appendix B: Optional desktop wrap later

- **Tauri** (MIT/Apache-2.0) wraps the same web build in the OS webview, giving small binaries:
  - **Windows:** WebView2 (Chromium), so WebGPU works.
  - **macOS:** WKWebView, so WebGPU works on macOS 26+ (Safari 26 engine).
  - **Linux:** **WebKitGTK has no WebGPU support and none is planned**, so it falls back to WebGL2 lite. Tauri doesn't fix the Steam Deck.
- **Electron** (MIT) bundles Chromium. Binaries are much larger, but the app can turn on Chromium's WebGPU flags itself, which could enable full quality on the Deck. Test this before relying on it.
- Distribute free via itch.io and GitHub Releases. Unsigned binaries trigger Windows SmartScreen and macOS Gatekeeper warnings, since there's no paid signing.

## Appendix C: Mac generation capability and free cloud fallback (from rev. 3)

Unified-memory tiers. Figures come from project READMEs and community reports, not measurements on the user's Mac.

| Workload | 16 GB Mac | 24–32 GB Mac | 64 GB+ Mac |
|---|---|---|---|
| Browser dev (Vite + Chrome/Safari) and Blender 5.1 (Cycles on Metal) | ✅ (close generators while editing) | ✅ | ✅ everything at once |
| **FLUX.2 [klein] 4B via mflux** (Apache-2.0) | ✅ **4-bit** (~4.3 GB download, "runs on a 12 GB Mac"). 1024² peaks around **14 GB without VAE tiling, ~6–7 GB with it**. About 11 s for 512² on an M3 Pro 18 GB | ✅ 4-bit. **bf16 needs ~32 GB** | ✅ bf16. About 21 s of inference at 1024² on an M1 Max 64 GB |
| FLUX.1 [schnell] (12B, Apache-2.0) via mflux | ⚠️ 4-bit build, "16 GB Mac" (tight) | ✅ | ✅ |
| **TripoSR** (MIT) | ✅ 8 GB minimum, 16 GB recommended. **About 34 s per asset on an M4 Max**, under a minute on an M1 Pro. Official code needs CPU marching cubes, and some ops don't run on MPS, so expect setup friction | ✅ | ✅ |
| **TRELLIS.2** (MIT) via **trellis-mac** (PyTorch MPS + Metal) | ❌ ("24 GB+ recommended") | ✅ **512 pipeline: ~5 min 13 s cold, ~3 min 20 s warm per asset on an M4 Pro 24 GB.** About 15 GB of disk for weights | ✅ 1024 / 1024-cascade quality. The `trellis2-mlx` port was validated on 128 GB. An official MPS pull request (#175) is still open |
| TripoSG (MIT) | Unverified on Mac. Reportedly bundled in a third-party Mac app (3D Mate), so treat it as an experiment | Experiment | Experiment |
| Stable Fast 3D / SPAR3D | ⚠️ MPS is experimental, and Stability recommends the **CPU** path under 32 GB. Stability Community License (free only under $1M revenue). **Not recommended** | ⚠️ | ⚠️ |
| InstantMesh (Apache-2.0) | ❌ CUDA-oriented stack, no maintained Mac path found | ❌ | ❌ |
| Hunyuan3D 2mini / 2.1 (restricted license, §7; excluded) | ⚠️ 2mini shape-only via MPS (community reports ~60 s on an M2 24 GB) | ⚠️ 2.1 shape plus texture via a community port: **5.7 min shape plus 8.5 min texture on an M4 Pro 24 GB**, with swapping | ⚠️ More headroom. Still license-restricted |
| UniRig / Puppeteer (auto-rig) | ❌ CUDA-only dependencies (flash-attn, spconv) | ❌ | ❌ |
| Kokoro TTS via `mlx-audio` | ✅ | ✅ | ✅ |


**Free cloud GPU fallback.** Use it for CUDA-only tools (UniRig, Puppeteer) or when the Mac is too small for TRELLIS.2.

| Service | Free quota (Oct 2026) | GPU | Fits | Terms note |
|---|---|---|---|---|
| **Kaggle Notebooks** | **30 GPU-hours/week** (resets weekly; can vary with demand) | **T4 ×2 (16 GB each)**. P100 is being retired | UniRig, Puppeteer, TripoSR, Hunyuan3D-2mini, FLUX. **TRELLIS.2 at 24 GB doesn't fit one T4** | Kaggle's terms say you keep ownership of your outputs. Output storage up to 20 GB in `/kaggle/working` |
| **Google Colab (free)** | **No published GPU quota.** Access is heavily restricted, sessions run up to 12 h, availability varies | Usually a T4 when available | Same class as Kaggle | Proprietary. Usage limits and allowed activities can change without notice |
| **Hugging Face ZeroGPU** | **5 min of GPU per day** on a free account (2 min unauthenticated) | Shared high-end GPU slices | Trying public demo Spaces (for example TRELLIS.2 demos) | **Demo Spaces often bundle RMBG-2.0 or other NC components.** Outputs follow each model's and Space's license, so it's evaluation only |


*Hunyuan3D and Stability models appear above for completeness only. They're excluded by §7.*

---

## Sources

**Repository (read-only):** `README.md`, `docs/story/2026-10-17-leeward-story-outline.md`, `docs/brainstorms/2026-10-17-leeward-game-brainstorm.md`, `package.json`, `build.mjs`, `server.mjs`, `index.html`, `js/main.js`, `js/boat.js`, `js/wgsl/{common,sim,sky,ocean,post,objects}.js`, `docs/{front,side,high}.jpg`, `LICENSE`, git log (5 commits, 2026-10-17).

**External (checked 17 Oct 2026):**
- **Three.js:**
  - r186 release notes; the WebGPURenderer manual ("still experimental", automatic WebGL2 fallback);
  - TSL docs (`wgslFn`, `StorageTexture`, `renderer.compute`, compute-shader examples);
  - the r183 rename of PostProcessing to RenderPipeline;
  - community demos of WGSL compute sharing the renderer's device;
  - forum reports on WebGPURenderer CPU overhead with many meshes;
  - the WebGL2-backend compute limits.
- **Other frameworks:** Babylon.js 9 docs (WebGPU, WGSL ShaderMaterial and ComputeShader, Apache-2.0); the PlayCanvas Editor open-source announcement (frontend MIT, July 2025; backend hosted).
- **WebGPU availability:**
  - the Chrome 144 release notes (Linux: Intel Gen12+ by default);
  - the MDN/caniuse WebGPU tables;
  - WebKit's Safari 26 release notes (WebGPU on macOS/iOS/iPadOS/visionOS 26);
  - the Firefox WebGPU status page (Windows, then Apple Silicon macOS; Linux and Android pending);
  - web3dsurvey.com statistics.
- **Hosting:**
  - GitHub Docs "GitHub Pages limits" (1 GB site, 100 GB/month soft bandwidth, 10 builds/h, 10-min deploy timeout, 429s, CDN/Releases advice) and "About GitHub Pages" (no commercial/e-commerce use);
  - GitHub's 100 MB file limit;
  - jsDelivr terms (effective 2026-10-05) and FAQ/limits (20 MB per GitHub file by default, package listing limits, no bandwidth limits, no general file/media hosting);
  - Cloudflare Pages limits (20,000 files, 25 MiB per asset; unlimited static bandwidth on free);
  - Vercel docs, checked 17 Oct 2026:
    - "Hobby plan" (included usage: 100 GB Fast Data Transfer, 10 GB Fast Origin Transfer, 1M CDN requests, 1M function invocations; features paused until 30 days have passed when exceeded);
    - "Limits" (100 deployments/day, 45-min builds, 100 MB CLI static file upload on Hobby, 15,000 files, 2,048 routes, 1 concurrent build, no org-owned repos on Hobby);
    - "Fair Use Guidelines" (non-commercial personal use only, donations allowed, edge middleware 50 ms CPU);
    - "Functions limitations" (300 s, 2 GB, 250 MB);
    - the Git integration, preview deployments, and `vercel deploy --prebuilt` docs;
  - `actions/deploy-pages` (GitHub Pages alternative).
- **Storage:**
  - WebKit "Updates to Storage Policy" (Safari 17: Storage API, persist() heuristics, Home Screen web apps);
  - WebKit "Full Third-Party Cookie Blocking and More" (7-day cap on script-writable storage; Home Screen app exemption and isolation);
  - Safari 26 / iOS 26 notes (added sites open as web apps by default);
  - MDN Storage quotas and eviction criteria, `StorageManager.persist()`, Web Locks API, `CompressionStream`;
  - vite-plugin-pwa / Workbox docs.
- **Libraries:** Rapier (`@dimforge/rapier3d` 0.21.0, Apache-2.0); gltf-transform v4 docs (meshopt, KTX2 UASTC/ETC1S via KTX-Software); Three.js `MeshoptDecoder` and `KTX2Loader`; Howler.js (MIT); miniplex (license to confirm on adoption); remoteStorage; PocketBase (MIT).
- **Testing:** Playwright docs (projects, screenshots, MCP server); community guides on running WebGPU in headless Chrome or CI with SwiftShader/Vulkan flags under Xvfb; Vitest.
- **Licensing:**
  - Creative Commons CC-BY 4.0 attribution guidance and the BY-SA→GPLv3 compatibility listing;
  - US Copyright Office AI guidance (Part 2, 2025);
  - the CMU Graphics Lab Motion Capture Database terms;
  - the BRIA RMBG-2.0 (CC BY-NC) and BiRefNet (MIT) model cards;
  - the Tencent Hunyuan3D community license;
  - the Stability AI Community License;
  - FLUX.2 [klein] 4B (Apache-2.0);
  - the TripoSR and TRELLIS.2 (MIT) READMEs and TRELLIS.2 issue #22 (DINOv3 dependency).
- **Desktop wrap:** Tauri webview docs (WebView2, WKWebView, WebKitGTK); WebKitGTK WebGPU status; Electron command-line switches.
- **Apple Silicon pipeline (carried from rev. 3):** the shivampkumar/trellis-mac README, microsoft/TRELLIS.2 PR #175, mflux README and issue #407, TripoSR Mac reports, mlx-audio Kokoro, Kaggle, Colab, and HF ZeroGPU docs.

*Performance and memory figures from third parties, and every "target" number in this document, are planning budgets, not measurements. Validate the load-bearing ones in Phase 0: ocean cost on an M1-class laptop and an iPad, the Three.js port path (Option A vs B), jsDelivr's acceptance of game assets, and SwiftShader screenshot stability in CI.*
