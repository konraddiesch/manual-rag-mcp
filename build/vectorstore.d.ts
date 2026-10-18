export interface SearchResult {
    content: string;
    metadata: {
        page: number;
        chapter: string;
        source: string;
    };
    distance: number;
}
export interface SourceStats {
    source: string;
    chunkCount: number;
    pageMin: number;
    pageMax: number;
    chapters: string[];
}
export declare function initVectorStore(): Promise<void>;
export declare function search(query: string, nResults?: number, source?: string): Promise<SearchResult[]>;
export declare function getSourceStats(): SourceStats[];
export declare function getDocumentCount(): number;
