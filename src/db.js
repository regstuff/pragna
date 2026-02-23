// ============================================================
// PRAGNA — Dexie Database Schema
// ============================================================
import Dexie from 'dexie';

export const db = new Dexie('PragnaDB');

db.version(1).stores({
    seeds: '++id, status, createdAt, *tags',
    steps: '++id, seedId, stepNum, subIndex, status',
    chunks: '++id, seedId, stepId, stepNum',
    settings: 'key',
});

// ======================== SEED HELPERS ========================

export async function createSeed(seedText, tags = []) {
    const now = Date.now();
    const title = seedText.slice(0, 120).replace(/\n/g, ' ');
    const id = await db.seeds.add({
        seed: seedText,
        title,
        status: 'initialized',
        tags,
        createdAt: now,
        updatedAt: now,
    });
    return id;
}

export async function getSeed(id) {
    return db.seeds.get(id);
}

export async function getAllSeeds() {
    return db.seeds.orderBy('createdAt').reverse().toArray();
}

export async function updateSeedStatus(id, status) {
    return db.seeds.update(id, { status, updatedAt: Date.now() });
}

export async function updateSeedTags(id, tags) {
    return db.seeds.update(id, { tags, updatedAt: Date.now() });
}

export async function deleteSeed(id) {
    await db.transaction('rw', [db.seeds, db.steps, db.chunks], async () => {
        await db.chunks.where('seedId').equals(id).delete();
        await db.steps.where('seedId').equals(id).delete();
        await db.seeds.delete(id);
    });
}

// ======================== STEP HELPERS ========================

export async function saveStep(data) {
    const record = {
        seedId: data.seedId,
        stepNum: data.stepNum,
        subIndex: data.subIndex ?? 0,
        input: data.input || '',
        output: data.output || '',
        model: data.model || '',
        status: data.status || 'completed',
        createdAt: Date.now(),
    };
    return db.steps.add(record);
}

export async function getStepsForSeed(seedId) {
    return db.steps.where('seedId').equals(seedId).sortBy('stepNum');
}

export async function getStepOutputs(seedId, stepNum) {
    return db.steps
        .where({ seedId, stepNum })
        .toArray();
}

export async function deleteDownstreamSteps(seedId, fromStep) {
    await db.transaction('rw', [db.steps, db.chunks], async () => {
        // Get step IDs to delete for chunk cleanup
        const stepsToDelete = await db.steps
            .where('seedId').equals(seedId)
            .filter(s => s.stepNum >= fromStep)
            .toArray();
        const stepIds = stepsToDelete.map(s => s.id);

        // Delete chunks
        for (const sid of stepIds) {
            await db.chunks.where('stepId').equals(sid).delete();
        }

        // Delete steps
        await db.steps
            .where('seedId').equals(seedId)
            .filter(s => s.stepNum >= fromStep)
            .delete();
    });
}

// ======================== CHUNK HELPERS ========================

export async function saveChunks(chunks) {
    return db.chunks.bulkAdd(chunks);
}

export async function getChunksForSeed(seedId) {
    return db.chunks.where('seedId').equals(seedId).toArray();
}

export async function getChunksForStep(stepId) {
    return db.chunks.where('stepId').equals(stepId).toArray();
}

export async function deleteChunksForStep(stepId) {
    return db.chunks.where('stepId').equals(stepId).delete();
}

export async function getAllChunks() {
    return db.chunks.toArray();
}

// ======================== SETTINGS HELPERS ========================

export async function getSetting(key) {
    const record = await db.settings.get(key);
    return record?.value ?? null;
}

export async function setSetting(key, value) {
    return db.settings.put({ key, value });
}

export async function getAllSettings() {
    const records = await db.settings.toArray();
    const obj = {};
    for (const r of records) {
        obj[r.key] = r.value;
    }
    return obj;
}

// Default settings
export const DEFAULT_SETTINGS = {
    litellmUrl: 'http://localhost:4000',
    litellmApiKey: '',
    fanOutModels: ['gpt-4o', 'claude-sonnet-4-20250514', 'gemini-2.0-flash'],
    consolidationModel: 'gpt-4o',
    simplifierModel: 'gpt-4o',
    embeddingModel: 'text-embedding-3-small',
};

export async function initDefaultSettings() {
    const existing = await getAllSettings();
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (!(key in existing)) {
            await setSetting(key, typeof value === 'object' ? JSON.stringify(value) : value);
        }
    }
}

// ======================== FULL DB EXPORT / IMPORT ========================

/**
 * Export ALL data (seeds, steps, chunks, settings) as a JSONL string.
 */
export async function exportDatabase() {
    const lines = [];
    const seeds = await db.seeds.toArray();
    for (const s of seeds) lines.push(JSON.stringify({ _type: 'seed', ...s }));

    const steps = await db.steps.toArray();
    for (const s of steps) lines.push(JSON.stringify({ _type: 'step', ...s }));

    const chunks = await db.chunks.toArray();
    for (const c of chunks) lines.push(JSON.stringify({ _type: 'chunk', ...c }));

    const settings = await db.settings.toArray();
    for (const s of settings) lines.push(JSON.stringify({ _type: 'setting', ...s }));

    return lines.join('\n');
}

/**
 * Import a JSONL string, replacing all current data.
 */
export async function importDatabase(jsonlText) {
    const lines = jsonlText.split('\n').filter(l => l.trim());
    const records = lines.map(l => JSON.parse(l));

    await db.transaction('rw', [db.seeds, db.steps, db.chunks, db.settings], async () => {
        // Clear everything
        await db.seeds.clear();
        await db.steps.clear();
        await db.chunks.clear();
        await db.settings.clear();

        for (const rec of records) {
            const type = rec._type;
            delete rec._type;

            switch (type) {
                case 'seed':
                    await db.seeds.add(rec);
                    break;
                case 'step':
                    await db.steps.add(rec);
                    break;
                case 'chunk':
                    await db.chunks.add(rec);
                    break;
                case 'setting':
                    await db.settings.put(rec);
                    break;
            }
        }
    });
}
