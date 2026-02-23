<script>
  import { onMount } from 'svelte';
  import { selectedTags } from '../stores.js';
  import { getAllSeeds } from '../db.js';

  let allTags = $state([]);
  let selected = $state([]);
  let inputText = $state('');
  let suggestions = $state([]);
  let showSuggestions = $state(false);

  const unsubTags = selectedTags.subscribe(v => selected = v);

  onMount(async () => {
    const seeds = await getAllSeeds();
    const tagSet = new Set();
    for (const seed of seeds) {
      if (seed.tags) {
        for (const tag of seed.tags) {
          tagSet.add(tag);
        }
      }
    }
    allTags = Array.from(tagSet).sort();
  });

  function handleInput() {
    if (inputText.trim()) {
      suggestions = allTags.filter(t =>
        t.toLowerCase().includes(inputText.toLowerCase()) &&
        !selected.includes(t)
      );
      showSuggestions = suggestions.length > 0;
    } else {
      showSuggestions = false;
    }
  }

  function addTag(tag) {
    if (!selected.includes(tag)) {
      const updated = [...selected, tag];
      selectedTags.set(updated);
    }
    inputText = '';
    showSuggestions = false;
  }

  function removeTag(tag) {
    selectedTags.set(selected.filter(t => t !== tag));
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && inputText.trim()) {
      // Add first suggestion or create new tag
      if (suggestions.length > 0) {
        addTag(suggestions[0]);
      } else {
        addTag(inputText.trim());
      }
      e.preventDefault();
    }
    if (e.key === 'Backspace' && !inputText && selected.length > 0) {
      removeTag(selected[selected.length - 1]);
    }
    if (e.key === 'Escape') {
      showSuggestions = false;
    }
  }
</script>

<div class="tag-input-container">
  <div class="tag-input-field">
    {#each selected as tag}
      <span class="chip">
        {tag}
        <button class="chip-remove" onclick={() => removeTag(tag)}>×</button>
      </span>
    {/each}
    <input
      class="tag-text-input"
      type="text"
      bind:value={inputText}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onfocus={handleInput}
      onblur={() => setTimeout(() => showSuggestions = false, 200)}
      placeholder={selected.length === 0 ? 'Filter by tags...' : ''}
    />
  </div>

  {#if showSuggestions}
    <div class="suggestions-dropdown slide-up">
      {#each suggestions as suggestion}
        <button class="suggestion-item" onmousedown={() => addTag(suggestion)}>
          {suggestion}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tag-input-container {
    position: relative;
  }

  .tag-input-field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: var(--surface);
    border: 1.5px solid var(--outline-variant);
    border-radius: var(--radius-md);
    min-height: 38px;
    cursor: text;
    transition: border-color var(--transition-fast);
  }
  .tag-input-field:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  .tag-text-input {
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--on-surface);
    min-width: 80px;
    flex: 1;
    padding: 2px 0;
  }
  .tag-text-input::placeholder {
    color: var(--on-surface-variant);
    opacity: 0.5;
  }

  .suggestions-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--surface);
    border: 1px solid var(--outline-variant);
    border-radius: var(--radius-md);
    box-shadow: var(--elevation-3);
    z-index: 20;
    max-height: 200px;
    overflow-y: auto;
  }

  .suggestion-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--on-surface);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .suggestion-item:hover {
    background: var(--surface-dim);
  }
</style>
