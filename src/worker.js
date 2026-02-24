// ============================================================
// PRAGNA — Web Worker: 8-Step Orchestration Pipeline
// Runs entirely off the main thread. Communicates via postMessage.
// ============================================================
import Dexie from 'dexie';
import {
    getStep2Prompt, getStep3Prompt, getStep4Prompt,
    getStep5Prompt, getStep6Prompt, getStep7Prompt,
    getStep8Prompt,
    FAN_OUT_STEPS,
} from './prompts.js';
import { chunkDocument } from './chunking.js';

// ======================== DATABASE (Worker copy) ========================
const db = new Dexie('PragnaDB');
db.version(1).stores({
    seeds: '++id, status, createdAt, *tags',
    steps: '++id, seedId, stepNum, subIndex, status',
    chunks: '++id, seedId, stepId, stepNum',
    settings: 'key',
});

// ======================== SETTINGS ========================
let settings = {};

async function loadSettings() {
    const records = await db.settings.toArray();
    settings = {};
    for (const r of records) {
        settings[r.key] = r.value;
    }
}

function getSetting(key, fallback = '') {
    const val = settings[key];
    if (val === undefined || val === null) return fallback;
    return val;
}

function getFanOutModels() {
    const raw = getSetting('fanOutModels', '["gpt-4o","claude-sonnet-4-20250514","gemini-2.0-flash"]');
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return ['gpt-4o'];
    }
}

// ======================== API CALLS ========================

// Inactivity timeout: abort if no SSE chunk received for 10 minutes
const STREAM_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Parse a single SSE line and extract the content delta.
 * Returns the text fragment or null if the line is not a content chunk.
 */
function parseSSEChunk(line) {
    if (!line.startsWith('data: ')) return null;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') return null;
    try {
        const obj = JSON.parse(payload);
        const delta = obj.choices?.[0]?.delta;
        if (!delta) return null;
        // Standard content, reasoning content, or refusal — take whichever exists
        return delta.content ?? delta.reasoning_content ?? delta.refusal ?? null;
    } catch {
        return null;
    }
}

/**
 * Call LiteLLM with streaming and exponential backoff retry.
 * Includes a per-chunk inactivity timeout — if no data arrives for
 * STREAM_TIMEOUT_MS, the request is aborted and retried.
 *
 * @param {string} model - The model identifier.
 * @param {Array} messages - The chat messages array.
 * @param {Object} [opts] - Optional settings.
 * @param {number} [opts.retries=3] - Number of retry attempts.
 * @param {Function} [opts.onToken] - Callback invoked with (accumulatedText) on each token.
 */
async function callLLM(model, messages, opts = {}) {
    const { retries = 3, onToken = null } = opts;
    const baseUrl = getSetting('litellmUrl', 'http://localhost:4000');
    const apiKey = getSetting('litellmApiKey', '');

    for (let attempt = 0; attempt < retries; attempt++) {
        const controller = new AbortController();
        let inactivityTimer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

        try {
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
                },
                body: JSON.stringify({
                    model,
                    messages,
                    max_tokens: 60000,
                    temperature: 0.7,
                    stream: true,
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                clearTimeout(inactivityTimer);
                const errText = await res.text().catch(() => '');
                throw new Error(`LLM API error ${res.status}: ${errText}`);
            }

            // Read the SSE stream
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            let buffer = ''; // Leftover partial line from previous chunk
            let tokenCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Reset inactivity timer on every received chunk
                clearTimeout(inactivityTimer);
                inactivityTimer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                // Keep the last element as it may be an incomplete line
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const fragment = parseSSEChunk(trimmed);
                    if (fragment) {
                        accumulated += fragment;
                        tokenCount++;
                        // Throttle onToken callbacks — fire every 5 tokens to avoid flooding
                        if (onToken && tokenCount % 5 === 0) {
                            onToken(accumulated);
                        }
                    }
                }
            }

            clearTimeout(inactivityTimer);

            // Process any remaining buffer
            if (buffer.trim()) {
                const fragment = parseSSEChunk(buffer.trim());
                if (fragment) {
                    accumulated += fragment;
                }
            }

            // If streaming produced nothing, try non-streaming fallback parse
            if (!accumulated && buffer.trim()) {
                try {
                    const fallback = JSON.parse(buffer.trim());
                    const msg = fallback.choices?.[0]?.message?.content;
                    if (msg) {
                        console.info(`Model ${model}: parsed as non-streaming response (fallback).`);
                        accumulated = msg;
                    }
                } catch { /* not valid JSON, ignore */ }
            }

            // Final callback with complete text
            if (onToken) {
                onToken(accumulated);
            }

            if (!accumulated) {
                console.warn(`LLM returned empty content for model ${model} (streamed).`);
            }
            return accumulated;
        } catch (err) {
            clearTimeout(inactivityTimer);
            console.warn(`callLLM attempt ${attempt + 1}/${retries} failed for ${model}:`, err.message);
            if (attempt < retries - 1) {
                const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw err;
            }
        }
    }
}

