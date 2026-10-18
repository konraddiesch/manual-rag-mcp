import { search, getSourceStats } from '../vectorstore.js';

export interface SearchToolResult {
  query: string;
  results: {
    content: string;
    page: number;
    chapter: string;
    source: string;
    relevanceScore: number;
  }[];
  totalResults: number;
}

export interface SourcesOverview {
  sources: {
    source: string;
    chunkCount: number;
    pageMin: number;
    pageMax: number;
    chapters: string[];
  }[];
}

export async function searchManual(
  query: string,
  maxResults: number = 5,
  source?: string
): Promise<SearchToolResult> {
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

export function getSources(): SourcesOverview {
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
