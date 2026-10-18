#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { initVectorStore, getDocumentCount, getSourceStats } from './vectorstore.js';
import { searchManual, getSources } from './tools/search.js';
import { checkOllamaConnection } from './embeddings.js';
const SearchToolSchema = z.object({
    query: z.string().describe('The search query'),
    source: z.string().optional().describe('Optional source filter — must match a source id returned by get_sources (e.g. "ableton", "resolve"). Omit to search all sources.'),
    maxResults: z.number().min(1).max(20).default(5).describe('Maximum number of results to return'),
});
const tools = [
    {
        name: 'search_manual',
        description: `Search the indexed reference manuals for information.

Call get_sources first to learn which manuals are indexed and what each covers. Then search a manual whenever the user asks about a feature, workflow, keyboard shortcut, setting, or concept covered by one of those manuals — this is the authoritative source, prefer it over guessing or a web search.

Pass the optional "source" parameter to restrict results to a single manual (use the exact source id returned by get_sources):
- source="<id>" — search only that manual
- Omit "source" to search across all manuals simultaneously

The tool returns relevant excerpts with page numbers, chapter information, source identification, and a relevance score.`,
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query',
                },
                source: {
                    type: 'string',
                    description: 'Optional source filter — must match a source id returned by get_sources (e.g. "ableton", "resolve"). Omit to search all sources.',
                },
                maxResults: {
                    type: 'number',
                    description: 'Maximum number of results to return (1-20, default 5)',
                    minimum: 1,
                    maximum: 20,
                    default: 5,
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_sources',
        description: `Get a list of all indexed reference manuals with their chunk counts, page ranges, and detected chapters.

Use this tool when the user wants to:
- Know which manuals are available to search
- See what topics are covered in each manual
- Find out the structure of available documentation`,
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
];
async function main() {
    console.error('Starting Manual RAG Server...');
    const ollamaOk = await checkOllamaConnection();
    if (!ollamaOk) {
        console.error('WARNING: Ollama not available. Search functionality will be limited.');
    }
    try {
        await initVectorStore();
        const count = getDocumentCount();
        console.error(`Vector store initialized with ${count} documents`);
        if (count === 0) {
            console.error('WARNING: No documents indexed. Run "npm run migrate" or "npm run ingest" first.');
        }
    }
    catch (error) {
        console.error('Failed to initialize vector store:', error);
    }
    const server = new Server({
        name: 'manual-rag',
        version: '1.0.0',
    }, {
        capabilities: {
            tools: {},
        },
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            switch (name) {
                case 'search_manual': {
                    const parsed = SearchToolSchema.parse(args);
                    if (parsed.source) {
                        const available = getSourceStats().map(s => s.source);
                        if (!available.includes(parsed.source)) {
                            const list = available.length ? `Indexed sources: ${available.join(', ')}.` : 'No sources are indexed yet.';
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Unknown source "${parsed.source}" (no such manual indexed). ${list} Call get_sources for details, or omit "source" to search all manuals.`,
                                    },
                                ],
                                isError: true,
                            };
                        }
                    }
                    const result = await searchManual(parsed.query, parsed.maxResults, parsed.source);
                    if (result.results.length === 0) {
                        const sourceNote = parsed.source ? ` in source "${parsed.source}"` : '';
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `No results found for "${parsed.query}"${sourceNote}. Try rephrasing your question or using different keywords.`,
                                },
                            ],
                        };
                    }
                    let responseText = `Found ${result.totalResults} relevant sections for "${result.query}":\n\n`;
                    result.results.forEach((r, i) => {
                        responseText += `---\n`;
                        responseText += `**Result ${i + 1}** [${r.source}] (Page ${r.page}, ${r.chapter})\n`;
                        responseText += `Relevance: ${Math.round(r.relevanceScore * 100)}%\n\n`;
                        responseText += `${r.content}\n\n`;
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: responseText,
                            },
                        ],
                    };
                }
                case 'get_sources': {
                    const overview = getSources();
                    if (overview.sources.length === 0) {
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: 'No sources indexed. Run "npm run migrate" or "npm run ingest" first.',
                                },
                            ],
                        };
                    }
                    let responseText = '# Indexed Reference Manuals\n\n';
                    overview.sources.forEach((s) => {
                        responseText += `## ${s.source}\n`;
                        responseText += `- Chunks: ${s.chunkCount}\n`;
                        responseText += `- Pages: ${s.pageMin}–${s.pageMax}\n`;
                        responseText += `- Chapters (${s.chapters.length}): ${s.chapters.slice(0, 10).join(', ')}`;
                        if (s.chapters.length > 10) {
                            responseText += `, ... (+${s.chapters.length - 10} more)`;
                        }
                        responseText += '\n\n';
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: responseText,
                            },
                        ],
                    };
                }
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${errorMessage}`,
                    },
                ],
                isError: true,
            };
        }
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Manual RAG Server running on stdio');
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
