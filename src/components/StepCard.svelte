<script>
  let { step = {}, stepNum = 0, onEdit = null, canEdit = false } = $props();

  let editing = $state(false);
  let editText = $state('');

  function formatMarkdown(text) {
    if (!text) return '<p class="empty-text">No output available</p>';
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

  function startEdit() {
    editText = step.output || '';
    editing = true;
  }

  function cancelEdit() {
    editing = false;
    editText = '';
  }

  function saveEdit() {
    if (onEdit) {
      onEdit(stepNum, editText);
    }
    editing = false;
  }
</script>

<div class="step-card card">
  <div class="step-card-header">
    <span class="step-card-model">
      {#if step.model}
        🤖 {step.model}
      {/if}
    </span>
    {#if canEdit && !editing}
      <button class="btn btn-ghost btn-sm" onclick={startEdit}>✏️ Edit</button>
    {/if}
  </div>

  {#if editing}
    <div class="edit-container">
      <textarea class="textarea" bind:value={editText} rows="12"></textarea>
      <div class="edit-warning">
        ⚠️ Editing this output will invalidate all downstream steps. You'll need to re-run the pipeline from this point.
      </div>
      <div class="edit-actions">
        <button class="btn btn-secondary btn-sm" onclick={cancelEdit}>Cancel</button>
        <button class="btn btn-primary btn-sm" onclick={saveEdit}>Save & Re-run from here</button>
      </div>
    </div>
  {:else}
    <div class="step-card-body markdown-content">
      {@html formatMarkdown(step.output || '')}
    </div>
  {/if}
</div>

<style>
  .step-card {
    padding: var(--space-lg);
  }

  .step-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);
  }

  .step-card-model {
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    font-weight: 500;
  }

  .step-card-body {
    font-size: var(--text-sm);
    line-height: 1.8;
  }

  .edit-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .edit-warning {
    padding: var(--space-sm) var(--space-md);
    background: var(--warning-container);
    color: var(--warning);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  :global(.empty-text) {
    color: var(--on-surface-variant);
    font-style: italic;
  }
</style>
