<script>
  import { onMount } from 'svelte';
  import { getSetting, setSetting } from '../db.js';
  import { settingsOpen } from '../stores.js';

  let litellmUrl = $state('');
  let litellmApiKey = $state('');
  let fanOutModels = $state('');
  let consolidationModel = $state('');
  let simplifierModel = $state('');
  let embeddingModel = $state('');
  let showLitellmKey = $state(false);
  let testingConnection = $state(false);
  let testResult = $state(null);
  let jsonError = $state('');
  let saving = $state(false);

  onMount(async () => {
    litellmUrl = (await getSetting('litellmUrl')) || 'http://localhost:4000';
    litellmApiKey = (await getSetting('litellmApiKey')) || '';
    fanOutModels = (await getSetting('fanOutModels')) || '["gpt-4o","claude-sonnet-4-20250514","gemini-2.0-flash"]';
    consolidationModel = (await getSetting('consolidationModel')) || 'gpt-4o';
    simplifierModel = (await getSetting('simplifierModel')) || 'gpt-4o';
    embeddingModel = (await getSetting('embeddingModel')) || 'text-embedding-3-small';
  });

  function validateFanOutJson(val) {
    try {
      const parsed = JSON.parse(val);
      if (!Array.isArray(parsed)) {
        jsonError = 'Must be a JSON array, e.g. ["model1","model2"]';
        return false;
      }
      if (parsed.length === 0) {
        jsonError = 'At least one model is required';
        return false;
      }
      jsonError = '';
      return true;
    } catch {
      jsonError = 'Invalid JSON — check for missing quotes or commas';
      return false;
    }
  }

  $effect(() => {
    if (fanOutModels) validateFanOutJson(fanOutModels);
  });

  async function testConnection() {
    testingConnection = true;
    testResult = null;
    try {
      const url = litellmUrl.replace(/\/$/, '');
      const headers = { 'Content-Type': 'application/json' };
      if (litellmApiKey) headers['Authorization'] = `Bearer ${litellmApiKey}`;

      const res = await fetch(`${url}/v1/models`, { headers, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        const models = data.data?.map(m => m.id) || [];
        testResult = { success: true, message: `✅ Connected! ${models.length} model${models.length !== 1 ? 's' : ''} available.` };
      } else {
        testResult = { success: false, message: `❌ Error ${res.status}: ${res.statusText}` };
      }
    } catch (err) {
      testResult = { success: false, message: `❌ Failed: ${err.message}` };
    } finally {
      testingConnection = false;
    }
  }

  async function handleSave() {
    if (!validateFanOutJson(fanOutModels)) return;
    saving = true;
    try {
      await setSetting('litellmUrl', litellmUrl.replace(/\/$/, ''));
      await setSetting('litellmApiKey', litellmApiKey);
      await setSetting('fanOutModels', fanOutModels);
      await setSetting('consolidationModel', consolidationModel);
      await setSetting('simplifierModel', simplifierModel);
      await setSetting('embeddingModel', embeddingModel);
      settingsOpen.set(false);
    } catch (e) {
      alert('Failed to save settings: ' + e.message);
    } finally {
      saving = false;
    }
  }

  function handleClose() {
    settingsOpen.set(false);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleClose}>
  <div class="modal slide-up" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <h2>⚙️ Settings</h2>
      <button class="btn btn-ghost btn-sm" onclick={handleClose}>✕</button>
    </div>

    <div class="modal-body">
      <!-- LiteLLM Proxy -->
      <fieldset class="settings-group">
        <legend>🔗 LiteLLM Proxy</legend>
        <label class="label">Proxy URL</label>
        <input class="input" type="url" bind:value={litellmUrl} placeholder="http://localhost:4000" />

        <label class="label" style="margin-top: var(--space-md);">API Key</label>
        <div class="password-field">
          <input class="input" type={showLitellmKey ? 'text' : 'password'} bind:value={litellmApiKey} placeholder="sk-..." />
          <button class="btn btn-ghost btn-sm toggle-vis" onclick={() => showLitellmKey = !showLitellmKey} type="button">
            {showLitellmKey ? '🙈' : '👁️'}
          </button>
        </div>

        <!-- Test Connection -->
        <div class="test-bar">
          <button class="btn btn-secondary btn-sm" onclick={testConnection} disabled={testingConnection} type="button">
            {#if testingConnection}
              <span class="spinner"></span> Testing...
            {:else}
              ⚡ Test Connection
            {/if}
          </button>
          {#if testResult}
            <span class="test-result" class:success={testResult.success} class:error={!testResult.success}>
              {testResult.message}
            </span>
          {/if}
        </div>
      </fieldset>

      <!-- Model Configuration -->
      <fieldset class="settings-group">
        <legend>🤖 Model Configuration</legend>

        <label class="label">Fan-Out Models (JSON array)</label>
        <input class="input" class:input-error={jsonError} bind:value={fanOutModels} placeholder='["gpt-4o","claude-sonnet-4-20250514"]' />
        {#if jsonError}
          <span class="field-error">{jsonError}</span>
        {:else}
          <span class="field-hint">Used in Steps 2, 4, 6 — multiple LLMs called in parallel</span>
        {/if}

        <label class="label" style="margin-top: var(--space-md);">Consolidation Model</label>
        <input class="input" bind:value={consolidationModel} placeholder="gpt-4o" />
        <span class="field-hint">Used in Steps 3, 5, 7 — single LLM for synthesis</span>

        <label class="label" style="margin-top: var(--space-md);">Simplifier Model</label>
        <input class="input" bind:value={simplifierModel} placeholder="gpt-4o" />
        <span class="field-hint">Used in Step 8 — single LLM to simplify output format</span>

        <label class="label" style="margin-top: var(--space-md);">Embedding Model</label>
        <input class="input" bind:value={embeddingModel} placeholder="text-embedding-3-small" />
        <span class="field-hint">Used for vector embeddings in hybrid search</span>
      </fieldset>
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick={handleClose}>Cancel</button>
      <button class="btn btn-primary" onclick={handleSave} disabled={!!jsonError || saving}>
        {#if saving}
          <span class="spinner"></span> Saving...
        {:else}
          Save Settings
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .settings-group {
    border: 1px solid var(--outline-variant);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    margin: 0;
  }
  .settings-group legend {
    font-weight: 600;
    font-size: var(--text-base);
    padding: 0 var(--space-sm);
  }

  .password-field {
    position: relative;
  }
  .password-field .input {
    padding-right: 44px;
  }
  .toggle-vis {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    padding: 4px 6px;
    font-size: 16px;
    opacity: 0.5;
    transition: opacity var(--transition-fast);
  }
  .toggle-vis:hover {
    opacity: 1;
  }

  .test-bar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-md);
    flex-wrap: wrap;
  }
  .test-result {
    font-size: var(--text-sm);
    font-weight: 500;
  }
  .test-result.success { color: var(--success); }
  .test-result.error { color: var(--error); }

  .field-hint {
    display: block;
    font-size: var(--text-xs);
    color: var(--on-surface-variant);
    margin-top: 4px;
    opacity: 0.7;
  }

  .field-error {
    display: block;
    font-size: var(--text-xs);
    color: var(--error);
    margin-top: 4px;
    font-weight: 500;
  }

  .input-error {
    border-color: var(--error) !important;
  }
  .input-error:focus {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
  }
</style>
