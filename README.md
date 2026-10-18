# manual-rag-mcp

Feed any manual / book / text into your RAG, then use it as an MCP server so your AI can retrieve information from it.

An [MCP](https://modelcontextprotocol.io) server that exposes retrieval-augmented search over an **arbitrary set of reference manuals**. Ingestion turns a PDF into text chunks and embeds them locally with [Ollama](https://ollama.com) (`nomic-embed-text`); search runs a brute-force cosine similarity over those embeddings — no cloud, no API keys, fully local. Any number of sources can be added, each with an arbitrary name, and existing embedding stores from other RAG projects can be imported without re-embedding.

*Currently indexed as examples: the Ableton Live 12 and DaVinci Resolve manuals.*

## How it works

```
PDF ──pdftotext -layout──▶ text ──chunk (1200 chars / 150 overlap)──▶ chunks
     └─ chapter/page detection from headings                      │
                                                                  ▼
                              data/embeddings.json ◀── Ollama nomic-embed-text
                                        ▲                         │
                    existing embeddings │ (npm run import)        │
                                        └─────────────────────────┤
                          query ──embed──▶ cosine similarity ──▶ top-k excerpts
```

| File | Role |
|---|---|
| `src/index.ts` | MCP stdio server — exposes `search_manual`, `get_sources` |
| `src/embeddings.ts` | Ollama client (`OLLAMA_HOST`, `EMBEDDING_MODEL` overridable via env) |
| `src/store.ts` | Data layer: paths, read/append/remove chunks, source metadata |
| `src/vectorstore.ts` | Loads the store, cosine similarity search, source stats, dimension guard |
| `src/tools/search.ts` | Tool-level result shaping |
| `src/ingest.ts` | PDF → text → chunks → embeddings (the ingest CLI) |
| `src/import.ts` | Import an existing embeddings JSON from any RAG project (no re-embedding) |

## Requirements

- Node.js ≥ 20
- [Ollama](https://ollama.com) running locally with the embedding model:
  ```sh
  ollama pull nomic-embed-text
  brew services start ollama
  ```
- `pdftotext` (from [poppler](https://poppler.freedesktop.org)) — `brew install poppler`

## Install

```sh
git clone git@github.com:konraddiesch/manual-rag-mcp.git ~/Code/manual-rag-mcp
cd ~/Code/manual-rag-mcp
npm install
npm run build
```

`build/` is committed, so a clone is runnable without building — but run `npm run build` after any change under `src/`.

## Add a manual from a PDF

```sh
npm run ingest -- --pdf /path/to/manual.pdf --source my-manual
```

| Flag | Description |
|---|---|
| `--pdf <path>` | Path to the PDF (required) |
| `--source <name>` | Arbitrary source id used for filtering and `get_sources` (required) |
| `--chunk-size N` | Characters per chunk (default `1200`) |
| `--overlap N` | Overlap between chunks (default `150`) |
| `--replace` | Re-ingest an existing source (required if the id already exists) |

Embeddings are appended to `data/embeddings.json`; per-source metadata lands in `data/sources/<source>/metadata.json`.

## Import an existing embeddings store

Already have a RAG store elsewhere? Bring its vectors in without re-embedding:

```sh
npm run import -- --from /path/to/other-rag/embeddings.json --source my-manual [--replace]
```

The file must be a JSON array of chunks; each entry needs `content` and `embedding`, with optional `id`, `page` and `chapter` (also read from a nested `metadata` object). Chunk ids are prefixed with the source name.

⚠️ **All sources in one store must share the same embedding model as the query**, otherwise dimensions won't match and mismatching chunks are skipped at search (with a warning). Set `EMBEDDING_MODEL` if the imported data uses a different model than `nomic-embed-text`.

## Register the MCP server

The repo root `.mcp.json` already registers the server for Claude Desktop / IDE clients:

```json
{
  "mcpServers": {
    "manual-rag": {
      "type": "stdio",
      "command": "node",
      "args": ["${HOME}/Code/manual-rag-mcp/build/index.js"]
    }
  }
}
```

For opencode, add to `~/.config/opencode/opencode.jsonc`:

```jsonc
"manual-rag": {
  "type": "local",
  "command": ["node", "{env:HOME}/Code/manual-rag-mcp/build/index.js"],
  "enabled": true
}
```

## Tools

| Tool | Purpose |
|---|---|
| `get_sources` | List indexed manuals with chunk counts, page ranges, detected chapters |
| `search_manual` | Semantic search — `query`, optional `source` filter, `maxResults` (1–20, default 5) |

Returns excerpts with page number, chapter, source and relevance score. An unknown `source` returns a helpful error listing the indexed sources.

## Data is not committed

`data/` (embeddings, extracted text and per-source metadata — ~129 MB) and `node_modules/` are **gitignored**. Re-create the data layer with `npm run ingest` or `npm run import`. Override the location with an absolute `DATA_DIR`.

## Usage guide

See **[SKILL.md](SKILL.md)** — a precise playbook for using the MCP server well (call `get_sources` first, when to filter by source, how to cite, troubleshooting). The same skill is installed globally at `~/.config/opencode/skills/manual-rag/SKILL.md`.

## License

MIT
