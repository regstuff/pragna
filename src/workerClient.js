// ============================================================
// PRAGNA — Worker Client
// Main-thread wrapper for communicating with the Web Worker.
// Spawns a new worker per pipeline run to allow concurrent seeds.
// ============================================================

/** @type {Map<number, Worker>} Active workers keyed by seedId */
const workers = new Map();

let progressCallbacks = [];
let errorCallbacks = [];
let completeCallbacks = [];
let chunksCallbacks = [];
let streamCallbacks = [];

function createWorker(seedId) {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = handleMessage;
    w.onerror = (e) => {
        console.error(`Worker error (seed ${seedId}):`, e);
        workers.delete(seedId);
        errorCallbacks.forEach(cb => cb({ seedId, step: 0, error: e.message }));
    };
    workers.set(seedId, w);
    return w;
}

function handleMessage(e) {
    const msg = e.data;
    switch (msg.type) {
        case 'PROGRESS':
            progressCallbacks.forEach(cb => cb(msg));
            break;
        case 'STREAM_TOKEN':
            streamCallbacks.forEach(cb => cb(msg));
            break;
        case 'ERROR':
            workers.delete(msg.seedId);
            errorCallbacks.forEach(cb => cb(msg));
            break;
        case 'COMPLETE':
            // Terminate the worker now that the pipeline is done
            const doneWorker = workers.get(msg.seedId);
            if (doneWorker) {
                doneWorker.terminate();
                workers.delete(msg.seedId);
            }
            completeCallbacks.forEach(cb => cb(msg));
            break;
        case 'CHUNKS_ADDED':
            chunksCallbacks.forEach(cb => cb(msg));
            break;
    }
}

/**
 * Start the pipeline for a seed. Creates a new dedicated worker.
 */
export function startPipeline(seedId, fileHandle = null) {
    // If a worker already exists for this seed, terminate it first
    stopPipeline(seedId);
    const w = createWorker(seedId);
    w.postMessage({ type: 'START', seedId, fileHandle });
}

/**
 * Resume a failed/interrupted pipeline. Creates a new dedicated worker.
 */
export function resumePipeline(seedId, startFromStep, fileHandle = null) {
    stopPipeline(seedId);
    const w = createWorker(seedId);
    w.postMessage({ type: 'RESUME', seedId, startFromStep, fileHandle });
}

/**
 * Notify ALL running workers that settings have changed.
 */
export function notifySettingsUpdate() {
    for (const w of workers.values()) {
        w.postMessage({ type: 'SETTINGS_UPDATED' });
    }
}

/**
 * Register a progress callback.
 */
export function onProgress(callback) {
    progressCallbacks.push(callback);
    return () => {
        progressCallbacks = progressCallbacks.filter(cb => cb !== callback);
    };
}

/**
 * Register an error callback.
 */
export function onError(callback) {
    errorCallbacks.push(callback);
    return () => {
        errorCallbacks = errorCallbacks.filter(cb => cb !== callback);
    };
}

/**
 * Register a completion callback.
 */
export function onComplete(callback) {
    completeCallbacks.push(callback);
    return () => {
        completeCallbacks = completeCallbacks.filter(cb => cb !== callback);
    };
}

/**
 * Register a chunks-added callback (for updating FlexSearch on main thread).
 */
export function onChunksAdded(callback) {
    chunksCallbacks.push(callback);
    return () => {
        chunksCallbacks = chunksCallbacks.filter(cb => cb !== callback);
    };
}

/**
 * Register a streaming token callback (for real-time LLM output preview).
 */
export function onStreamToken(callback) {
    streamCallbacks.push(callback);
    return () => {
        streamCallbacks = streamCallbacks.filter(cb => cb !== callback);
    };
}

/**
 * Check if any pipeline is currently running.
 */
export function isRunning() {
    return workers.size > 0;
}

/**
 * Stop a specific seed's pipeline by terminating its worker.
 * If no seedId is provided, stops all workers.
 */
export function stopPipeline(seedId = null) {
    if (seedId != null) {
        const w = workers.get(seedId);
        if (w) {
            w.terminate();
            workers.delete(seedId);
        }
    } else {
        for (const [id, w] of workers.entries()) {
            w.terminate();
            workers.delete(id);
        }
    }
}

/**
 * Terminate all workers (cleanup).
 */
export function terminateWorker() {
    stopPipeline();
}
