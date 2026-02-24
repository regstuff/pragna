<script>
  import { onMount, onDestroy } from 'svelte';
  import { currentView, settingsOpen, activeSeeds, seedsChanged, stepUpdateTick, streamingTokens, cachedChunks } from './stores.js';
  import { initDefaultSettings, getAllChunks } from './db.js';
  import { initSearchIndex, bulkAddToIndex } from './search.js';
  import { isRunning, onProgress, onError, onComplete, onChunksAdded, onStreamToken, stopPipeline } from './workerClient.js';
  import SettingsModal from './components/SettingsModal.svelte';
  import Dashboard from './components/Dashboard.svelte';
  import Workspace from './components/Workspace.svelte';

  let view = $state('dashboard');
  let showSettings = $state(false);

  // Subscribe to stores
  const unsubView = currentView.subscribe(v => view = v);
  const unsubSettings = settingsOpen.subscribe(v => showSettings = v);

  // Before unload warning
  function handleBeforeUnload(e) {
    if (isRunning()) {
      e.preventDefault();
      e.returnValue = 'A research pipeline is still running. Are you sure you want to leave?';
      return e.returnValue;
    }
  }

  // Worker event handlers
  let unsubProgress, unsubError, unsubComplete, unsubChunks, unsubStream;

  onMount(async () => {
    // Initialize default settings
    await initDefaultSettings();

    // Initialize search index and load existing chunks into memory cache
    initSearchIndex();
    try {
      const chunks = await getAllChunks();
      cachedChunks.set(chunks);
      if (chunks.length > 0) {
        bulkAddToIndex(chunks);
      }
    } catch (e) {
      console.warn('Failed to load chunks into search index:', e);
    }

    // Register worker event handlers
    unsubProgress = onProgress((msg) => {
      activeSeeds.update(seeds => {
        const prev = seeds[msg.seedId];
        // Clear streaming tokens when transitioning to a new step
        if (prev && prev.step !== msg.step) {
          streamingTokens.update(tokens => {
            const copy = { ...tokens };
            for (const key of Object.keys(copy)) {
              if (key.startsWith(`${msg.seedId}-`)) {
                delete copy[key];
              }
            }
            return copy;
          });
        }
        return {
          ...seeds,
          [msg.seedId]: {
            step: msg.step,
            substep: msg.substep,
            detail: msg.detail,
            status: 'running',
          }
        };
      });
      // Signal ReadingPane to re-fetch steps
      stepUpdateTick.update(n => n + 1);
    });

    unsubStream = onStreamToken((msg) => {
      const key = `${msg.seedId}-${msg.step}-${msg.substep}`;
      streamingTokens.update(tokens => ({
        ...tokens,
        [key]: {
          model: msg.model,
          text: msg.text,
          step: msg.step,
          substep: msg.substep,
          seedId: msg.seedId,
        }
      }));
    });

    unsubError = onError((msg) => {
      activeSeeds.update(seeds => ({
        ...seeds,
        [msg.seedId]: {
          step: msg.step,
          detail: msg.error,
          status: 'error',
        }
      }));
      stepUpdateTick.update(n => n + 1);
      seedsChanged.update(n => n + 1);
    });

    unsubComplete = onComplete((msg) => {
      activeSeeds.update(seeds => {
        const copy = { ...seeds };
        delete copy[msg.seedId];
        return copy;
      });
      // Clear streaming tokens for this seed
      streamingTokens.update(tokens => {
        const copy = { ...tokens };
        for (const key of Object.keys(copy)) {
          if (key.startsWith(`${msg.seedId}-`)) {
            delete copy[key];
          }
        }
        return copy;
      });
      stepUpdateTick.update(n => n + 1);
      seedsChanged.update(n => n + 1);
    });

    unsubChunks = onChunksAdded(async (msg) => {
      // Reload chunks from Dexie, update in-memory cache and FlexSearch
      try {
        const { getAllChunks } = await import('./db.js');
        const { bulkAddToIndex, initSearchIndex } = await import('./search.js');
        const chunks = await getAllChunks();
        cachedChunks.set(chunks);
        initSearchIndex();
        bulkAddToIndex(chunks);
      } catch (e) {
        console.warn('Failed to update search index:', e);
      }
    });

    window.addEventListener('beforeunload', handleBeforeUnload);
  });

  onDestroy(() => {
    unsubView?.();
    unsubSettings?.();
    unsubProgress?.();
    unsubError?.();
    unsubComplete?.();
    unsubChunks?.();
    unsubStream?.();
    window.removeEventListener('beforeunload', handleBeforeUnload);
  });

  function switchView(v) {
    currentView.set(v);
  }
</script>

<div class="app-shell">
  <!-- Navigation Bar -->
  <nav class="nav-bar">
    <div class="nav-brand">
      <div class="brand-icon brand-icon-img">
        <img src="logo.png" alt="Pragna logo" />
      </div>
      <span>Pragna</span>
    </div>

    <div class="nav-links">
      <button
        class="btn btn-ghost btn-sm"
        class:active-nav={view === 'dashboard'}
        onclick={() => switchView('dashboard')}
      >
        <span>🏠</span> Dashboard
      </button>
      <button
        class="btn btn-ghost btn-sm"
        class:active-nav={view === 'workspace'}
        onclick={() => switchView('workspace')}
      >
        <span>📚</span> Workspace
      </button>
      <button
        class="btn btn-ghost btn-icon"
        onclick={() => settingsOpen.set(true)}
        title="Settings"
      >
        ⚙️
      </button>
    </div>
  </nav>

  <!-- Main Content -->
  {#if view === 'dashboard'}
    <Dashboard />
  {:else}
    <Workspace />
  {/if}

  <!-- Settings Modal -->
  {#if showSettings}
    <SettingsModal />
  {/if}
</div>

<style>
  .active-nav {
    background: var(--primary-container) !important;
    color: var(--on-primary-container) !important;
    font-weight: 600 !important;
  }
</style>
