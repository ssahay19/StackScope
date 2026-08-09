# StackScope

> Understand any GitHub repository in minutes, not days.

StackScope is a developer productivity tool. Paste a public GitHub URL, and it
clones the repository into a sandboxed temporary directory, scans the working
tree, and hands back a clean, interactive map of the project — folders, files,
primary language, and a language breakdown.

This is not an AI chatbot. It is a repository navigation aid.

---

## Current scope (Phase 3)

Phase 3 adds an **interactive dependency graph** on top of Phase 2's static
analysis. The graph is now the centerpiece of the app.

- Paste a `https://github.com/<owner>/<repo>` URL.
- Backend clones (`--depth 1`), scans, then **parses TS/JS files with
  tree-sitter**, extracts imports/exports/functions/classes/interfaces/enums/
  type aliases/variables, and **builds a directed dependency graph**.
- Frontend renders it as an interactive **React Flow** graph with automatic
  ELK.js layout, category-based node coloring, click-to-highlight
  incoming/outgoing dependencies, a slide-in file details panel, a search box
  that centers on matches, and a rich filter panel (language, folder, roots,
  cycles, tests, config).
- The Phase 2 "overview" view (stats + language breakdown + folder tree +
  inspector) is still available at `/result` and is one click away from the
  graph.

**Still not included (deferred):**

- No AI summaries, embeddings, chat, or natural-language search
- No database, cache, or job queue (analyses live in an in-memory TTL store)
- No authentication, no private repositories

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

# In-memory analysis store (Phase 2)
ANALYSIS_TTL_MS=1800000
ANALYSIS_MAX_ENTRIES=50
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

## Architecture graph (Phase 3)

The graph view lives at `/graph` and is the default landing after an analysis
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
  are not resolved yet — that requires reading `tsconfig.json`, which is a
  Phase 3 concern.
- **Nested declarations are not extracted as top-level symbols.** A function
  declared inside another function is intentionally not surfaced.
- **Cloning a large monorepo can hit `REPO_TOO_LARGE`.** Adjust the budgets
  in `.env` if you're running locally.
- **Analyses live in memory with a 30-minute TTL** and a hard cap of 50
  concurrent entries. Refreshing `/result` returns the user to the landing
  page. Persistence is a Phase 3 concern.

---

## Future roadmap (not implemented)

- **Phase 4 (not started):** `tsconfig.json`-aware path alias resolution.
  Postgres-backed analysis storage, BullMQ job queue, shareable
  `/graph/:id` URLs. LLM-generated module summaries, provider-agnostic
  (`openai`, `gemini`), cached by `(repoUrl, commitSha, promptVersion)`.
  Always opt-in.
- **Phase 5:** GitHub OAuth for private repositories, webhooks to invalidate
  cached analyses on push. Additional tree-sitter grammars (Python, Go, Rust).

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
│       │   ├── analysisStore.ts            # in-memory keyed cache w/ TTL
│       │   ├── gitService.ts               # simple-git wrapper
│       │   ├── repoScannerService.ts       # tree walker + budgets (unchanged)
│       │   ├── languageDetection.ts        # ext → language mapping
│       │   └── parser/                     # Phase 2 parser pipeline
│       │       ├── parserService.ts        # tree-sitter grammar registry
│       │       ├── symbolExtractorService.ts
│       │       ├── importResolver.ts       # relative → repo-relative path
│       │       ├── dependencyGraphService.ts
│       │       ├── parsingPipeline.ts      # composes the above
│       │       └── __tests__/*.test.ts     # vitest suites (55 tests)
│       ├── utils/{errors,fileSystem,githubUrl,logger,concurrency}.ts
│       └── types/{repository,parsing}.ts   # DTO contract
└── frontend/
    ├── vitest.config.ts                     # jsdom + @testing-library
    └── src/
        ├── App.tsx  main.tsx  routes.tsx    # lazy-loaded /graph route
        ├── test-setup.ts                    # ResizeObserver / matchMedia shims
        ├── pages/{LandingPage,ResultPage,GraphPage}.tsx
        ├── components/
        │   ├── layout/{AppShell,Header}.tsx
        │   ├── ui/{GlassCard,Button,Spinner,Badge}.tsx
        │   ├── analyze/{HeroSection,UrlInput}.tsx
        │   ├── repo/{RepoStats,LanguageBreakdown,FolderTree,TreeNodeItem,FileInspector}.tsx
        │   └── graph/                       # Phase 3 visualization
        │       ├── DependencyGraph.tsx      # React Flow scene
        │       ├── DependencyNode.tsx       # custom node renderer
        │       ├── DependencyEdge.tsx       # custom edge with highlight states
        │       ├── GraphToolbar.tsx         # search + filters
        │       ├── MiniMapControls.tsx      # mini-map + zoom / fit / reset
        │       ├── Legend.tsx               # color + edge legend
        │       ├── GraphSidePanel.tsx       # slide-in file details
        │       └── __tests__/*.test.tsx
        ├── hooks/{useAnalyzeRepo,useFileInspector,useGraphData}.ts
        ├── services/{httpClient,analyzeApi,repositoryApi}.ts
        ├── lib/
        │   ├── validators.ts
        │   ├── paths.ts                     # basename / topLevelFolder
        │   ├── graphColors.ts               # category → color tokens
        │   ├── graphCycles.ts               # iterative Tarjan, neighbor index
        │   ├── graphFilters.ts              # pure visibility + search helpers
        │   ├── graphLayout.ts               # ELK.js wrapper
        │   └── __tests__/*.test.ts
        └── types/{repository,parsing}.ts    # mirror of backend DTOs
```
