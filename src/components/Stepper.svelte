<script>
  import { STEP_NAMES } from '../prompts.js';

  let { seedProgress = {}, compact = false } = $props();

  // Determine step states
  function getStepState(stepNum) {
    const currentStep = seedProgress.step || 0;
    const status = seedProgress.status || 'running';

    if (status === 'error' && stepNum === currentStep) return 'error';
    if (stepNum < currentStep) return 'completed';
    if (stepNum === currentStep) return 'active';
    return 'pending';
  }
</script>

<div class="stepper" class:compact>
  {#each STEP_NAMES as name, i}
    {@const stepNum = i + 1}
    {@const state = getStepState(stepNum)}
    <div class="step {state}">
      <div class="step-connector" class:completed={state === 'completed'}></div>
      <div class="step-circle">
        {#if state === 'completed'}
          ✓
        {:else if state === 'error'}
          ✕
        {:else if state === 'active'}
          <span class="spinner-sm"></span>
        {:else}
          {stepNum}
        {/if}
      </div>
      {#if !compact}
        <span class="step-label">{name}</span>
      {/if}
    </div>
  {/each}
</div>

{#if seedProgress.detail}
  <div class="step-detail fade-in">
    <span class="step-detail-badge">Step {seedProgress.step}</span>
    {seedProgress.detail}
  </div>
{/if}

<style>
  .compact {
    gap: 0;
  }
  .compact .step {
    min-width: 40px;
  }
  .compact .step-circle {
    width: 24px;
    height: 24px;
    font-size: 10px;
  }

  .spinner-sm {
    width: 12px;
    height: 12px;
    border: 2px solid var(--outline-variant);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .step-detail {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--surface-container);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--on-surface-variant);
  }

  .step-detail-badge {
    display: inline-flex;
    padding: 2px 8px;
    background: var(--primary-container);
    color: var(--on-primary-container);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
