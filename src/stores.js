// ============================================================
// PRAGNA — Svelte Stores
// ============================================================
import { writable } from 'svelte/store';

// Current view: 'dashboard' or 'workspace'
export const currentView = writable('dashboard');

// Currently selected seed in workspace
export const selectedSeedId = writable(null);

// Active running seeds: Map<seedId, { step, substep, detail, status }>
export const activeSeeds = writable({});

// Search results
export const searchResults = writable([]);

// Settings modal open state
export const settingsOpen = writable(false);

// Search query text
export const searchQuery = writable('');

// Selected tags for workspace filtering
export const selectedTags = writable([]);

// Signal for seed list refresh (incremented when seeds change)
export const seedsChanged = writable(0);

// Persistent backup file handle (survives navigation between views)
export const backupFileHandle = writable(null);

// Tick counter that increments on every worker step completion (for live ReadingPane updates)
export const stepUpdateTick = writable(0);

// Live streaming tokens from LLM calls: Map<string, { model, text, step, substep }>
// Key format: `${seedId}-${step}-${substep}`
export const streamingTokens = writable({});
