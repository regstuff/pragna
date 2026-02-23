<script>
  let { outputs = [], stepNum = 0 } = $props();

  function formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }
</script>

<div class="fanout-grid">
  {#each outputs as output, i}
    <div class="card fanout-card">
      <div class="fanout-card-header">
        <span class="fanout-model-badge">
          🤖 {output.model || `Model ${i + 1}`}
        </span>
        <span class="fanout-index">#{i + 1}</span>
      </div>
      <div class="fanout-card-body markdown-content">
        {@html formatMarkdown(output.output || output.text || '')}
      </div>
    </div>
  {/each}
</div>

<style>
  .fanout-card {
    padding: var(--space-md);
    overflow: hidden;
  }

  .fanout-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--outline-variant);
  }

  .fanout-model-badge {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--primary);
    background: var(--primary-container);
    padding: 4px 10px;
    border-radius: var(--radius-full);
  }

  .fanout-index {
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    font-weight: 500;
  }

  .fanout-card-body {
    font-size: var(--text-sm);
    line-height: 1.7;
    max-height: 500px;
    overflow-y: auto;
  }
</style>
