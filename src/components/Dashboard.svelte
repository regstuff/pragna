<script>
  import { onMount, onDestroy } from 'svelte';
  import { activeSeeds, currentView, selectedSeedId, seedsChanged, backupFileHandle, streamingTokens } from '../stores.js';
  import { createSeed, getAllSeeds, updateSeedStatus, updateSeedTags, exportDatabase, importDatabase } from '../db.js';
  import { startPipeline, resumePipeline, stopPipeline } from '../workerClient.js';
  import Stepper from './Stepper.svelte';

  let seedText = $state('');
  let seedTags = $state('');
  let seeds = $state([]);
  let activeSeedMap = $state({});
  let initializing = $state(false);
  let storedHandle = $state(null);
  let changeCounter = $state(0);
  let importing = $state(false);
  let exporting = $state(false);
  let tokenMap = $state({});

  const unsubActive = activeSeeds.subscribe(v => activeSeedMap = v);
  const unsubHandle = backupFileHandle.subscribe(v => storedHandle = v);
  const unsubTokens = streamingTokens.subscribe(v => tokenMap = v);
  const unsubChanged = seedsChanged.subscribe(v => {
    changeCounter = v;
    loadSeeds();
  });

  onMount(async () => {
    await loadSeeds();
  });

  onDestroy(() => {
    unsubActive?.();
    unsubHandle?.();
    unsubTokens?.();
    unsubChanged?.();
  });

  async function loadSeeds() {
    seeds = await getAllSeeds();
  }

  async function selectBackupFile() {
    if (!('showSaveFilePicker' in window)) return null;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'pragna-backup.jsonl',
        types: [{
          description: 'JSONL Backup',
          accept: { 'application/jsonl': ['.jsonl'] },
        }],
      });
      backupFileHandle.set(handle);
      return handle;
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('Backup file selection failed:', e);
      return null;
    }
  }

  async function handleInitialize() {
    if (!seedText.trim()) return;

    // Use stored handle or ask once. Do this FIRST to preserve user-gesture token for strict browsers (like Brave/Safari)
    let fileHandle = storedHandle;
    if (!fileHandle && 'showSaveFilePicker' in window) {
      fileHandle = await selectBackupFile();
    }
    
    initializing = true;

    try {

      const seedId = await createSeed(seedText.trim());

      // Save tags if provided
      if (seedTags.trim()) {
        const tags = seedTags.split(',').map(t => t.trim()).filter(Boolean);
        if (tags.length > 0) {
          await updateSeedTags(seedId, tags);
        }
      }

      startPipeline(seedId, fileHandle);

      activeSeeds.update(s => ({
        ...s,
        [seedId]: { step: 1, substep: null, detail: 'Initializing...', status: 'running' }
      }));

      seedText = '';
      seedTags = '';
      seedsChanged.update(n => n + 1);
    } catch (e) {
      alert('Failed to initialize research: ' + e.message);
    } finally {
      initializing = false;
    }
  }

  async function handleResume(seed) {
    // Prompt for file BEFORE any internal state changes or awaits
    let fileHandle = storedHandle;
    if (!fileHandle && 'showSaveFilePicker' in window) {
      fileHandle = await selectBackupFile();
    }

    const stepMatch = seed.status?.match(/error_step_(\d+)|completed_step_(\d+)/);
    let startStep = 1;
    if (stepMatch) {
      const errorStep = stepMatch[1] ? parseInt(stepMatch[1]) : null;
      const completedStep = stepMatch[2] ? parseInt(stepMatch[2]) : null;
      startStep = errorStep || (completedStep ? completedStep + 1 : 1);
    }

    resumePipeline(seed.id, startStep, fileHandle);

    activeSeeds.update(s => ({
      ...s,
      [seed.id]: { step: startStep, substep: null, detail: 'Resuming...', status: 'running' }
    }));
  }

  function handleStop(seedId) {
    stopPipeline(seedId);
    activeSeeds.update(s => {
      const copy = { ...s };
      delete copy[seedId];
      return copy;
    });
    seedsChanged.update(n => n + 1);
  }

  function viewInWorkspace(seedId) {
    selectedSeedId.set(seedId);
    currentView.set('workspace');
  }

  function getStreamsForSeed(seedId, step) {
    const prefix = `${seedId}-${step}-`;
    const streams = [];
    for (const [key, val] of Object.entries(tokenMap)) {
      if (key.startsWith(prefix)) {
        streams.push(val);
      }
    }
    return streams;
  }

  function truncateStreamText(text, maxLen = 300) {
    if (!text || text.length <= maxLen) return text || '';
    return '…' + text.slice(-maxLen);
  }

  function getStatusBadge(status) {
    if (!status) return { class: 'badge-info', text: 'Unknown' };
    if (status === 'completed') return { class: 'badge-success', text: 'Completed' };
    if (status.startsWith('error')) return { class: 'badge-error', text: 'Error' };
    if (status.startsWith('running')) return { class: 'badge-warning', text: 'Running' };
    if (status === 'initialized') return { class: 'badge-info', text: 'Initialized' };
    return { class: 'badge-info', text: status };
  }

  async function handleExport() {
    exporting = true;
    try {
      const jsonl = await exportDatabase();
      const blob = new Blob([jsonl], { type: 'application/jsonl' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pragna-full-backup-${new Date().toISOString().slice(0,10)}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      exporting = false;
    }
  }

  async function handleImport() {
    const confirmed = confirm(
      '⚠️ WARNING: Importing a backup will REPLACE all your current seeds, steps, chunks, and settings.\n\nThis cannot be undone. Continue?'
    );
    if (!confirmed) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jsonl,.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      importing = true;
      try {
        const text = await file.text();
        await importDatabase(text);
        seedsChanged.update(n => n + 1);
        await loadSeeds();
        alert('✅ Import complete! ' + seeds.length + ' seeds restored.');
      } catch (e) {
        alert('Import failed: ' + e.message);
      } finally {
        importing = false;
      }
    };
    input.click();
  }
</script>

<div class="main-content fade-in">
  <!-- Hero Section -->
  <div class="dashboard-hero">
    <div class="hero-glow"></div>
    <h1>🔬 Research Laboratory</h1>
    <p class="hero-subtitle">Enter a seed idea to launch a multi-agent investigation pipeline</p>
  </div>

  <!-- Seed Input Section -->
  <div class="seed-input-section card">
    <h3>💡 Seed Idea</h3>
    <textarea
      class="textarea seed-textarea"
      bind:value={seedText}
      placeholder="Enter your research question, hypothesis, or topic of investigation...

Example: Investigate the physiological effects of traditional Indian New Year celebrations (Ugadi, Bihu, Gudi Padwa) and their potential connections to seasonal biological rhythms, circadian clock gene expression, and environmental factors."
      rows="6"
    ></textarea>

    <div class="seed-meta">
      <span class="char-count">{seedText.length} characters</span>
      {#if seedText.length > 0 && seedText.length < 30}
        <span class="seed-tip">💡 Tip: More detailed seeds produce better research</span>
      {/if}
    </div>

    <!-- Tag Input -->
    <div class="tag-row">
      <label class="label">🏷️ Tags (comma-separated, optional)</label>
      <input class="input tag-input" bind:value={seedTags} placeholder="e.g. biology, chronobiology, festivals" />
    </div>

    <div class="seed-actions">
      {#if storedHandle}
        <span class="backup-indicator">📁 Backup: active</span>
      {/if}
      <button
        class="btn btn-primary btn-lg"
        onclick={handleInitialize}
        disabled={!seedText.trim() || initializing}
      >
        {#if initializing}
          <span class="spinner"></span> Initializing...
        {:else}
          🚀 Initialize Research
        {/if}
      </button>
    </div>
  </div>

  <!-- Active Seeds Section -->
  {#if Object.keys(activeSeedMap).length > 0}
    <div class="active-section">
      <h3>⚡ Active Pipelines</h3>
      {#each Object.entries(activeSeedMap) as [seedId, progress]}
        {@const seed = seeds.find(s => s.id === parseInt(seedId))}
        <div class="card active-seed-card">
          <div class="active-seed-header">
            <span class="active-seed-title">{seed?.title || `Seed #${seedId}`}</span>
            <div class="active-seed-actions">
              <span class="badge badge-warning">{progress.status === 'error' ? 'Error' : 'Running'}</span>
              <button class="btn btn-danger btn-sm" onclick={() => handleStop(parseInt(seedId))}>
                ⏹ Stop
              </button>
            </div>
          </div>
          <Stepper seedProgress={progress} />
          {#if progress.detail}
            <div class="progress-detail">{progress.detail}</div>
          {/if}
          {#if getStreamsForSeed(parseInt(seedId), progress.step).length > 0}
            <div class="stream-preview-area">
              {#each getStreamsForSeed(parseInt(seedId), progress.step) as stream (stream.model + '-' + stream.substep)}
                <div class="stream-preview-card">
                  <div class="stream-preview-header">
                    <span class="stream-model-badge">🤖 {stream.model}</span>
                    <span class="stream-step-label">Step {stream.step}{stream.substep != null ? ` · #${stream.substep + 1}` : ''}</span>
                  </div>
                  <div class="stream-preview-text">{truncateStreamText(stream.text)}<span class="stream-cursor">▊</span></div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Recent Seeds -->
  {#if seeds.length > 0}
    <div class="recent-section">
      <h3>📋 Recent Seeds</h3>
      <div class="seeds-list">
        {#each seeds.slice(0, 10) as seed}
          {@const badge = getStatusBadge(seed.status)}
          <div class="card card-interactive seed-row" onclick={() => viewInWorkspace(seed.id)}>
            <div class="seed-row-content">
              <div class="seed-row-info">
                <span class="seed-row-title">{seed.title || 'Untitled'}</span>
                <span class="seed-row-date">{new Date(seed.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="seed-row-actions">
                <span class="badge {badge.class}">{badge.text}</span>
                {#if seed.status?.startsWith('error') || (seed.status?.startsWith('completed_step_') && seed.status !== 'completed')}
                  <button class="btn btn-secondary btn-sm" onclick={(e) => { e.stopPropagation(); handleResume(seed); }}>
                    ▶ Resume
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-state-icon">🌱</div>
      <h3>No seeds yet</h3>
      <p>Enter a research idea above to start your first multi-agent investigation.</p>
    </div>
  {/if}

  <!-- Data Management -->
  <div class="data-management">
    <h3>💾 Data Management</h3>
    <div class="data-actions">
      <button class="btn btn-secondary btn-sm" onclick={handleExport} disabled={exporting}>
        {#if exporting}
          <span class="spinner"></span> Exporting...
        {:else}
          📤 Export Full Backup
        {/if}
      </button>
      <button class="btn btn-secondary btn-sm" onclick={handleImport} disabled={importing}>
        {#if importing}
          <span class="spinner"></span> Importing...
        {:else}
          📥 Import Backup
        {/if}
      </button>
    </div>
    <p class="data-hint">Export saves all seeds, steps, chunks, and settings as a JSONL file. Import replaces all current data.</p>
  </div>
</div>

<style>
  .dashboard-hero {
    position: relative;
    text-align: center;
    margin-bottom: var(--space-xl);
    padding: var(--space-2xl) 0;
  }
  .hero-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    height: 200px;
    background: radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }
  .dashboard-hero h1 {
    position: relative;
    z-index: 1;
    font-size: var(--text-4xl);
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .hero-subtitle {
    position: relative;
    z-index: 1;
    color: var(--on-surface-variant);
    margin-top: var(--space-sm);
    font-size: var(--text-lg);
  }

  .seed-input-section {
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }
  .seed-input-section h3 {
    margin-bottom: var(--space-md);
    font-size: var(--text-xl);
  }
  .seed-textarea {
    min-height: 160px;
    font-size: var(--text-base);
    line-height: 1.7;
  }

  .seed-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--space-sm);
  }
  .char-count {
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    opacity: 0.5;
  }
  .seed-tip {
    font-size: var(--text-xs);
    color: var(--warning);
    font-weight: 500;
  }

  .tag-row {
    margin-top: var(--space-md);
  }
  .tag-input {
    font-size: var(--text-sm);
  }

  .seed-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-md);
    margin-top: var(--space-md);
  }
  .backup-indicator {
    font-size: var(--text-xs);
    color: var(--success);
    font-weight: 500;
  }

  .active-section, .recent-section {
    margin-bottom: var(--space-xl);
  }
  .active-section h3, .recent-section h3 {
    margin-bottom: var(--space-md);
    font-size: var(--text-xl);
  }

  .active-seed-card {
    padding: var(--space-lg);
    margin-bottom: var(--space-md);
  }
  .active-seed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);
  }
  .active-seed-title {
    font-weight: 600;
    font-size: var(--text-base);
    color: var(--on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 60%;
  }
  .active-seed-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .progress-detail {
    margin-top: var(--space-sm);
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    font-style: italic;
  }

  .seeds-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .seed-row {
    padding: var(--space-md) var(--space-lg);
    cursor: pointer;
  }
  .seed-row-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }
  .seed-row-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .seed-row-title {
    font-weight: 500;
    color: var(--on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seed-row-date {
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
  }
  .seed-row-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .data-management {
    margin-top: var(--space-xl);
    padding: var(--space-lg);
    border-top: 1px solid var(--outline-variant);
  }
  .data-management h3 {
    font-size: var(--text-base);
    margin-bottom: var(--space-md);
  }
  .data-actions {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }
  .data-hint {
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    opacity: 0.6;
  }

  /* Streaming preview */
  .stream-preview-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }
  .stream-preview-card {
    background: var(--surface-container);
    border: 1px solid var(--outline-variant);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    overflow: hidden;
  }
  .stream-preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-xs);
  }
  .stream-model-badge {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--primary);
    background: var(--primary-container);
    padding: 2px 8px;
    border-radius: var(--radius-full);
  }
  .stream-step-label {
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    opacity: 0.6;
  }
  .stream-preview-text {
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--on-surface-variant);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 80px;
    overflow: hidden;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    opacity: 0.8;
  }
  .stream-cursor {
    animation: blink-cursor 0.8s steps(2) infinite;
    color: var(--primary);
    font-weight: bold;
  }
  @keyframes blink-cursor {
    0% { opacity: 1; }
    50% { opacity: 0; }
    100% { opacity: 1; }
  }
</style>
