# StackScope

> Understand any GitHub repository in minutes, not days.

StackScope is a developer productivity tool. Paste a public GitHub URL, and it
clones the repository into a sandboxed temporary directory, scans the working
tree, and hands back a clean, interactive map of the project — folders, files,
primary language, and a language breakdown.

This is not an AI chatbot. It is a repository navigation aid.

---

## Current scope (Phase 4)

Phase 4 adds **persistence and shareable analysis links** on top of the
Phase 3 interactive graph.

- Paste a `https://github.com/<owner>/<repo>` URL.
- Backend clones (`--depth 1`), scans, parses TS/JS with tree-sitter, builds
  a directed dependency graph, and **persists the full analysis in SQLite**
  (keyed by UUID, with the same TTL + LRU eviction as the old in-memory store).
- Frontend lands on a **shareable** `/graph/:id` URL. Hard-refreshing the page,
  bookmarking it, or sending the link to a teammate all reload the same
  analysis from the backend. The overview lives at `/result/:id`.
- Both pages expose a **Copy link** button that copies an absolute shareable URL.

**Still not included (deferred):**

- No AI summaries, embeddings, chat, or natural-language search
- No job queue / BullMQ, no Redis, no Postgres (SQLite only)
- No authentication, no private repositories, no per-user history

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

- **Only TypeScript and JavaScript are parsed** (including `.tsx`, `.jsx`,
  `.mjs`, `.cjs`, `.mts`, `.cts`). Files in other languages are recorded in
  the tree but have `languageSupported: false` on their dependency node.
- **Only relative imports are resolved** (`./foo`, `../bar`). Bare specifiers
  (`react`, `lodash`) are recorded as external. Path aliases (`@/foo`, etc.)
  are not resolved yet — that requires reading `tsconfig.json`.
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

- **Phase 5:** `tsconfig.json`-aware path alias resolution. LLM-generated
  module summaries, provider-agnostic (`openai`, `gemini`), cached by
  `(repoUrl, commitSha, promptVersion)`. Always opt-in. GitHub OAuth for
  private repositories, webhooks to invalidate analyses on push. Additional
  tree-sitter grammars (Python, Go, Rust). Optional Postgres / Redis if
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
│       │   ├── gitService.ts               # simple-git wrapper
│       │   ├── repoScannerService.ts       # tree walker + budgets (unchanged)
│       │   ├── languageDetection.ts        # ext → language mapping
│       │   └── parser/                     # Phase 2 parser pipeline (unchanged)
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
        │   ├── repo/{RepoStats,LanguageBreakdown,FolderTree,TreeNodeItem,FileInspector}.tsx
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
