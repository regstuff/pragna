<script>
  import { onMount, onDestroy } from 'svelte';
  import { getSeed, getStepsForSeed, deleteDownstreamSteps, saveStep, deleteChunksForStep, saveChunks, updateSeedStatus, updateSeedTags, deleteSeed, exportDatabase } from '../db.js';
  import { removeFromIndex, initSearchIndex, bulkAddToIndex } from '../search.js';
  import { chunkDocument } from '../chunking.js';
  import { resumePipeline } from '../workerClient.js';
  import { activeSeeds, stepUpdateTick, seedsChanged, selectedSeedId, backupFileHandle } from '../stores.js';
  import { STEP_NAMES, FAN_OUT_STEPS } from '../prompts.js';
  import StepCard from './StepCard.svelte';
  import FanOutGrid from './FanOutGrid.svelte';

  let { seedId, focusStep = null, focusHeader = null, focusQuery = null } = $props();

  let seed = $state(null);
  let steps = $state([]);
  let loading = $state(true);
  let activeTab = $state(8);
  let expandedAccordions = $state(new Set());
  let tick = $state(0);
  let editingTags = $state(false);
  let tagInput = $state('');

  const unsubTick = stepUpdateTick.subscribe(v => {
    tick = v;
    // Re-fetch current seed's steps when worker progresses
    if (seedId && !loading) {
      refreshSteps(seedId);
    }
  });

  onDestroy(() => {
    unsubTick?.();
  });

  // Reload when seedId changes
  $effect(() => {
    if (seedId) {
      loadSeed(seedId);
    }
  });

  // Auto-focus on a step when navigating from search
  let lastAppliedFocus = $state(null);
  $effect(() => {
    const focusKey = focusStep && focusHeader ? `${focusStep}-${focusHeader}` : focusStep ? String(focusStep) : null;
    if (focusKey && focusKey !== lastAppliedFocus && !loading && steps.length > 0) {
      lastAppliedFocus = focusKey;
      if (focusStep === 8) {
        // Step 8 is the featured output, no accordion to expand
      } else if (focusStep >= 2 && focusStep <= 7) {
        expandedAccordions = new Set([focusStep]);
      }
      // Give Svelte time to render the expanded content before scrolling
      setTimeout(() => {
        scrollToChunk(focusStep, focusHeader, focusQuery);
      }, 300);
    }
  });

  function scrollToChunk(stepNum, header, query) {
    const stepEl = document.getElementById(`step-${stepNum}`);
    if (!stepEl) return;

    // Check header match
    const cleanHeader = header ? header.replace(/\s*\(part \d+\)$/i, '').toLowerCase() : '';
    let foundHeaderElement = null;

    if (cleanHeader && !cleanHeader.startsWith('step ')) {
      const headings = stepEl.querySelectorAll('h1, h2, h3, h4, h5, strong');
      for (const h of headings) {
        if (h.textContent.toLowerCase().includes(cleanHeader)) {
          foundHeaderElement = h;
          break; // First matching heading
        }
      }
    }

    // Now look for query text (using the exactContext passed from Workspace)
    if (query) {
      const queryLower = query.toLowerCase().replace(/\s+/g, ' ').trim();
      const contentEl = stepEl.querySelector('.markdown-content') || stepEl.querySelector('.accordion-content') || stepEl;
      
      const elements = contentEl.querySelectorAll('p, li, h1, h2, h3, h4, h5, td, th');
      for (const el of elements) {
        // Soft text check: remove tabs and multiple spaces across line breaks
        if (el.textContent.toLowerCase().replace(/\s+/g, ' ').includes(queryLower)) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlight-flash');
          setTimeout(() => el.classList.remove('highlight-flash'), 2500);
          return;
        }
      }
      
      // If block element not found, use TreeWalker as last resort
      const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.toLowerCase().replace(/\s+/g, ' ').includes(queryLower)) {
          const parent = walker.currentNode.parentElement;
          if (parent) {
            parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
            parent.classList.add('highlight-flash');
            setTimeout(() => parent.classList.remove('highlight-flash'), 2500);
            return;
          }
        }
      }
    }

    // Scroll to header element if we found it but didn't find the exact context (or we didn't have a query)
    if (foundHeaderElement) {
        foundHeaderElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        foundHeaderElement.classList.add('highlight-flash');
        setTimeout(() => foundHeaderElement.classList.remove('highlight-flash'), 2500);
        return;
    }

    // Final fallback: scroll to the step itself
    stepEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    stepEl.classList.add('highlight-flash');
    setTimeout(() => stepEl.classList.remove('highlight-flash'), 2000);
  }

  async function refreshSteps(id) {
    try {
      seed = await getSeed(id);
      steps = await getStepsForSeed(id);
    } catch (e) {
      // silently fail on refresh
    }
  }

  async function loadSeed(id) {
    loading = true;
    try {
      seed = await getSeed(id);
      steps = await getStepsForSeed(id);
    } catch (e) {
      console.error('Failed to load seed:', e);
    } finally {
      loading = false;
    }
  }

  function getStepOutputs(stepNum) {
    return steps.filter(s => s.stepNum === stepNum);
  }

  function getSingleOutput(stepNum) {
    const outputs = getStepOutputs(stepNum);
    return outputs[0] || null;
  }

  function isFanOut(stepNum) {
    return FAN_OUT_STEPS.includes(stepNum);
  }

  function toggleAccordion(stepNum) {
    const newSet = new Set(expandedAccordions);
    if (newSet.has(stepNum)) {
      newSet.delete(stepNum);
    } else {
      newSet.add(stepNum);
    }
    expandedAccordions = newSet;
  }

  function formatMarkdown(text) {
    if (!text) return '<p style="color: var(--on-surface-variant); font-style: italic;">No output yet</p>';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  async function handleEdit(stepNum, newText) {
    if (!seedId) return;

    const hasDownstream = steps.some(s => s.stepNum > stepNum);
    if (hasDownstream) {
      // Delete downstream steps and chunks
      await deleteDownstreamSteps(seedId, stepNum + 1);
    }

    // Delete old step + chunks for this step
    const oldSteps = getStepOutputs(stepNum);
    for (const os of oldSteps) {
      await deleteChunksForStep(os.id);
      // Can't easily delete individual step, we'll update
    }

    // Save edited step
    const stepId = await saveStep({
      seedId,
      stepNum,
      subIndex: 0,
      output: newText,
      model: 'user-edited',
      status: 'completed',
    });

    // Re-chunk and embed
    const chunks = chunkDocument(newText);
    const chunkRecords = chunks.map(c => ({
      seedId,
      stepId,
      stepNum,
      text: c.text,
      vector: [], // Will be re-embedded on next run
      sectionHeader: c.header,
    }));
    await saveChunks(chunkRecords);

    // Update search index
    const { getAllChunks } = await import('../db.js');
    const allChunks = await getAllChunks();
    initSearchIndex();
    bulkAddToIndex(allChunks);

    // Update seed status
    await updateSeedStatus(seedId, `completed_step_${stepNum}`);

    // Reload
    await loadSeed(seedId);

    // Offer to resume
    if (hasDownstream && confirm('Downstream steps have been deleted. Resume pipeline from step ' + (stepNum + 1) + '?')) {
      resumePipeline(seedId, stepNum + 1);
      activeSeeds.update(s => ({
        ...s,
        [seedId]: { step: stepNum + 1, substep: null, detail: 'Resuming...', status: 'running' }
      }));
    }
  }

  function startEditTags() {
    tagInput = (seed.tags || []).join(', ');
    editingTags = true;
  }

  async function saveTags() {
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    await updateSeedTags(seedId, tags);
    seed = { ...seed, tags };
    editingTags = false;
    seedsChanged.update(n => n + 1);
  }

  async function handleDeleteSeed() {
    const title = seed?.title || 'this seed';
    const confirmed = confirm(
      `⚠️ Delete "${title}"?\n\nThis will permanently remove the seed, all pipeline steps, chunks, and research data.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    await deleteSeed(seedId);
    
    let handle;
    const unsubHandle = backupFileHandle.subscribe(v => handle = v);
    unsubHandle();
    
    if (handle) {
      try {
        const jsonl = await exportDatabase();
        if ('createWritable' in handle) {
          const writable = await handle.createWritable();
          await writable.write(jsonl);
          await writable.close();
        }
      } catch (e) {
        console.warn('Failed to update backup after seed deletion:', e);
      }
    }

    seedsChanged.update(n => n + 1);
    selectedSeedId.set(null);
  }
</script>

{#if loading}
  <div class="loading-container">
    <div class="spinner"></div>
    <span>Loading research...</span>
  </div>
{:else if !seed}
  <div class="empty-state">
    <div class="empty-state-icon">❓</div>
    <h3>Seed not found</h3>
  </div>
{:else}
  <div class="reading-pane fade-in">
    <!-- Header -->
    <div class="pane-header">
      <h2>{seed.title || 'Untitled Research'}</h2>
      <div class="pane-meta">
        <span class="badge badge-info">{seed.status || 'Unknown'}</span>
        <span class="pane-date">{new Date(seed.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
        <button class="btn btn-danger btn-sm delete-seed-btn" onclick={handleDeleteSeed}>🗑️ Delete Seed</button>
      </div>
      <div class="pane-tags-row">
        {#if editingTags}
          <div class="tag-edit-row">
            <input class="input tag-edit-input" bind:value={tagInput} placeholder="tag1, tag2, tag3" />
            <button class="btn btn-primary btn-sm" onclick={saveTags}>Save</button>
            <button class="btn btn-ghost btn-sm" onclick={() => editingTags = false}>Cancel</button>
          </div>
        {:else}
          <div class="pane-tags">
            {#if seed.tags?.length > 0}
              {#each seed.tags as tag}
                <span class="chip">{tag}</span>
              {/each}
            {:else}
              <span class="no-tags">No tags</span>
            {/if}
            <button class="btn btn-ghost btn-sm edit-tags-btn" onclick={startEditTags}>🏷️ Edit Tags</button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Featured Output (Step 8: Simplified) -->
    <div class="featured-outputs">
      <h3>📝 Simplified Research Output</h3>

      <div class="tab-content card" id="step-8">
        {#if true}
          {@const step8 = getSingleOutput(8)}
          {#if step8}
            <div class="markdown-content featured-content">
              {@html formatMarkdown(step8.output)}
            </div>
          {:else}
            <div class="empty-step">Simplified output has not been generated yet.</div>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Pipeline Steps (2-7) -->
    <div class="pipeline-steps">
      <h3>🔬 Pipeline Steps</h3>

      <div class="accordion">
        {#each [2, 3, 4, 5, 6, 7] as stepNum}
          {@const stepOutputs = getStepOutputs(stepNum)}
          {@const isExpanded = expandedAccordions.has(stepNum)}
          {@const isFanOutStep = isFanOut(stepNum)}
          <div class="accordion-item" id={`step-${stepNum}`}>
            <button class="accordion-trigger" class:open={isExpanded} onclick={() => toggleAccordion(stepNum)}>
              <span>
                <strong>Step {stepNum}:</strong> {STEP_NAMES[stepNum - 1]}
                {#if stepOutputs.length > 0}
                  <span class="badge badge-success" style="margin-left: 8px;">
                    {stepOutputs.length} output{stepOutputs.length > 1 ? 's' : ''}
                  </span>
                {:else}
                  <span class="badge badge-info" style="margin-left: 8px;">Pending</span>
                {/if}
              </span>
              <span class="arrow">▼</span>
            </button>

            {#if isExpanded}
              <div class="accordion-content">
                {#if isFanOutStep && stepOutputs.length > 0}
                  <!-- Fan-out: Show grid comparison -->
                  <FanOutGrid outputs={stepOutputs} {stepNum} />
                {:else if stepOutputs.length > 0}
                  <!-- Single output: Show card -->
                  <StepCard
                    step={stepOutputs[0]}
                    {stepNum}
                    canEdit={true}
                    onEdit={handleEdit}
                  />
                {:else}
                  <div class="empty-step">This step has not completed yet.</div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Seed Text -->
    <div class="seed-original">
      <h4>🌱 Original Seed</h4>
      <div class="card" style="padding: var(--space-lg); margin-top: var(--space-sm);">
        <p style="white-space: pre-wrap; color: var(--on-surface-variant);">{seed.seed}</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .reading-pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .pane-header h2 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-sm);
  }
  .pane-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }
  .pane-date {
    font-size: var(--text-sm);
    color: var(--on-surface-variant);
  }
  .delete-seed-btn {
    margin-left: auto;
    font-size: var(--text-xs) !important;
    opacity: 0.6;
    transition: opacity var(--transition-fast);
  }
  .delete-seed-btn:hover {
    opacity: 1;
  }
  .pane-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .pane-tags-row {
    margin-top: var(--space-xs);
  }
  .tag-edit-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .tag-edit-input {
    flex: 1;
    font-size: var(--text-sm);
  }
  .no-tags {
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    font-style: italic;
    opacity: 0.5;
  }
  .edit-tags-btn {
    font-size: var(--text-xs) !important;
    opacity: 0.5;
    transition: opacity var(--transition-fast);
  }
  .edit-tags-btn:hover {
    opacity: 1;
  }

  .featured-outputs {
    /* No extra styling needed beyond what tabs/card provide */
  }

  .tab-content {
    padding: var(--space-xl);
    border-top: none;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }

  .featured-content {
    font-size: var(--text-base);
    line-height: 1.8;
    max-height: 600px;
    overflow-y: auto;
  }

  .pipeline-steps h3 {
    margin-bottom: var(--space-md);
  }

  .empty-step {
    padding: var(--space-lg);
    text-align: center;
    color: var(--on-surface-variant);
    font-style: italic;
  }

  .loading-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-2xl);
    color: var(--on-surface-variant);
  }

  .seed-original h4 {
    font-size: var(--text-lg);
  }

  :global(.highlight-flash) {
    animation: flash-highlight 2s ease-out;
  }

  @keyframes flash-highlight {
    0% { box-shadow: 0 0 0 4px var(--primary); background-color: rgba(var(--primary-rgb, 99, 102, 241), 0.08); }
    100% { box-shadow: none; background-color: transparent; }
  }
</style>
