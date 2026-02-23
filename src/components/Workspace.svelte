<script>
  import { onMount, onDestroy } from 'svelte';
  import { selectedSeedId, searchQuery, searchResults, selectedTags } from '../stores.js';
  import { getAllSeeds, getAllChunks, getSetting } from '../db.js';
  import { hybridSearch } from '../search.js';
  import SeedTable from './SeedTable.svelte';
  import SearchBar from './SearchBar.svelte';
  import ReadingPane from './ReadingPane.svelte';

  let selectedId = $state(null);
  let query = $state('');
  let chunkResults = $state([]);
  let focusStepNum = $state(null);
  let focusChunkHeader = $state(null);
  let focusQueryText = $state(null);

  const unsubId = selectedSeedId.subscribe(v => selectedId = v);
  const unsubQuery = searchQuery.subscribe(v => query = v);

  onDestroy(() => {
    unsubId?.();
    unsubQuery?.();
  });

  async function handleSearch(queryText) {
    if (!queryText.trim()) {
      searchResults.set([]);
      chunkResults = [];
      return;
    }

    // Deselect current seed so search results are shown
    selectedSeedId.set(null);

    // Embed query for semantic search
    let queryVec = null;
    try {
      const litellmUrl = (await getSetting('litellmUrl')) || 'http://localhost:4000';
      const apiKey = (await getSetting('litellmApiKey')) || '';
      const model = (await getSetting('embeddingModel')) || 'text-embedding-3-small';

      const res = await fetch(`${litellmUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: queryText }),
      });
      if (res.ok) {
        const data = await res.json();
        queryVec = data.data?.[0]?.embedding || null;
      }
    } catch (e) {
      console.warn('Embedding for search failed, using text-only search:', e);
    }

    const allChunks = await getAllChunks();
    const results = hybridSearch(queryText, queryVec, allChunks);
    searchResults.set(results);

    // Also find matching chunks for snippet display
    const queryLower = queryText.toLowerCase();
    const matchingChunks = allChunks
      .filter(c => c.text && c.text.toLowerCase().includes(queryLower))
      .map(c => {
        const idx = c.text.toLowerCase().indexOf(queryLower);
        const start = Math.max(0, idx - 80);
        const end = Math.min(c.text.length, idx + queryText.length + 80);
        const snippet = (start > 0 ? '…' : '') + c.text.slice(start, end) + (end < c.text.length ? '…' : '');
        
        // Exact text to find in DOM to disambiguate multiple query occurrences
        // We take up to 60 characters starting around the match
        const exactContext = c.text.slice(Math.max(0, idx - 10), idx + queryText.length + 30).trim();

        return {
          seedId: c.seedId,
          stepNum: c.stepNum,
          snippet,
          exactContext,
          header: c.sectionHeader || `Step ${c.stepNum}`,
        };
      })
      .slice(0, 20);
    chunkResults = matchingChunks;
  }

  function highlightSnippet(text, q) {
    if (!q) return text;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<mark>$1</mark>');
  }

  function selectSeedFromChunk(seedId, stepNum, header, searchText) {
    focusStepNum = stepNum;
    focusChunkHeader = header;
    focusQueryText = searchText;
    chunkResults = [];
    searchResults.set([]);
    searchQuery.set('');
    selectedSeedId.set(seedId);
  }
</script>

<div class="workspace-layout">
  <!-- Left Sidebar -->
  <aside class="workspace-sidebar">
    <SeedTable onSelect={(id) => { chunkResults = []; focusStepNum = null; focusChunkHeader = null; focusQueryText = null; selectedSeedId.set(id); }} selectedId={selectedId} />
  </aside>

  <!-- Top Search Bar -->
  <div class="workspace-topbar">
    <SearchBar onSearch={handleSearch} />
  </div>

  <!-- Main Reading Pane -->
  <div class="workspace-main">
    {#if chunkResults.length > 0}
      <!-- Search results with chunk snippets -->
      <div class="search-results fade-in">
        <h3>🔍 Search Results</h3>
        <p class="result-summary">{chunkResults.length} matching chunks found — click a result to view the seed</p>
        <div class="chunk-results">
          {#each chunkResults as chunk}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="chunk-card card card-interactive" onclick={() => selectSeedFromChunk(chunk.seedId, chunk.stepNum, chunk.header, chunk.exactContext)} role="button" tabindex="0">
              <div class="chunk-header">
                <span class="badge badge-info">Seed #{chunk.seedId}</span>
                <span class="badge badge-secondary">Step {chunk.stepNum}</span>
                <span class="chunk-step">{chunk.header}</span>
              </div>
              <div class="chunk-snippet">{@html highlightSnippet(chunk.snippet, query)}</div>
            </div>
          {/each}
        </div>
      </div>
    {:else if selectedId}
      <ReadingPane seedId={selectedId} focusStep={focusStepNum} focusHeader={focusChunkHeader} focusQuery={focusQueryText} />
    {:else}
      <div class="empty-state">
        <div class="empty-state-icon">📖</div>
        <h3>Select a seed</h3>
        <p>Choose a seed from the sidebar or search to view its research outputs.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .search-results {
    padding: var(--space-md);
  }
  .search-results h3 {
    margin-bottom: var(--space-sm);
  }
  .result-summary {
    font-size: var(--text-sm);
    color: var(--on-surface-variant);
    margin-bottom: var(--space-md);
  }
  .chunk-results {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .chunk-card {
    padding: var(--space-md);
    cursor: pointer;
  }
  .chunk-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }
  .chunk-step {
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    font-weight: 500;
  }
  .chunk-snippet {
    font-size: var(--text-sm);
    color: var(--on-surface);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .chunk-snippet :global(mark) {
    background: rgba(99, 102, 241, 0.25);
    color: inherit;
    padding: 1px 3px;
    border-radius: 2px;
    font-weight: 600;
  }
</style>
