import { Ollama } from 'ollama';
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
const ollama = new Ollama({ host: OLLAMA_HOST });
export async function generateEmbedding(text) {
    const response = await ollama.embed({
        model: EMBEDDING_MODEL,
        input: text,
    });
    return response.embeddings[0];
}
export async function generateEmbeddings(texts) {
    const response = await ollama.embed({
        model: EMBEDDING_MODEL,
        input: texts,
    });
    return response.embeddings;
}
export async function checkOllamaConnection() {
    try {
        const response = await ollama.list();
        const hasModel = response.models.some(m => m.name.includes(EMBEDDING_MODEL));
        if (!hasModel) {
            console.error(`${EMBEDDING_MODEL} model not found. Run: ollama pull ${EMBEDDING_MODEL}`);
            return false;
        }
        return true;
    }
    catch (error) {
        console.error(`Ollama connection failed (${OLLAMA_HOST}). Make sure Ollama is running: brew services start ollama`);
        return false;
    }
}
