import { generateEmbedding } from './embeddings.js';
import { EMBEDDINGS_PATH, readStore } from './store.js';
let chunks = [];
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
export async function initVectorStore() {
    try {
        chunks = readStore();
        if (chunks.length === 0) {
            console.error(`No chunks found at ${EMBEDDINGS_PATH}`);
        }
        else {
            console.error(`Loaded ${chunks.length} document chunks`);
        }
    }
    catch (error) {
        console.error('Failed to load embeddings:', error);
        throw error;
    }
}
export async function search(query, nResults = 5, source) {
    if (chunks.length === 0) {
        console.error('No chunks loaded. Run "npm run ingest" or "npm run import" first.');
        return [];
    }
    console.error(`Searching for: "${query}"${source ? ` in source: "${source}"` : ''}...`);
    const queryEmbedding = await generateEmbedding(query);
    const queryDim = queryEmbedding.length;
    const bySource = source ? chunks.filter(c => c.source === source) : chunks;
    // Only compare chunks embedded with the same model/dimension as the query;
    // otherwise cosineSimilarity would read past the end of the shorter vector.
    const pool = bySource.filter(c => c.embedding.length === queryDim);
    if (pool.length < bySource.length) {
        console.error(`Skipped ${bySource.length - pool.length} chunk(s) embedded with a different dimension than the query ` +
            `(${queryDim}). Set EMBEDDING_MODEL to match the imported data.`);
    }
    if (pool.length === 0) {
        console.error(`No chunks with matching embedding dimension (${queryDim}) to search.`);
        return [];
    }
    const results = [];
    for (let i = 0; i < pool.length; i++) {
        const similarity = cosineSimilarity(queryEmbedding, pool[i].embedding);
        results.push({ index: i, similarity });
    }
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, nResults).map(r => ({
        content: pool[r.index].content,
        metadata: {
            page: pool[r.index].page,
            chapter: pool[r.index].chapter,
            source: pool[r.index].source,
        },
        distance: 1 - r.similarity,
    }));
}
export function getSourceStats() {
    const statsMap = new Map();
    for (const chunk of chunks) {
        const existing = statsMap.get(chunk.source);
        if (existing) {
            existing.chunkCount += 1;
            existing.pageMin = Math.min(existing.pageMin, chunk.page);
            existing.pageMax = Math.max(existing.pageMax, chunk.page);
            existing.chaptersSet.add(chunk.chapter);
        }
        else {
            statsMap.set(chunk.source, {
                chunkCount: 1,
                pageMin: chunk.page,
                pageMax: chunk.page,
                chaptersSet: new Set([chunk.chapter]),
            });
        }
    }
    return Array.from(statsMap.entries()).map(([source, stats]) => ({
        source,
        chunkCount: stats.chunkCount,
        pageMin: stats.pageMin,
        pageMax: stats.pageMax,
        chapters: Array.from(stats.chaptersSet).sort(),
    }));
}
export function getDocumentCount() {
    return chunks.length;
}
