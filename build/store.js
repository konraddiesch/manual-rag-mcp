import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
/**
 * Data layer location. Defaults to `<repo>/data` (resolved relative to this
 * module, so it is independent of the process cwd — the MCP server is started
 * from an arbitrary directory). Override with an absolute `DATA_DIR` to point
 * at another store.
 */
export const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(MODULE_DIR, '..', 'data');
export const EMBEDDINGS_PATH = path.join(DATA_DIR, 'embeddings.json');
export const SOURCES_DIR = path.join(DATA_DIR, 'sources');
export function sourceExists(source) {
    return fs.existsSync(path.join(SOURCES_DIR, source, 'metadata.json'));
}
/** Read the whole store into memory. Returns `[]` when nothing is ingested yet. */
export function readStore() {
    if (!fs.existsSync(EMBEDDINGS_PATH))
        return [];
    return JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, 'utf-8'));
}
/** Drop every chunk belonging to `source` and delete its metadata. Returns the number of chunks removed. */
export function removeSource(source) {
    const sourceDir = path.join(SOURCES_DIR, source);
    if (fs.existsSync(sourceDir)) {
        fs.rmSync(sourceDir, { recursive: true });
    }
    if (!fs.existsSync(EMBEDDINGS_PATH))
        return 0;
    const allChunks = readStore();
    const filtered = allChunks.filter(c => c.source !== source);
    fs.writeFileSync(EMBEDDINGS_PATH, JSON.stringify(filtered));
    return allChunks.length - filtered.length;
}
export function saveSourceMetadata(source, chunks, kind = 'ingested') {
    const sourceDir = path.join(SOURCES_DIR, source);
    fs.mkdirSync(sourceDir, { recursive: true });
    const metadata = {
        source,
        chunkCount: chunks.length,
        pageMin: chunks.length ? Math.min(...chunks.map(c => c.page)) : 0,
        pageMax: chunks.length ? Math.max(...chunks.map(c => c.page)) : 0,
        chapters: [...new Set(chunks.map(c => c.chapter))].sort(),
        [kind === 'imported' ? 'importedAt' : 'ingestedAt']: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(sourceDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
}
/**
 * Open the embeddings file for streaming append.
 *
 * The store is a hand-written JSON array, so appending truncates the trailing
 * `]`, writes `,` + chunks, then re-closes the array. Chunks are written one at
 * a time to keep memory bounded while embedding large manuals.
 */
export function openAppendWriter() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const makeWriter = (stream, leadingComma) => {
        let first = true;
        if (leadingComma)
            stream.write(',\n');
        return {
            write(chunk) {
                if (!first)
                    stream.write(',\n');
                first = false;
                stream.write(JSON.stringify(chunk));
            },
            close() {
                stream.write('\n]');
                stream.end();
                return new Promise((resolve, reject) => {
                    stream.on('finish', resolve);
                    stream.on('error', reject);
                });
            },
        };
    };
    const exists = fs.existsSync(EMBEDDINGS_PATH) && fs.statSync(EMBEDDINGS_PATH).size > 0;
    if (!exists) {
        const stream = fs.createWriteStream(EMBEDDINGS_PATH);
        stream.write('[\n');
        return makeWriter(stream, false);
    }
    // Truncate the trailing ']' of the existing array, then append.
    const fileSize = fs.statSync(EMBEDDINGS_PATH).size;
    const fd = fs.openSync(EMBEDDINGS_PATH, 'r+');
    let pos = fileSize - 1;
    const buf = Buffer.alloc(1);
    while (pos > 0) {
        fs.readSync(fd, buf, 0, 1, pos);
        if (buf[0] === 0x5d)
            break; // ']'
        pos--;
    }
    fs.ftruncateSync(fd, pos);
    fs.closeSync(fd);
    return makeWriter(fs.createWriteStream(EMBEDDINGS_PATH, { flags: 'a' }), true);
}
