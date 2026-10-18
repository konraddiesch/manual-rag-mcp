import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { checkOllamaConnection, generateEmbeddings } from './embeddings.js';
import { DATA_DIR, Chunk, openAppendWriter, removeSource, saveSourceMetadata, sourceExists } from './store.js';

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const BATCH_SIZE = 5;

const CHAPTER_PATTERNS = [
  /^chapter\s+\d+[\s.:\-]/i,
  /^part\s+\d+[\s.:\-]/i,
  /^section\s+\d+[\s.:\-]/i,
  /^\d+\.\s+[A-Z][\w/&,:()''\\-]{3,}$/,
  /^[A-Z][A-Z0-9][A-Z0-9\s/&,:()''\\-]{5,}$/,
];

const SECTION_PATTERNS = [
  /^\d+\.\d+\s+[A-Z][\w/&,:()''\\-]{3,}$/,
];

function normalizeHeading(line: string): string {
  return line.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function isLikelyHeading(line: string, patterns: RegExp[], maxWords: number): boolean {
  const trimmed = normalizeHeading(line);
  if (trimmed.length < 5 || trimmed.length > 120) return false;
  if (/^\d+$/.test(trimmed) || /^page\s+\d+/i.test(trimmed)) return false;
  if (trimmed.split(' ').length > maxWords) return false;
  const alphaChars = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (alphaChars < 4) return false;
  return patterns.some(pattern => pattern.test(trimmed));
}

function detectChapter(line: string): string | null {
  if (isLikelyHeading(line, CHAPTER_PATTERNS, 10)) {
    return normalizeHeading(line);
  }
  return null;
}

function detectSection(line: string): string | null {
  if (isLikelyHeading(line, SECTION_PATTERNS, 8)) {
    return normalizeHeading(line);
  }
  return null;
}

function parseArgs(): { pdf: string; source: string; chunkSize: number; overlap: number; replace: boolean } {
  const args = process.argv.slice(2);
  let pdf = '';
  let source = '';
  let chunkSize = CHUNK_SIZE;
  let overlap = CHUNK_OVERLAP;
  let replace = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pdf': pdf = args[++i]; break;
      case '--source': source = args[++i]; break;
      case '--chunk-size': chunkSize = parseInt(args[++i], 10); break;
      case '--overlap': overlap = parseInt(args[++i], 10); break;
      case '--replace': replace = true; break;
    }
  }

  if (!pdf || !source) {
    console.error('Usage: node build/ingest.js --pdf <path> --source <name> [--chunk-size N] [--overlap N] [--replace]');
    process.exit(1);
  }

  return { pdf, source, chunkSize, overlap, replace };
}

function extractTextFromPDF(pdfPath: string, source: string): string {
  const textPath = path.join(DATA_DIR, `${source}.txt`);

  if (fs.existsSync(textPath)) {
    console.log('Using cached text extraction...');
    return textPath;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log('Extracting text from PDF...');
  try {
    execSync(`pdftotext -layout "${pdfPath}" "${textPath}"`, {
      maxBuffer: 1024 * 1024 * 500,
    });
    console.log('Text extraction complete');
  } catch (error) {
    throw new Error(`Failed to extract text: ${error}`);
  }

  return textPath;
}

async function processChunksStreaming(textPath: string, source: string, chunkSize: number, overlap: number): Promise<Chunk[]> {
  console.log('Processing text into chunks (streaming)...');

  const chunks: Chunk[] = [];
  let currentChapter = 'Introduction';
  let chunkIndex = 0;
  let pageNum = 1;
  let currentChunkLines: string[] = [];
  let currentChunkLength = 0;

  const fileStream = fs.createReadStream(textPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('\f')) {
      pageNum++;
      if (currentChunkLength >= 50) {
        chunks.push({
          id: `${source}_chunk_${chunkIndex++}`,
          content: currentChunkLines.join('\n').trim(),
          page: pageNum - 1,
          chapter: currentChapter,
        });
      }
      currentChunkLines = [];
      currentChunkLength = 0;
      continue;
    }

    const chapter = detectChapter(line);
    if (chapter) {
      currentChapter = chapter;
    } else {
      const section = detectSection(line);
      if (section && currentChapter === 'Introduction') {
        currentChapter = section;
      }
    }

    currentChunkLines.push(line);
    currentChunkLength += line.length + 1;

    if (currentChunkLength >= chunkSize) {
      const content = currentChunkLines.join('\n').trim();
      if (content.length >= 50) {
        chunks.push({
          id: `${source}_chunk_${chunkIndex++}`,
          content,
          page: pageNum,
          chapter: currentChapter,
        });
      }

      const overlapLines: string[] = [];
      let overlapLength = 0;
      for (let i = currentChunkLines.length - 1; i >= 0 && overlapLength < overlap; i--) {
        overlapLines.unshift(currentChunkLines[i]);
        overlapLength += currentChunkLines[i].length + 1;
      }
      currentChunkLines = overlapLines;
      currentChunkLength = overlapLength;
    }
  }

  if (currentChunkLength >= 50) {
    chunks.push({
      id: `${source}_chunk_${chunkIndex++}`,
      content: currentChunkLines.join('\n').trim(),
      page: pageNum,
      chapter: currentChapter,
    });
  }

  console.log(`Created ${chunks.length} chunks`);
  return chunks;
}

async function embedAndAppend(chunks: Chunk[], source: string): Promise<void> {
  console.log('Generating embeddings and appending to embeddings.json...');

  const writer = openAppendWriter();
  try {
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}...`);
      const embeddings = await generateEmbeddings(batch.map(c => c.content));

      for (let j = 0; j < batch.length; j++) {
        writer.write({ ...batch[j], source, embedding: embeddings[j] });
      }
    }
  } finally {
    await writer.close();
  }

  console.log('Embeddings written to embeddings.json');
}

async function main(): Promise<void> {
  const { pdf, source, chunkSize, overlap, replace } = parseArgs();

  console.log(`=== Manual Ingestion: ${source} ===\n`);

  if (sourceExists(source)) {
    if (!replace) {
      console.error(`Error: Source "${source}" already exists. Use --replace to re-ingest.`);
      process.exit(1);
    }
    console.log(`Replacing existing source "${source}"...`);
    const removed = removeSource(source);
    console.log(`Removed ${removed} existing chunks.`);
  }

  if (!fs.existsSync(pdf)) {
    console.error(`Error: PDF not found at ${pdf}`);
    process.exit(1);
  }

  const ollamaOk = await checkOllamaConnection();
  if (!ollamaOk) {
    process.exit(1);
  }

  try {
    const textPath = extractTextFromPDF(pdf, source);
    const chunks = await processChunksStreaming(textPath, source, chunkSize, overlap);
    await embedAndAppend(chunks, source);
    saveSourceMetadata(source, chunks, 'ingested');

    console.log(`\n=== Ingestion Complete: ${chunks.length} chunks for source "${source}" ===`);
  } catch (error) {
    console.error('Ingestion failed:', error);
    process.exit(1);
  }
}

main();
