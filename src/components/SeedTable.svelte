<script>
  import { onMount, onDestroy } from 'svelte';
  import { selectedTags, searchResults, seedsChanged } from '../stores.js';
  import { getAllSeeds, deleteSeed } from '../db.js';
  import TagInput from './TagInput.svelte';

  let { onSelect, selectedId } = $props();

  let seeds = $state([]);
  let filteredSeeds = $state([]);
  let tags = $state([]);
  let results = $state([]);
  let confirmDelete = $state(null);
  let changeCount = $state(0);

  const unsubTags = selectedTags.subscribe(v => tags = v);
  const unsubResults = searchResults.subscribe(v => results = v);
  const unsubChanged = seedsChanged.subscribe(v => {
    changeCount = v;
    loadSeeds();
  });

  onMount(async () => {
    await loadSeeds();
  });

  onDestroy(() => {
    unsubTags?.();
    unsubResults?.();
    unsubChanged?.();
  });

  async function loadSeeds() {
    seeds = await getAllSeeds();
    applyFilters();
  }

  function applyFilters() {
    let filtered = [...seeds];

    // Tag filter (OR)
    if (tags.length > 0) {
      filtered = filtered.filter(s =>
        s.tags && s.tags.some(t => tags.includes(t))
      );
    }

    // Search results filter
    if (results.length > 0) {
      const resultIds = new Set(results.map(r => r.seedId));
      filtered = filtered.filter(s => resultIds.has(s.id));
      // Sort by search score
      filtered.sort((a, b) => {
        const aScore = results.find(r => r.seedId === a.id)?.score || 0;
        const bScore = results.find(r => r.seedId === b.id)?.score || 0;
        return bScore - aScore;
      });
    }

    filteredSeeds = filtered;
  }

  // React to tag/search changes
  $effect(() => {
    if (tags || results) {
      applyFilters();
    }
  });

  async function handleDelete(seed, e) {
    e?.stopPropagation();
    confirmDelete = seed;
  }

  async function confirmDeleteSeed() {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    try {
      await deleteSeed(id);
      confirmDelete = null;
      if (selectedId === id) {
        onSelect(null);
      }
      seedsChanged.update(n => n + 1);
    } catch (e) {
      alert('Failed to delete seed: ' + e.message);
    }
  }

  function getStatusBadge(status) {
    if (!status) return { class: 'badge-info', text: '—' };
    if (status === 'completed') return { class: 'badge-success', text: '✓' };
    if (status.startsWith('error')) return { class: 'badge-error', text: '✕' };
    if (status.startsWith('running')) return { class: 'badge-warning', text: '⟳' };
    return { class: 'badge-info', text: '…' };
  }
</script>

<div class="seed-table-container">
  <div class="sidebar-header">
    <h4>📚 Library</h4>
    <span class="seed-count">{filteredSeeds.length} seeds</span>
  </div>

  <TagInput />

  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Title</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each filteredSeeds as seed}
          {@const badge = getStatusBadge(seed.status)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <tr
            class:active={seed.id === selectedId}
            onclick={() => onSelect(seed.id)}
            role="button"
            tabindex="0"
          >
            <td class="date-cell">{new Date(seed.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
            <td class="title-cell">
              <div class="title-text">{seed.title || 'Untitled'}</div>
              {#if seed.tags?.length > 0}
                <div class="tag-list">
                  {#each seed.tags as tag}
                    <span class="tag-mini">{tag}</span>
                  {/each}
                </div>
              {/if}
            </td>
            <td><span class="badge {badge.class}">{badge.text}</span></td>
            <td>
              <button class="btn btn-ghost btn-sm delete-btn" onclick={(e) => handleDelete(seed, e)} title="Delete">
                🗑️
              </button>
            </td>
          </tr>
        {/each}
        {#if filteredSeeds.length === 0}
          <tr>
            <td colspan="4" class="empty-row">No seeds found</td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

<!-- Delete Confirmation Dialog -->
{#if confirmDelete}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={() => confirmDelete = null}>
    <div class="modal slide-up confirm-dialog" onclick={(e) => e.stopPropagation()}>
      <h3>⚠️ Delete Seed</h3>
      <p>Are you sure you want to delete "<strong>{confirmDelete.title || 'Untitled'}</strong>"? This action cannot be undone.</p>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={() => confirmDelete = null}>Cancel</button>
        <button class="btn btn-danger" onclick={confirmDeleteSeed}>Delete Forever</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .seed-table-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    height: 100%;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sidebar-header h4 {
    font-size: var(--text-base);
  }
  .seed-count {
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    background: var(--surface-container);
    padding: 2px 8px;
    border-radius: var(--radius-full);
  }

  .table-wrapper {
    flex: 1;
    overflow-y: auto;
  }

  .date-cell {
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    width: 60px;
  }
  .title-cell {
    max-width: 160px;
  }
  .title-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
  }
  .tag-list {
    display: flex;
    gap: 2px;
    margin-top: 2px;
    flex-wrap: wrap;
  }
  .tag-mini {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: var(--radius-full);
    background: var(--primary-container);
    color: var(--on-primary-container);
    opacity: 0.7;
  }

  .delete-btn {
    opacity: 0.3;
    transition: opacity var(--transition-fast);
    padding: 4px;
    font-size: 12px;
  }
  tr:hover .delete-btn {
    opacity: 1;
  }

  .empty-row {
    text-align: center;
    color: var(--on-surface-variant);
    padding: var(--space-xl) !important;
    font-style: italic;
  }

  tr {
    cursor: pointer;
  }
</style>
