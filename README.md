# StackScope

> Understand any GitHub repository in minutes, not days.

StackScope is a developer productivity tool. Paste a public GitHub URL, and it
clones the repository into a sandboxed temporary directory, scans the working
tree, and hands back a clean, interactive map of the project — folders, files,
primary language, and a language breakdown.

This is not an AI chatbot. It is a repository navigation aid.

---

## Current scope (Phase 7)

Phase 7 adds **change-impact analysis** — pick a file and see its blast radius
(transitive dependents / dependencies), with optional AI explanation of that
impact. This reframes StackScope from a dependency visualizer into a
change-impact tool.

- Paste a `https://github.com/<owner>/<repo>` URL.
- Backend clones (`--depth 1`), scans, parses **TypeScript, JavaScript, and
  Python** with tree-sitter, builds a directed dependency graph, and
  **persists the full analysis in SQLite** (keyed by UUID, with TTL + LRU).
- JS/TS **path aliases** (`@/*`, etc.) are expanded via `compilerOptions.paths`
  + `baseUrl` (JSONC-tolerant; one-level `extends` supported). Bare packages
  like `react` stay external.
- Python imports resolve by module path (`a.b.c` → `a/b/c.py` or
  `a/b/c/__init__.py`, plus relative `.` / `..` forms).
- **`GET /api/repository/:id/insights`** returns ranked most-depended-on files,
  hubs, entry points, orphans, circular *chains*, dependency depth (on the
  cycle-collapsed DAG), and folder-based module groups.
- **`GET /api/repository/:id/summary`** (opt-in) feeds those facts (+ language
  stats + a short README excerpt) to an LLM via a thin `LlmProvider` interface.
  Results are cached by `(analysisId, promptVersion)`. Without `LLM_API_KEY`,
  the endpoint returns a clean `unavailable` state and the rest of the app is
  unchanged.
- **`GET /api/repository/:id/impact/<file>`** returns downstream/upstream blast
  radius (direct vs transitive, hop distances). Opt-in AI via
  **`.../impact/<file>/explain`**, cached by `(id, filePath, promptVersion)`.
- On `/graph/:id`, selecting a file enables **Impact mode** (blast-radius
  highlight + count badge + side-panel readout). Empty state invites:
  "Select a file to see what a change would affect."
- Frontend **Architecture Insights** panel includes an optional
  **Explain this repository** control (idle / loading / result / error /
  unavailable). Deterministic insights remain the default.
- Frontend lands on a **shareable** `/graph/:id` URL with a **Copy link**
  affordance. Graph legend includes a Python color for source `.py` nodes.

**Still not included (deferred):**

- No chat, follow-ups, embeddings, or semantic code search
- No per-file AI explanations
- No deep `extends` chains, project references, or per-file tsconfig resolution
- No graph-clustering / community-detection (folder groups only)
- No job queue / BullMQ, no Redis, no Postgres (SQLite only)
- No authentication, no private repositories, no per-user history
- No namespace packages without `__init__.py`, no `sys.path` / `importlib` dynamics

---

## Prerequisites

