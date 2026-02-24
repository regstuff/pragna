// ============================================================
// PRAGNA — Worker Client
// Main-thread wrapper for communicating with the Web Worker
// ============================================================

let worker = null;
let progressCallbacks = [];
let errorCallbacks = [];
let completeCallbacks = [];
let chunksCallbacks = [];
let streamCallbacks = [];
let running = false;

function ensureWorker() {
    if (!worker) {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = handleMessage;
        worker.onerror = (e) => {
            console.error('Worker error:', e);
            running = false;
            errorCallbacks.forEach(cb => cb({ step: 0, error: e.message }));
        };
    }
    return worker;
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
            running = false;
            errorCallbacks.forEach(cb => cb(msg));
            break;
        case 'COMPLETE':
            running = false;
            completeCallbacks.forEach(cb => cb(msg));
            break;
        case 'CHUNKS_ADDED':
            chunksCallbacks.forEach(cb => cb(msg));
            break;
    }
}

/**
 * Start the pipeline for a seed.
 */
export function startPipeline(seedId, fileHandle = null) {
    const w = ensureWorker();
    running = true;
    w.postMessage({ type: 'START', seedId, fileHandle });
}

/**
 * Resume a failed/interrupted pipeline.
 */
export function resumePipeline(seedId, startFromStep, fileHandle = null) {
    const w = ensureWorker();
    running = true;
    w.postMessage({ type: 'RESUME', seedId, startFromStep, fileHandle });
}

/**
 * Notify worker that settings have changed.
 */
export function notifySettingsUpdate() {
    if (worker) {
        worker.postMessage({ type: 'SETTINGS_UPDATED' });
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
 * Check if a pipeline is currently running.
 */
export function isRunning() {
    return running;
}

/**
 * Stop the currently running pipeline by terminating the worker.
 * Returns the seedId that was stopped (if any).
 */
export function stopPipeline() {
    if (worker) {
        worker.terminate();
        worker = null;
        running = false;
    }
}

/**
 * Terminate the worker (cleanup).
 */
export function terminateWorker() {
    if (worker) {
        worker.terminate();
        worker = null;
        running = false;
    }
}
