<script>
  import { searchQuery, searchResults } from '../stores.js';

  let { onSearch } = $props();

  let query = $state('');
  let searching = $state(false);
  let results = $state([]);

  const unsubResults = searchResults.subscribe(v => results = v);

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!query.trim()) return;

    searching = true;
    searchQuery.set(query);
    try {
      await onSearch(query);
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      searching = false;
    }
  }

  function clearSearch() {
    query = '';
    searchQuery.set('');
    searchResults.set([]);
  }
</script>

<form class="search-form" onsubmit={handleSubmit}>
  <div class="search-container">
    <span class="search-icon">🔍</span>
    <input
      class="input"
      type="search"
      bind:value={query}
      placeholder="Search across all research outputs..."
    />
    {#if query}
      <button type="button" class="search-clear" onclick={clearSearch}>✕</button>
    {/if}
  </div>
  <button type="submit" class="btn btn-primary btn-sm" disabled={searching || !query.trim()}>
    {#if searching}
      <span class="spinner"></span>
    {:else}
      Search
    {/if}
  </button>
</form>

{#if results.length > 0}
  <div class="search-result-count">{results.length} seed{results.length !== 1 ? 's' : ''} found</div>
{/if}

<style>
  .search-form {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  .search-container {
    flex: 1;
    position: relative;
  }

  .search-clear {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--on-surface-variant);
    cursor: pointer;
    font-size: var(--text-sm);
    padding: 4px;
    opacity: 0.5;
    transition: opacity var(--transition-fast);
  }
  .search-clear:hover {
    opacity: 1;
  }

  .search-result-count {
    margin-top: var(--space-sm);
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
  }
</style>