- **Node.js** 20 or newer (tested on Node 24)
- **npm** 10 or newer
- **git** on your `PATH` — the backend shells out to the system `git` binary
  through [`simple-git`](https://github.com/steveukx/git-js). Verify with `git --version`.

---

## Install

From the repository root:

```bash
npm run install:all
```

This installs three package trees:

- `./` (the root workspace, only `concurrently`)
- `./backend`
- `./frontend`

---

## Environment variables

### Backend (`backend/.env`, all optional)

```
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
LOG_LEVEL=info

# Clone + scan budgets (Phase 1)
GIT_CLONE_TIMEOUT_MS=30000
MAX_SCAN_ENTRIES=15000
MAX_SCAN_DEPTH=20
MAX_SCAN_TIME_MS=20000

# Parsing budgets (Phase 2)
PARSE_CONCURRENCY=8
MAX_PARSE_FILE_BYTES=500000
MAX_PARSE_TIME_MS=30000

# Analysis store (Phase 4 — SQLite-backed)
ANALYSIS_TTL_MS=1800000
ANALYSIS_MAX_ENTRIES=50
ANALYSIS_DB_PATH=data/analyses.db

# Optional AI architecture overview (Phase 6)
# Leave LLM_API_KEY empty to keep AI disabled (endpoint returns unavailable).
LLM_PROVIDER=openai
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=30000
```

Defaults match the values above, so a `.env` file is only required if you want
to override them.

### Frontend (`frontend/.env`, optional)

```
VITE_API_BASE_URL=http://localhost:3001/api
```

---

## Development

Run both apps together:

```bash
npm run dev
```

Or independently:

```bash
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:5173
```

Open <http://localhost:5173>.

---

## Production build

```bash
npm run build
```

- Backend compiles TypeScript to `backend/dist/`. Run with `node backend/dist/index.js`.
- Frontend outputs static assets to `frontend/dist/`. Serve them behind any static host.

---

## API

Base URL: `http://localhost:3001/api`

### `GET /api/health`

```json
{ "ok": true }
```

### `POST /api/analyze`

Request:

```json
{ "repoUrl": "https://github.com/vercel/next.js" }
```

Success response (abbreviated):

```json
{
  "id": "0f7c...",
  "name": "next.js",
  "owner": "vercel",
  "language": "TypeScript",
  "totalFiles": 4231,
  "totalFolders": 512,
  "languages": [{ "name": "TypeScript", "fileCount": 3100, "percent": 73.2 }],
  "tree": { "name": "next.js", "path": "", "type": "folder", "children": [] },
  "analyzedAt": "2026-08-02T13:20:00.000Z",
  "dependencySummary": {
    "totalNodes": 4231,
    "totalEdges": 3120,
    "filesParsed": 3100,
    "filesSkipped": 1100,
    "filesFailed": 31,
    "circularDependencies": 4
  }
}
```

### `GET /api/repository/:id`

Returns the full stored `RepositoryAnalysis` (same shape as `POST /api/analyze`).
Used by the frontend on hard refresh and shared `/graph/:id` / `/result/:id`
links. Returns `404 NOT_FOUND` if the id is unknown or the analysis has expired.

### `GET /api/repository/:id/dependencies`

Each node carries the raw parsing output plus the visualization metadata added
in Phase 3 (`category`, `extension`, `folder`, `symbolCount`):

```json
{
  "nodes": [
    {
      "filePath": "src/index.ts",
      "language": "TypeScript",
      "languageSupported": true,
      "imports": [ ... ],
      "importedBy": [ ... ],
      "symbols":   [ ... ],
      "parseError": null,
      "skipped": false,
      "skipReason": null,
      "category": "source",
      "extension": "ts",
      "folder": "src",
      "symbolCount": 4
    }
  ],
  "edges": [ { "from": "src/index.ts", "to": "src/auth.ts" } ]
}
```

Category is one of `source | test | config | documentation | data | style |
other`. The frontend uses it (combined with `language`) to pick a node color.

### `GET /api/repository/:id/insights`

Deterministic architecture metrics over the stored graph (Phase 5D). Pure
function of nodes/edges — no AI.

```json
{
  "summary": {
    "totalFiles": 184,
    "totalDependencies": 327,
    "circularChainCount": 3,
    "rootCount": 7,
    "orphanCount": 12
  },
  "mostDependedOn": [{ "filePath": "src/services/api.ts", "dependents": 31 }],
  "hubs": [{ "filePath": "src/index.ts", "inDegree": 4, "outDegree": 12, "totalDegree": 16 }],
  "entryPoints": [{ "filePath": "src/main.ts", "outDegree": 3 }],
  "orphans": [{ "filePath": "scripts/oneoff.ts", "language": "TypeScript", "languageSupported": true, "category": "source" }],
  "circularChains": [{ "id": "…", "files": ["a.ts", "b.ts"] }],
  "dependencyDepth": { "maxDepth": 8, "deepestPath": ["entry.ts", "…", "leaf.ts"] },
  "moduleGroups": [{ "folder": "src", "fileCount": 40, "internalEdges": 50, "outboundCrossEdges": 12, "inboundCrossEdges": 3 }]
}
```

### `GET /api/repository/:id/summary`

Opt-in AI architecture overview (Phase 6). Reads the stored analysis, builds a
bounded prompt from insights + languages + optional README excerpt, calls the
configured LLM provider, and caches the result by `(id, promptVersion)`.

When `LLM_API_KEY` is unset:

```json
{
  "status": "unavailable",
  "code": "AI_NOT_CONFIGURED",
  "message": "AI architecture overviews are not configured. …"
}
```

When configured:

```json
{
  "status": "ok",
  "text": "…",
  "cached": false,
  "promptVersion": "v1",
  "provider": "openai",
  "generatedAt": "2026-08-15T12:00:00.000Z",
  "promptChars": 2400
}
```

Never invoked by `POST /api/analyze`.

### `GET /api/repository/:id/impact/*`

Deterministic change-impact for a file (Phase 7). Path encoding matches `/file/*`.

```json
{
  "filePath": "lib/utils.ts",
  "downstream": {
    "total": 66,
    "directCount": 66,
    "transitiveCount": 0,
    "maxDistance": 1,
    "files": [{ "filePath": "app/page.tsx", "distance": 1, "relation": "direct" }]
  },
  "upstream": { "total": 1, "directCount": 1, "transitiveCount": 0, "maxDistance": 1, "files": [] }
}
```

Append `/explain` for the opt-in AI impact narrative (same `unavailable` / error
shapes as `/summary`). Cached by `(id, filePath, impact-v1)`.

### `GET /api/repository/:id/file/*`

Everything after `/file/` is the repo-relative file path.

```json
{
  "filePath": "src/index.ts",
  "language": "TypeScript",
  "languageSupported": true,
  "imports":  [ { "source": "./greet", "resolvedPath": "src/greet.ts", "importedNames": ["greet"], "isTypeOnly": false, "kind": "import" } ],
  "importedBy": ["src/main.ts"],
  "symbols":   [ { "id": "src/index.ts#function:app@2", "name": "app", "kind": "function", "location": {...}, "exported": true } ],
  "parseError": null,
  "skipped": false,
  "skipReason": null
}
```

Uniform error response:

```json
{ "error": { "code": "INVALID_REPO_URL", "message": "..." } }
```

Codes: `INVALID_REPO_URL`, `CLONE_FAILED`, `REPO_TOO_LARGE`, `SCAN_FAILED`,
`RATE_LIMITED`, `NOT_FOUND`, `INTERNAL_ERROR`.

---

## Security & limits

Everything here is enforced server-side.

- **Public GitHub HTTPS only.** SSH URLs, non-`github.com` hosts, embedded
  credentials, extra path segments (issues, tree, pull, etc.), query strings,
  and fragments are rejected with `INVALID_REPO_URL`.
- **Shallow clone.** `--depth 1 --single-branch --no-tags --filter=blob:none`.
- **Clone timeout.** `GIT_CLONE_TIMEOUT_MS` (30s default). Aborts hung clones.
- **Interactive prompts disabled.** `GIT_TERMINAL_PROMPT=0`; no `GIT_ASKPASS`
  override — a private repository simply fails with `CLONE_FAILED`.
- **Scan budgets.** Depth (`MAX_SCAN_DEPTH`), total entries (`MAX_SCAN_ENTRIES`),
  and wall-clock (`MAX_SCAN_TIME_MS`). Any breach raises `REPO_TOO_LARGE`.
- **No code execution.** The scanner only reads directory entries and file
  metadata. It never opens, evaluates, or runs anything from the clone.
- **Temp dir cleanup.** Every request cleans up its temp directory in a
  `try/finally`, on both success and failure.
- **Rate limit.** 10 requests / minute / IP on `POST /api/analyze`.
- **Symlinks are skipped** during scanning so they cannot escape the clone.
- **Ignored directories:** `.git`, `node_modules`, `dist`, `build`, `.next`,
  `coverage`, `.venv`, `venv`, `__pycache__`, `target`, `vendor`.

---

## Shareable links (Phase 4)

After analyze completes, the app navigates to `/graph/<id>`. The overview lives
at `/result/<id>`. Both URLs are shareable:

1. Prefer `location.state.analysis` when navigating within the app (no extra fetch).
2. On hard refresh or a pasted link, fetch `GET /api/repository/:id`.
3. Use **Copy link** on either page to put the absolute URL on the clipboard.

Analyses survive server restart because they are stored in SQLite
(`ANALYSIS_DB_PATH`, default `backend/data/analyses.db`). The same 30-minute
TTL and max-entry LRU eviction from Phase 2 still apply — expired rows are
deleted on access / insert.

---

## Architecture graph (Phase 3)

The graph view lives at `/graph/:id` and is the default landing after an analysis
completes.

**Layout.** [ELK.js](https://github.com/kieler/elkjs) runs the `layered`
algorithm on the visible nodes and edges. Layout is asynchronous but runs
exactly once per (data × filter) change; selection/search highlights are
derived via `useMemo` and never trigger a relayout.

**Coloring.** Each node's category (from the backend) selects a color; source
files additionally split by language:

| Category / language | Color  |
| ------------------- | ------ |
| TypeScript source   | Blue   |
| JavaScript source   | Yellow |
| Python source       | Blue-teal (`#3776ab`) |
| Data (JSON / YAML)  | Green  |
| Documentation (MD)  | Gray   |
| Configuration       | Purple |
| Tests               | Orange |
| Styles              | Pink   |
| Other               | Slate  |

**Search.** Typing in the toolbar highlights every file whose path or
filename contains the query (case-insensitive) and centers the viewport on
those matches. Non-matching files stay visible for context.

**Filters.**

- language (multi-select)
- top-level folder (multi-select)
- only files with imports
- only files with no incoming dependencies (graph roots)
- only files that are part of a circular dependency
- hide test files
- hide configuration files

**Navigation.** Clicking a node highlights its incoming edges (purple) and
outgoing edges (blue), dims unrelated nodes, and opens a slide-in **file
details** panel with the file's language, dependency counts, imports (linked
to their target file when resolvable), files that import it (also clickable),
and exported symbols grouped by kind. The mini-map, `+ / − / Fit / Reset`
controls, and legend sit in the corners of the viewport. Everything is
keyboard-accessible and has visible focus states.

---

## Known limitations

- **TypeScript, JavaScript, and Python are parsed** (including `.tsx`, `.jsx`,
  `.mjs`, `.cjs`, `.mts`, `.cts`, `.py`). Files in other languages are recorded in
  the tree but have `languageSupported: false` on their dependency node.
- **JS/TS relative imports and tsconfig path aliases are resolved** (`./foo`,
  `@/components/Button`). Bare packages (`react`, `lodash`) stay external.
  Deep `extends` chains and project references are not followed — only one
  level of `extends` is merged.
- **Python resolves by module path** against the scanned file set only
  (`a.b` → `a/b.py` or `a/b/__init__.py`; relative `.` / `..`). Namespace
  packages without `__init__.py` and dynamic `importlib` are not supported.
- **Nested declarations are not extracted as top-level symbols.** A function
  declared inside another function is intentionally not surfaced.
- **Cloning a large monorepo can hit `REPO_TOO_LARGE`.** Adjust the budgets
  in `.env` if you're running locally.
- **Analyses expire after a 30-minute TTL** (configurable) and the store
  keeps at most 50 concurrent entries (LRU eviction). They survive a server
  restart and a browser hard-refresh for as long as they have not expired.
  Shareable links to expired analyses return a clear "Analysis unavailable"
  screen with a retry / re-analyze path.

---

## Future roadmap (not implemented)

- Additional LLM providers (`gemini`, etc.) behind the same `LlmProvider`
  interface; prompt caching by `(repoUrl, commitSha, promptVersion)`.
- GitHub OAuth for private repositories, webhooks to invalidate analyses on
  push.
- Additional tree-sitter grammars (Go, Rust). Optional Postgres / Redis if
  multi-instance deployment is needed.

---

## Project structure

```
.
├── package.json           # root scripts, concurrently
├── backend/
│   ├── vitest.config.ts
│   └── src/
│       ├── app.ts                          # express assembly
│       ├── index.ts                        # server bootstrap
│       ├── config/env.ts                   # typed env loader (scan + parse budgets)
│       ├── routes/{index,health,analyze,repository}.ts
│       ├── middleware/{errorHandler,requestId,rateLimit}.ts
│       ├── services/
│       │   ├── analysisService.ts          # orchestrator (clone → scan → parse → store)
│       │   ├── analysisStore.ts            # SQLite-backed store w/ TTL + LRU
│       │   ├── architectureInsightsService.ts  # Phase 5D deterministic metrics
│       │   ├── summaryService.ts               # Phase 6 opt-in AI overview
│       │   ├── summaryPrompt.ts
│       │   ├── readmeExcerpt.ts
│       │   ├── llm/                            # LlmProvider + OpenAI
│       │   ├── gitService.ts               # simple-git wrapper
│       │   ├── repoScannerService.ts       # tree walker + budgets (unchanged)
│       │   ├── languageDetection.ts        # ext → language mapping
│       │   └── parser/                     # Phase 2+5A parser pipeline (TS/JS/Python)
│       │       ├── parserService.ts
│       │       ├── symbolExtractorService.ts
│       │       ├── importResolver.ts
│       │       ├── dependencyGraphService.ts
│       │       ├── parsingPipeline.ts
│       │       ├── nodeClassifier.ts       # Phase 3 category metadata
│       │       └── __tests__/*.test.ts
│       ├── utils/{errors,fileSystem,githubUrl,logger,concurrency}.ts
│       └── types/{repository,parsing}.ts   # DTO contract
│   └── data/                               # runtime SQLite DB (gitignored)
└── frontend/
    ├── vitest.config.ts                     # jsdom + @testing-library
    └── src/
        ├── App.tsx  main.tsx  routes.tsx    # /graph/:id, /result/:id
        ├── test-setup.ts
        ├── pages/{LandingPage,ResultPage,GraphPage}.tsx
        ├── components/
        │   ├── layout/{AppShell,Header}.tsx
        │   ├── ui/{GlassCard,Button,Spinner,Badge,CopyLinkButton}.tsx
        │   ├── analyze/{HeroSection,UrlInput}.tsx
        │   ├── repo/{RepoStats,LanguageBreakdown,FolderTree,TreeNodeItem,FileInspector,ArchitectureInsightsPanel}.tsx
        │   └── graph/                       # Phase 3 visualization
        │       ├── DependencyGraph.tsx
        │       ├── DependencyNode.tsx
        │       ├── DependencyEdge.tsx
        │       ├── GraphToolbar.tsx
        │       ├── MiniMapControls.tsx
        │       ├── Legend.tsx
        │       ├── GraphSidePanel.tsx
        │       └── __tests__/*.test.tsx
        ├── hooks/{useAnalyzeRepo,useFileInspector,useGraphData,useAnalysisById}.ts
        ├── services/{httpClient,analyzeApi,repositoryApi}.ts
        ├── lib/{validators,paths,graphColors,graphCycles,graphFilters,graphLayout}.ts
        └── types/{repository,parsing}.ts
```
