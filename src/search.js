// ============================================================
// PRAGNA — Hybrid Search (FlexSearch + Cosine Sim + RRF)
// ============================================================
import FlexSearch from 'flexsearch';

let index = null;

/**
 * Initialize (or reinitialize) the FlexSearch index.
 */
export function initSearchIndex() {
    index = new FlexSearch.Document({
        document: {
            id: 'id',
            index: ['text'],
            store: ['text', 'seedId', 'stepNum', 'sectionHeader'],
        },
        tokenize: 'forward',
        resolution: 9,
    });
}

/**
 * Add a chunk to the FlexSearch index.
 */
export function addToIndex(chunk) {
    if (!index) initSearchIndex();
    index.add({
        id: chunk.id,
        text: chunk.text,
        seedId: chunk.seedId,
        stepNum: chunk.stepNum,
        sectionHeader: chunk.sectionHeader || '',
    });
}

/**
 * Remove a chunk from the FlexSearch index by ID.
 */
export function removeFromIndex(chunkId) {
    if (!index) return;
    index.remove(chunkId);
}

/**
 * Bulk-load chunks into the index (used on app init).
 */
export function bulkAddToIndex(chunks) {
    if (!index) initSearchIndex();
    for (const chunk of chunks) {
        addToIndex(chunk);
    }
}

/**
 * Full-text search via FlexSearch.
 * Returns array of { id, score } ranked by relevance.
 */
export function fullTextSearch(query) {
    if (!index) return [];
    const results = index.search(query, { limit: 200, enrich: true });
    // FlexSearch Document returns nested structure
    const seen = new Map();
    for (const field of results) {
        if (!field.result) continue;
        for (let rank = 0; rank < field.result.length; rank++) {
            const item = field.result[rank];
            const id = item.id ?? item;
            if (!seen.has(id)) {
                seen.set(id, { id, rank, doc: item.doc || null });
            }
        }
    }
    return Array.from(seen.values()).sort((a, b) => a.rank - b.rank);
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * Semantic search using cosine similarity.
 * Returns array of { id, similarity } sorted desc.
 */
export function semanticSearch(queryVec, allChunks) {
    if (!queryVec || !allChunks.length) return [];

    const scored = allChunks
        .filter(c => c.vector && c.vector.length > 0)
        .map(c => ({
            id: c.id,
            seedId: c.seedId,
            stepNum: c.stepNum,
            text: c.text,
            sectionHeader: c.sectionHeader,
            similarity: cosineSimilarity(queryVec, c.vector),
        }))
        .sort((a, b) => b.similarity - a.similarity);

    return scored;
}

/**
 * Reciprocal Rank Fusion: Score = 1 / (k + rank)
 */
function rrfScore(rank, k = 60) {
    return 1 / (k + rank);
}

/**
 * Hybrid Search: combine FlexSearch + Semantic results using RRF.
 * Then max-pool by seedId.
 *
 * @param {string} query - The search query text
 * @param {number[]} queryVec - The query embedding vector (may be null)
 * @param {Array} allChunks - All chunks from Dexie (with vectors)
 * @returns {Array<{seedId, score, snippetText, chunkId, sectionHeader}>}
 */
export function hybridSearch(query, queryVec, allChunks) {
    // 1. Full-text search
    const ftsResults = fullTextSearch(query);

    // 2. Semantic search
    const semResults = queryVec ? semanticSearch(queryVec, allChunks) : [];

    // 3. Build RRF score map: chunkId -> combined score
    const scoreMap = new Map(); // chunkId -> { score, text, seedId, sectionHeader }

    // Map chunkId to chunk data for later
    const chunkMap = new Map();
    for (const c of allChunks) {
        chunkMap.set(c.id, c);
    }

    // FTS contributions
    for (let i = 0; i < ftsResults.length; i++) {
        const id = ftsResults[i].id;
        const chunk = chunkMap.get(id);
        if (!chunk) continue;
        const existing = scoreMap.get(id) || {
            score: 0,
            text: chunk.text,
            seedId: chunk.seedId,
            sectionHeader: chunk.sectionHeader || '',
        };
        existing.score += rrfScore(i);
        scoreMap.set(id, existing);
    }

    // Semantic contributions
    for (let i = 0; i < semResults.length; i++) {
        const id = semResults[i].id;
        const existing = scoreMap.get(id) || {
            score: 0,
            text: semResults[i].text,
            seedId: semResults[i].seedId,
            sectionHeader: semResults[i].sectionHeader || '',
        };
        existing.score += rrfScore(i);
        scoreMap.set(id, existing);
    }

    // 4. Max-pool by seedId
    const seedScores = new Map(); // seedId -> { score, snippetText, chunkId, sectionHeader }

    for (const [chunkId, data] of scoreMap.entries()) {
        const existing = seedScores.get(data.seedId);
        if (!existing || data.score > existing.score) {
            seedScores.set(data.seedId, {
                seedId: data.seedId,
                score: data.score,
                snippetText: data.text?.slice(0, 300) || '',
                chunkId,
                sectionHeader: data.sectionHeader,
            });
        }
    }

    // 5. Sort by score descending
    return Array.from(seedScores.values()).sort((a, b) => b.score - a.score);
}
