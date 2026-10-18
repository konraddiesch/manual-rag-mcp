import { search, getSourceStats } from '../vectorstore.js';
export async function searchManual(query, maxResults = 5, source) {
    const results = await search(query, maxResults, source);
    return {
        query,
        results: results.map(r => ({
            content: r.content,
            page: r.metadata.page,
            chapter: r.metadata.chapter,
            source: r.metadata.source,
            relevanceScore: Math.round((1 - r.distance) * 100) / 100,
        })),
        totalResults: results.length,
    };
}
export function getSources() {
    const stats = getSourceStats();
    return {
        sources: stats.map(s => ({
            source: s.source,
            chunkCount: s.chunkCount,
            pageMin: s.pageMin,
            pageMax: s.pageMax,
            chapters: s.chapters,
        })),
    };
}
