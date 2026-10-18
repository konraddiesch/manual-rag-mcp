/**
 * Data layer location. Defaults to `<repo>/data` (resolved relative to this
 * module, so it is independent of the process cwd — the MCP server is started
 * from an arbitrary directory). Override with an absolute `DATA_DIR` to point
 * at another store.
 */
export declare const DATA_DIR: string;
export declare const EMBEDDINGS_PATH: string;
export declare const SOURCES_DIR: string;
export interface Chunk {
    id: string;
    content: string;
    page: number;
    chapter: string;
}
export interface StoredChunk extends Chunk {
    source: string;
    embedding: number[];
}
export interface SourceMetadata {
    source: string;
    chunkCount: number;
    pageMin: number;
    pageMax: number;
    chapters: string[];
    ingestedAt?: string;
    importedAt?: string;
}
export declare function sourceExists(source: string): boolean;
/** Read the whole store into memory. Returns `[]` when nothing is ingested yet. */
export declare function readStore(): StoredChunk[];
/** Drop every chunk belonging to `source` and delete its metadata. Returns the number of chunks removed. */
export declare function removeSource(source: string): number;
export declare function saveSourceMetadata(source: string, chunks: Chunk[], kind?: 'ingested' | 'imported'): void;
export interface StoreWriter {
    write(chunk: StoredChunk): void;
    close(): Promise<void>;
}
/**
 * Open the embeddings file for streaming append.
 *
 * The store is a hand-written JSON array, so appending truncates the trailing
 * `]`, writes `,` + chunks, then re-closes the array. Chunks are written one at
 * a time to keep memory bounded while embedding large manuals.
 */
export declare function openAppendWriter(): StoreWriter;
