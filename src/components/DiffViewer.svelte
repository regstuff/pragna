<script>
  let { beforeText = '', afterText = '', beforeLabel = 'Before (Step 2)', afterLabel = 'After (Step 6)' } = $props();
</script>

<div class="diff-container">
  <div class="diff-pane diff-before">
    <div class="diff-label" style="color: var(--error);">↩ {beforeLabel}</div>
    <div class="diff-text">{beforeText}</div>
  </div>
  <div class="diff-pane diff-after">
    <div class="diff-label" style="color: var(--success);">↪ {afterLabel}</div>
    <div class="diff-text">{afterText}</div>
  </div>
</div>

<style>
  .diff-text {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: var(--text-sm);
    line-height: 1.6;
  }
</style>
