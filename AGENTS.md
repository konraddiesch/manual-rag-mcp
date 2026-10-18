# Agents.md

## Project structure

```
src/
  index.ts       — MCP stdio server; 2 tools (search_manual, get_sources); validates source id
  embeddings.ts  — Ollama client (OLLAMA_HOST, EMBEDDING_MODEL env-overridable)
  store.ts       — data layer: paths (DATA_DIR), read/append/remove chunks, source metadata
  vectorstore.ts — in-memory store, cosine similarity search, source stats, dimension guard
  tools/search.ts— result shaping for the search tool
  ingest.ts      — CLI: PDF → pdftotext → chunk → Ollama embeddings → store
  import.ts      — CLI: import an existing embeddings.json from any RAG project (no re-embedding)
build/           — tsc output (committed, production entrypoint)
data/            — runtime data layer (gitignored)
SKILL.md         — usage playbook for AI clients (installed at ~/.config/opencode/skills/manual-rag/)
```

TypeScript, ESM (`"type": "module"`), no test/lint infrastructure.

## Commands

```sh
npm install       # install deps
npm run build     # tsc, outputs to build/
npm start         # node build/index.js (MCP server, production)
npm run ingest -- --pdf <path> --source <name> [--chunk-size N] [--overlap N] [--replace]
npm run import -- --from <embeddings.json> --source <name> [--replace]
```

## Sources are arbitrary — never hardcode them

The server is **generic**: any number of manuals, each under an arbitrary source
name. `ableton` and `resolve` are only the currently indexed examples. Available
sources are discovered at runtime via `get_sources` / `getSourceStats()` — there
must be **no hardcoded source names in logic or data paths**. If you add
something source-specific, generalize it.

- Adding data: `ingest` (from a PDF) or `import` (from another store's embeddings).
- The store is `data/embeddings.json` (a huge JSON array); `data/sources/<name>/metadata.json` per source.
- **All sources in one store must use the same embedding model as queries** (`EMBEDDING_MODEL`), else dimensions mismatch. `vectorstore.ts` skips mismatching chunks with a warning rather than producing `NaN`.
- `DATA_DIR` (absolute) overrides the store location; it defaults to `<repo>/data` resolved relative to the compiled module, so it is independent of the process cwd.

## Git

- **Remote**: `git@github.com:konraddiesch/manual-rag-mcp.git`, default branch `main`.
- **Versioned**: `src/`, **`build/`** (production entrypoint — run `npm run build` before committing source changes; never let `build/` go stale), `SKILL.md`, `README.md`, `AGENTS.md`, `LICENSE`, `.mcp.json`, `package.json`, `package-lock.json`, `tsconfig.json`.
- **Ignored** (`.gitignore`): `node_modules/`, **`data/`** (embeddings + extracted text + metadata — large, regenerable), `.claude/settings.local.json` (personal permissions), `*.log`, `.DS_Store`.

## Key facts

- **All MCP-server logging goes to `stderr`** (stdout is reserved for JSON-RPC). Never `console.log` in `index.ts` / `vectorstore.ts` / `embeddings.ts` / `store.ts`. The CLIs (`ingest.ts`, `import.ts`) may use `console.log`.
- **No API key, fully local** — embeddings via Ollama (`nomic-embed-text`); search is brute-force cosine similarity in `vectorstore.ts`.
- **Requirements**: Node ≥ 20, Ollama running + `nomic-embed-text` pulled, `pdftotext` (poppler) for `ingest`.
- **No tests, no linter** — none configured.
- **`.mcp.json`** at root defines the `manual-rag` server for Claude Desktop/IDE; the path uses `${HOME}` so it is portable.
- Chunking: 1200 chars / 150 overlap; chapters/pages detected heuristically from headings and `\f` form feeds (`ingest.ts`).
- The store is a hand-written streaming JSON array — written by `store.ts` `openAppendWriter()` (truncate trailing `]`, append, re-close); read with `JSON.parse`.
- Errors in tool handlers return `{ content: [...], isError: true }`.