/**
 * Get embeddings via LiteLLM.
 */
async function embedText(text, retries = 3) {
    // Guard: Gemini rejects empty strings with 400
    if (!text || !text.trim()) return [];

    const baseUrl = getSetting('litellmUrl', 'http://localhost:4000');
    const apiKey = getSetting('litellmApiKey', '');
    const model = getSetting('embeddingModel', 'text-embedding-3-small');

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const res = await fetch(`${baseUrl}/v1/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
                },
                body: JSON.stringify({ model, input: text.trim() }),
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`Embedding API error ${res.status}: ${errText}`);
            }

            const data = await res.json();
            return data.data?.[0]?.embedding || [];
        } catch (err) {
            if (attempt < retries - 1) {
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw err;
            }
        }
    }
}

// ======================== PROGRESS ========================

function postProgress(seedId, step, detail, substep = null) {
    self.postMessage({
        type: 'PROGRESS',
        seedId,
        step,
        substep,
        detail,
    });
}

function postStreamToken(seedId, step, substep, model, text) {
    self.postMessage({
        type: 'STREAM_TOKEN',
        seedId,
        step,
        substep,
        model,
        text,
    });
}

function postError(seedId, step, error) {
    self.postMessage({
        type: 'ERROR',
        seedId,
        step,
        error: error?.message || String(error),
    });
}

function postComplete(seedId) {
    self.postMessage({ type: 'COMPLETE', seedId });
}

// ======================== CHUNKING & INDEXING ========================

async function chunkAndSave(seedId, stepId, stepNum, text) {
    const chunks = chunkDocument(text);
    const records = [];

    for (const chunk of chunks) {
        let vector = [];
        try {
            vector = await embedText(chunk.text);
        } catch (e) {
            console.warn('Embedding failed for chunk, continuing without vector:', e.message);
        }

        records.push({
            seedId,
            stepId,
            stepNum,
            text: chunk.text,
            vector,
            sectionHeader: chunk.header,
        });
    }

    if (records.length > 0) {
        await db.chunks.bulkAdd(records);
    }

    // Notify main thread to update FlexSearch index
    self.postMessage({
        type: 'CHUNKS_ADDED',
        seedId,
        stepNum,
        chunkCount: records.length,
    });
}

// ======================== BACKUP ========================

let backupHandle = null;

async function appendBackup(data) {
    if (!backupHandle) return;
    try {
        const writable = await backupHandle.createWritable({ keepExistingData: true });
        const file = await backupHandle.getFile();
        await writable.seek(file.size);
        await writable.write(JSON.stringify(data) + '\n');
        await writable.close();
    } catch (e) {
        console.warn('Backup append failed:', e.message);
    }
}

// ======================== STEP EXECUTION ========================

async function saveStepOutput(seedId, stepNum, subIndex, output, model, input = '') {
    const stepId = await db.steps.add({
        seedId,
        stepNum,
        subIndex,
        input,
        output,
        model,
        status: 'completed',
        createdAt: Date.now(),
    });

    return stepId;
}

async function updateSeedStatus(seedId, status) {
    await db.seeds.update(seedId, { status, updatedAt: Date.now() });
}

async function getExistingOutputs(seedId, stepNum) {
    const steps = await db.steps.where({ seedId, stepNum }).toArray();
    return steps;
}

/**
 * Execute a fan-out step (2, 4, 6): call multiple LLMs in parallel with streaming.
 * Uses Promise.allSettled (Tier 2 retry).
 */
async function executeFanOut(seedId, stepNum, promptFn) {
    const models = getFanOutModels();
    postProgress(seedId, stepNum, `Starting fan-out with ${models.length} models: ${models.join(', ')}`);

    const promises = models.map((model, idx) =>
        callLLM(model, [{ role: 'user', content: promptFn(model) }], {
            onToken: (text) => {
                postStreamToken(seedId, stepNum, idx, model, text);
            },
        })
            .then(output => {
                postProgress(seedId, stepNum, `${idx + 1}/${models.length} models responded...`, idx);
                return { model, output, status: 'fulfilled' };
            })
            .catch(err => {
                postProgress(seedId, stepNum, `Model ${model} failed: ${err.message}`, idx);
                return { model, output: null, status: 'rejected', error: err.message };
            })
    );

    const results = await Promise.allSettled(promises);
    const outputs = [];

    for (const result of results) {
        const data = result.status === 'fulfilled' ? result.value : result.reason;
        if (data && data.output != null && data.output !== '') {
            const stepId = await saveStepOutput(seedId, stepNum, outputs.length, data.output, data.model);
            await chunkAndSave(seedId, stepId, stepNum, data.output);
            outputs.push(data.output);
        } else {
            const modelName = data?.model || 'unknown';
            const reason = data?.error || (data?.output === '' ? 'empty response' : 'null output');
            console.error(`Fan-out step ${stepNum}: model "${modelName}" dropped — ${reason}`);
            postProgress(seedId, stepNum, `⚠️ Model ${modelName} failed: ${reason}`);
        }
    }

    if (outputs.length === 0) {
        throw new Error(`Fan-out step ${stepNum} failed: no models succeeded`);
    }

    postProgress(seedId, stepNum, `Completed: ${outputs.length}/${models.length} succeeded`);
    return outputs;
}

/**
 * Execute a consolidation step (3, 5, 7, 8) with streaming.
 */
async function executeConsolidation(seedId, stepNum, prompt, forceModel = null) {
    const model = forceModel || getSetting('consolidationModel', 'gpt-4o');
    postProgress(seedId, stepNum, `Running consolidation...`);

    const output = await callLLM(model, [{ role: 'user', content: prompt }], {
        onToken: (text) => {
            postStreamToken(seedId, stepNum, 0, model, text);
        },
    });

    const stepId = await saveStepOutput(seedId, stepNum, 0, output, model, prompt.slice(0, 200));
    await chunkAndSave(seedId, stepId, stepNum, output);

    postProgress(seedId, stepNum, 'Completed');
    return output;
}

// ======================== MAIN PIPELINE ========================

async function runPipeline(seedId, startFromStep = 1) {
    await loadSettings();

    const seed = await db.seeds.get(seedId);
    if (!seed) throw new Error(`Seed ${seedId} not found`);

    const seedText = seed.seed;

    try {
        // ---- STEP 1: Initialize ----
        if (startFromStep <= 1) {
            postProgress(seedId, 1, 'Initializing...');
            await updateSeedStatus(seedId, 'running_step_1');
            await updateSeedStatus(seedId, 'completed_step_1');
            await appendBackup({ seedId, step: 1, timestamp: Date.now(), data: { seed: seedText } });
            postProgress(seedId, 1, 'Completed');
        }

        // ---- STEP 2: Hypothesize (Fan-out) ----
        let step2Outputs;
        if (startFromStep <= 2) {
            await updateSeedStatus(seedId, 'running_step_2');
            step2Outputs = await executeFanOut(seedId, 2, () => getStep2Prompt(seedText));
            await updateSeedStatus(seedId, 'completed_step_2');
            await appendBackup({ seedId, step: 2, timestamp: Date.now(), data: { outputCount: step2Outputs.length } });
        } else {
            const existing = await getExistingOutputs(seedId, 2);
            step2Outputs = existing.map(s => s.output);
        }

        // ---- STEP 3: Consolidate ----
        let step3Output;
        if (startFromStep <= 3) {
            await updateSeedStatus(seedId, 'running_step_3');
            step3Output = await executeConsolidation(seedId, 3, getStep3Prompt(seedText, step2Outputs));
            await updateSeedStatus(seedId, 'completed_step_3');
            await appendBackup({ seedId, step: 3, timestamp: Date.now(), data: { outputLength: step3Output.length } });
        } else {
            const existing = await getExistingOutputs(seedId, 3);
            step3Output = existing[0]?.output || '';
        }

        // ---- STEP 4: Critique (Fan-out) ----
        let step4Outputs;
        if (startFromStep <= 4) {
            await updateSeedStatus(seedId, 'running_step_4');
            step4Outputs = await executeFanOut(seedId, 4, () => getStep4Prompt(seedText, step3Output));
            await updateSeedStatus(seedId, 'completed_step_4');
            await appendBackup({ seedId, step: 4, timestamp: Date.now(), data: { outputCount: step4Outputs.length } });
        } else {
            const existing = await getExistingOutputs(seedId, 4);
            step4Outputs = existing.map(s => s.output);
        }

        // ---- STEP 5: Assess ----
        let step5Output;
        if (startFromStep <= 5) {
            await updateSeedStatus(seedId, 'running_step_5');
            step5Output = await executeConsolidation(seedId, 5, getStep5Prompt(seedText, step4Outputs));
            await updateSeedStatus(seedId, 'completed_step_5');
            await appendBackup({ seedId, step: 5, timestamp: Date.now(), data: { outputLength: step5Output.length } });
        } else {
            const existing = await getExistingOutputs(seedId, 5);
            step5Output = existing[0]?.output || '';
        }

        // ---- STEP 6: Revise (Fan-out) ----
        let step6Outputs;
        if (startFromStep <= 6) {
            await updateSeedStatus(seedId, 'running_step_6');
            step6Outputs = await executeFanOut(seedId, 6, () => getStep6Prompt(seedText, step3Output, step5Output));
            await updateSeedStatus(seedId, 'completed_step_6');
            await appendBackup({ seedId, step: 6, timestamp: Date.now(), data: { outputCount: step6Outputs.length } });
        } else {
            const existing = await getExistingOutputs(seedId, 6);
            step6Outputs = existing.map(s => s.output);
        }

        // ---- STEP 7: Final Judge ----
        let step7Output;
        if (startFromStep <= 7) {
            await updateSeedStatus(seedId, 'running_step_7');
            step7Output = await executeConsolidation(seedId, 7, getStep7Prompt(seedText, step6Outputs));
            await updateSeedStatus(seedId, 'completed_step_7');
            await appendBackup({ seedId, step: 7, timestamp: Date.now(), data: { outputLength: step7Output.length } });
        } else {
            const existing = await getExistingOutputs(seedId, 7);
            step7Output = existing[0]?.output || '';
        }

        // ---- STEP 8: Simplify ----
        if (startFromStep <= 8) {
            await updateSeedStatus(seedId, 'running_step_8');
            const simplifierModel = getSetting('simplifierModel', 'gpt-4o');
            const step8Output = await executeConsolidation(seedId, 8, getStep8Prompt(step7Output), simplifierModel);
            await updateSeedStatus(seedId, 'completed');
            await appendBackup({ seedId, step: 8, timestamp: Date.now(), data: { outputLength: step8Output.length } });
        } else {
            await updateSeedStatus(seedId, 'completed');
        }

        postComplete(seedId);
    } catch (err) {
        const currentStep = (await db.seeds.get(seedId))?.status?.match(/running_step_(\d+)/)?.[1];
        const errorStep = currentStep ? parseInt(currentStep) : 0;
        await updateSeedStatus(seedId, `error_step_${errorStep}`);
        postError(seedId, errorStep, err);
    }
}

// ======================== MESSAGE HANDLER ========================

self.onmessage = async (e) => {
    const { type, seedId, startFromStep, fileHandle } = e.data;

    if (fileHandle) {
        backupHandle = fileHandle;
    }

    switch (type) {
        case 'START':
            await runPipeline(seedId, 1);
            break;
        case 'RESUME':
            await runPipeline(seedId, startFromStep || 1);
            break;
        case 'SETTINGS_UPDATED':
            await loadSettings();
            break;
        default:
            console.warn('Worker: unknown message type', type);
    }
};
