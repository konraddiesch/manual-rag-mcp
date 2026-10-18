import fs from 'fs';
import { openAppendWriter, removeSource, saveSourceMetadata, sourceExists } from './store.js';
function parseArgs() {
    const args = process.argv.slice(2);
    let from = '';
    let source = '';
    let replace = false;
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--from':
                from = args[++i];
                break;
            case '--source':
                source = args[++i];
                break;
            case '--replace':
                replace = true;
                break;
        }
    }
    if (!from || !source) {
        console.error('Usage: node build/import.js --from <embeddings.json> --source <name> [--replace]');
        process.exit(1);
    }
    return { from, source, replace };
}
function isNumberArray(value) {
    return Array.isArray(value) && value.length > 0 && value.every(n => typeof n === 'number' && Number.isFinite(n));
}
function normalize(raw, source, index) {
    const content = raw.content ?? raw.text;
    const embedding = raw.embedding ?? raw.vector;
    if (typeof content !== 'string' || content.trim().length === 0) {
        throw new Error(`Entry ${index} has no "content" string.`);
    }
    if (!isNumberArray(embedding)) {
        throw new Error(`Entry ${index} has no numeric "embedding" array.`);
    }
    return {
        id: raw.id ? `${source}_${raw.id}` : `${source}_import_${index}`,
        content,
        embedding,
        page: raw.page ?? raw.metadata?.page ?? 0,
        chapter: raw.chapter ?? raw.metadata?.chapter ?? 'Imported',
    };
}
async function main() {
    const { from, source, replace } = parseArgs();
    console.log(`=== Import Embeddings: ${source} ===\n`);
    if (!fs.existsSync(from)) {
        console.error(`Error: File not found at ${from}`);
        process.exit(1);
    }
    if (sourceExists(source)) {
        if (!replace) {
            console.error(`Error: Source "${source}" already exists. Use --replace to re-import.`);
            process.exit(1);
        }
        console.log(`Replacing existing source "${source}"...`);
        console.log(`Removed ${removeSource(source)} existing chunks.`);
    }
    console.log(`Loading ${from}...`);
    const raw = JSON.parse(fs.readFileSync(from, 'utf-8'));
    if (!Array.isArray(raw)) {
        console.error('Error: Expected a JSON array of chunks.');
        process.exit(1);
    }
    const chunks = raw.map((entry, i) => normalize(entry, source, i));
    const ids = new Set(chunks.map(c => c.id));
    if (ids.size !== chunks.length) {
        console.error('Error: Duplicate chunk IDs detected. Provide unique "id" fields or import without them.');
        process.exit(1);
    }
    const dims = new Set(chunks.map(c => c.embedding.length));
    console.log(`Loaded ${chunks.length} chunks (embedding dim: ${[...dims].join(', ')}).`);
    if (dims.size > 1) {
        console.error('Error: Mixed embedding dimensions in input. All chunks must use the same embedding model.');
        process.exit(1);
    }
    console.log('Appending to embeddings.json...');
    const writer = openAppendWriter();
    try {
        for (const chunk of chunks) {
            writer.write({ ...chunk, source });
        }
    }
    finally {
        await writer.close();
    }
    saveSourceMetadata(source, chunks, 'imported');
    console.log(`\n=== Import Complete: ${chunks.length} chunks for source "${source}" ===`);
}
main().catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
});
