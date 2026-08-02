import OpenAI from 'openai';
import { env } from '../../config/env.js';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
    if (!env.OPENAI_API_KEY) return null;
    if (!client) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    return client;
}

export function embeddingsConfigured(): boolean {
    return Boolean(env.OPENAI_API_KEY && env.DISCOVERY_VECTOR_ENABLED);
}

/** Embed one or more texts. Returns null if embeddings are unavailable. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
    const openai = getClient();
    if (!openai || texts.length === 0) return null;

    const cleaned = texts.map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 8000));
    try {
        const res = await openai.embeddings.create({
            model: env.OPENAI_EMBEDDING_MODEL,
            input: cleaned,
        });
        const byIndex = new Map(res.data.map((d) => [d.index, d.embedding]));
        return cleaned.map((_, i) => byIndex.get(i) || []);
    } catch (err) {
        console.error('[Discovery] embedTexts failed:', err);
        return null;
    }
}

export async function embedText(text: string): Promise<number[] | null> {
    const vectors = await embedTexts([text]);
    const v = vectors?.[0];
    return v && v.length > 0 ? v : null;
}
