---
name: manual-rag
description: Use when answering questions from reference manuals / books / long PDFs that have been ingested into the manual-rag MCP server (e.g. Ableton Live 12, DaVinci Resolve, or any manual added with `npm run ingest` / `npm run import`). Covers the manual-rag_* tools (get_sources, search_manual) — when to call them, how to pick and filter sources, how to cite page/chapter, how to add new manuals, and troubleshooting.
---

# manual-rag playbook

Harness for the **manual-rag** MCP server — retrieval-augmented search over
reference manuals. The server lives in its own repo, **`~/Code/manual-rag-mcp`**
(GitHub: `konraddiesch/manual-rag-mcp`). It embeds manuals locally with Ollama
(`nomic-embed-text`) and answers semantic queries — no cloud, no API keys.

Sources are **arbitrary**: any manual can be added under any source name. The
Ableton Live 12 and DaVinci Resolve manuals are just the currently indexed
examples. Never assume a fixed source list — ask the server.

## Tool namespace

| Need | Prefix | Tools |
|---|---|---|
| Manual / PDF retrieval | `manual-rag_*` | `manual-rag_get_sources`, `manual-rag_search_manual` |

Never mix this namespace with `touchdesigner_*`, `touchdesigner-wiki_*`, or
`chan-tools_*`. (`touchdesigner-wiki_*` is the TouchDesigner Wiki; `manual-rag_*`
is your ingested offline manuals — different corpora.)

## Golden rule

**Call `get_sources` before the first search of a session.** It tells you which
manuals are indexed, which source id to pass, and what each covers. Guessing a
source id returns an error; guessing a source that exists but is wrong silently
searches the wrong book.

## Cheatsheet

| Task | Tool | Key inputs |
|---|---|---|
| Which manuals are indexed | `manual-rag_get_sources` | none |
| Search across all manuals | `manual-rag_search_manual` | `query`, `maxResults` (default 5) |
| Search one manual | `manual-rag_search_manual` | `query`, `source`, `maxResults` |

`search_manual` returns, per hit: `[source]` tag, **page number**, chapter label,
a relevance score (aliased cosine similarity, 0–100 %) and the raw excerpt.

## Workflows

### 1. Discover the corpus
`manual-rag_get_sources` → for each source: chunk count, page range, detected
chapters. Chapters are heuristically parsed from PDF headings and can be noisy
(e.g. OCR-ish labels); **trust the page number over the chapter label** when
citing.

### 2. Answer a manual question
1. `manual-rag_search_manual query="<the user's question, rephrased with manual terminology>"` — omit `source` to search everything.
2. Read the excerpts; if the top hits are on-topic, answer and **cite
   `[source] p. <page>`**.
3. If hits are weak or off-topic, rephrase (manuals use their own vocabulary —
   "warp" not "stretch") or add keywords, then search again.

### 3. Restrict to one manual
When the domain is known, filter: `source="ableton"` / `source="resolve"` /
`source="<id from get_sources>"`. This avoids cross-manual noise (e.g. the word
"render" means different things in Live and Resolve). Raise `maxResults` (up to
20) for broad "how do I…" questions; keep it low (3–5) for point lookups.

### 4. Extend the corpus (adding a manual)
Two paths, both run from `~/Code/manual-rag-mcp` (Ollama must be running):

```sh
# From a PDF — extracts, chunks and embeds it:
npm run ingest -- --pdf /path/to/manual.pdf --source <id>

# From an existing RAG store — imports vectors, no re-embedding:
npm run import -- --from /path/to/embeddings.json --source <id>
```

Re-ingest/re-import an existing id with `--replace`. Then `npm run build` if
`src/` changed, and restart/reconnect the MCP client so the new source is picked
up. New source ids appear automatically in `get_sources` — nothing is hardcoded.

## Reading the output

- **Relevance score** is cosine similarity (0–100 %). Treat ≳ 70 % as a strong
  hit, ~50–70 % as "relevant but verify", and anything lower as a weak lead —
  don't quote weak excerpts as fact.
- **Page** is the PDF page (from `pdftotext` form feeds), i.e. the printed page
  number, not an offset.
- Excerpts are 1200-char chunks with 150-char overlap — adjacent hits may be the
  same passage continued; don't treat them as independent corroboration.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Ollama connection failed` / warnings at startup | Ollama not running | `brew services start ollama` |
| `nomic-embed-text model not found` | model not pulled | `ollama pull nomic-embed-text` |
| `Unknown source "x"` error | id not indexed | read the error's source list, or call `get_sources` |
| `No results found` | query/vocabulary mismatch | rephrase with the manual's own terms; widen `maxResults`; drop the `source` filter |
| `Skipped N chunk(s) embedded with a different dimension` | store mixes embedding models | re-ingest/import the odd source, or set `EMBEDDING_MODEL` to match |
| No sources at all | `data/` not populated (gitignored) | `npm run ingest` / `npm run import`; or set `DATA_DIR` |

Environment overrides: `DATA_DIR` (store location), `EMBEDDING_MODEL`
(default `nomic-embed-text`), `OLLAMA_HOST` (default `http://localhost:11434`).

## Anti-patterns (do NOT)

- ❌ Search before calling `get_sources` — you'll guess the wrong source id/list.
- ❌ Hardcode "ableton"/"resolve" as *the* sources → the corpus is arbitrary; read it from `get_sources`.
- ❌ Pass a `source` you haven't confirmed — unknown ids error, and a wrong-but-real id returns plausible-looking text from the wrong manual.
- ❌ Treat every retrieved passage as ground truth — check the relevance score and prefer ≥ ~70 %.
- ❌ Re-vendor the server into another project — it belongs to `~/Code/manual-rag-mcp`.
- ❌ Assume `data/` exists after a fresh clone — it is gitignored; rebuild it via `ingest`/`import`.
- ❌ Mix the `manual-rag_*` namespace with `touchdesigner-wiki_*` / `chan-tools_*`.
