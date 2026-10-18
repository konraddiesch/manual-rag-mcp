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
export declare function searchManual(query: string, maxResults?: number, source?: string): Promise<SearchToolResult>;
export declare function getSources(): SourcesOverview;
