/**
 * SillyAgents — Subroutine settings side-panel.
 *
 * Responsibilities:
 *   • Inject the panel DOM once into the page.
 *   • Show/hide it based on whether the current chat is a subroutine.
 *   • Render all config controls from chatMetadata.
 *   • Write changes back to chatMetadata and emit sa:config-changed.
 *
 * Communication contract:
 *   LISTENS FOR:
 *     CHAT_CHANGED        — show or hide panel, re-populate fields.
 *     sa:loop-state        — update the running toggle to reflect actual state.
 *   EMITS:
 *     sa:config-changed   — after any config write, so subroutines.js can react.
 */

import { getSubroutineConfig, setSubroutineConfig, isCurrentChatSubroutine, log } from './utils.js';

// ─── DOM references (set once during init) ───────────────────────────────────
let $panel      = null;   // the root panel element
let $body       = null;   // scrollable inner body
let $toggleBtn  = null;   // the open/close button we inject into the top bar

// ─── panel HTML template ─────────────────────────────────────────────────────
// Uses SA-prefixed IDs to avoid any collision with ST internals.

const PANEL_HTML = `
<div id="sa-panel" class="sa-side-panel">
  <div class="sa-panel-header">
    <span class="sa-panel-title">⚙ Subroutine Settings</span>
    <button id="sa-panel-close" class="sa-panel-close-btn" title="Close">✕</button>
  </div>
  <div id="sa-panel-body" class="sa-panel-body">

    <!-- ── Running toggle ── -->
    <div class="sa-config-section">
      <label class="sa-label sa-label-row">
        <input type="checkbox" id="sa-cfg-running" class="sa-checkbox">
        <span>Running</span>
      </label>
    </div>

    <!-- ── Trigger type ── -->
    <div class="sa-config-section">
      <label class="sa-label">Trigger Type</label>
      <select id="sa-cfg-triggerType" class="sa-select">
        <option value="time">Time-based</option>
        <option value="tool">Tool-based</option>
        <option value="api">API-based</option>
      </select>
    </div>

    <!-- ── Interval ── -->
    <div class="sa-config-section">
      <label class="sa-label">Interval (seconds)</label>
      <input type="number" id="sa-cfg-intervalSeconds" class="sa-input" min="5" step="5" value="300">
    </div>

    <!-- ── Tool trigger fields (shown only when triggerType === 'tool') ── -->
    <div class="sa-config-section sa-trigger-tool" id="sa-tool-fields">
      <label class="sa-label">Tool Name</label>
      <input type="text" id="sa-cfg-toolName" class="sa-input" placeholder="e.g. check_email">
      <label class="sa-label" style="margin-top:8px;">Trigger Condition</label>
      <input type="text" id="sa-cfg-toolCondition" class="sa-input" placeholder="Text that must appear in tool result">
    </div>

    <!-- ── API trigger fields (shown only when triggerType === 'api') ── -->
    <div class="sa-config-section sa-trigger-api" id="sa-api-fields">
      <label class="sa-label">Poll URL</label>
      <input type="text" id="sa-cfg-apiUrl" class="sa-input" placeholder="https://example.com/pending">
    </div>

    <!-- ── Heartbeat message ── -->
    <div class="sa-config-section">
      <label class="sa-label">Heartbeat Message</label>
      <input type="text" id="sa-cfg-heartbeatMessage" class="sa-input" value="[heartbeat]">
    </div>

    <!-- ── Auto-queue ── -->
    <div class="sa-config-section">
      <label class="sa-label sa-label-row">
        <input type="checkbox" id="sa-cfg-autoQueue" class="sa-checkbox">
        <span>Auto-Queue</span>
      </label>
    </div>
    <!-- Auto-queue prompt (shown only when autoQueue is on) -->
    <div class="sa-config-section" id="sa-autoqueue-fields">
      <label class="sa-label">Auto-Queue Prompt</label>
      <textarea id="sa-cfg-autoQueuePrompt" class="sa-textarea" rows="3"
        placeholder="Prompt sent when the model doesn't call a tool"></textarea>
    </div>

    <!-- ── Misc options ── -->
    <div class="sa-config-section">
      <label class="sa-label sa-label-row">
        <input type="checkbox" id="sa-cfg-useSummary" class="sa-checkbox">
        <span>Use Summariser</span>
      </label>
    </div>
    <div class="sa-config-section">
      <label class="sa-label sa-label-row">
        <input type="checkbox" id="sa-cfg-useLorebooks" class="sa-checkbox">
        <span>Use Lorebooks</span>
      </label>
    </div>
    <div class="sa-config-section">
      <label class="sa-label sa-label-row">
        <input type="checkbox" id="sa-cfg-useExampleMessages" class="sa-checkbox">
        <span>Use Example Messages</span>
      </label>
    </div>

    <!-- ── Color picker ── -->
    <div class="sa-config-section sa-color-row">
      <label class="sa-label">Chat Color</label>
      <input type="color" id="sa-cfg-color" class="sa-color-input" value="#4a90d9">
    </div>

  </div><!-- end panel-body -->
</div>
`;

// ─── init ─────────────────────────────────────────────────────────────────────

export async function init() {
    const { eventSource, event_types } = SillyTavern.getContext();

    // 1. Inject panel DOM (hidden by default).
    document.body.insertAdjacentHTML('beforeend', PANEL_HTML);
    $panel = document.getElementById('sa-panel');
    $body  = document.getElementById('sa-panel-body');

    // 2. Inject the toggle button into the top bar (next to existing panel icons).
    injectToggleButton();

    // 3. Wire up close button.
    document.getElementById('sa-panel-close').addEventListener('click', closePanel);

    // 4. Listen to ST events.
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on('sa:loop-state', onLoopState);

    // 5. Attach change listeners to every form control inside the panel.
    attachFormListeners();

    // 6. Initial render (in case we loaded directly into a subroutine chat).
    onChatChanged();

    log('Subroutine panel ready.');
}

// ─── toggle button injection ─────────────────────────────────────────────────

function injectToggleButton() {
    // We look for the "Connections" or similar icon cluster in the top bar and
    // append our button after it.  If we can't find an anchor, we fall back to
    // appending directly into #top-bar.
    const topBar = document.getElementById('top-bar');
    if (!topBar) { log('Warning: #top-bar not found — toggle button not injected.'); return; }

    const btn = document.createElement('button');
    btn.id        = 'sa-panel-toggle';
    btn.className = 'sa-topbar-btn';
    btn.title     = 'Subroutine Settings';
    btn.innerHTML = '⚙';   // placeholder icon — swap for SVG/icon font later
    btn.style.display = 'none'; // hidden until we're in a subroutine chat

    btn.addEventListener('click', () => {
        $panel.classList.contains('sa-panel-open') ? closePanel() : openPanel();
    });

    topBar.appendChild(btn);
    $toggleBtn = btn;
}

// ─── open / close ────────────────────────────────────────────────────────────

function openPanel() {
    $panel.classList.add('sa-panel-open');
    // Push #sheld narrower so the panel doesn't cover the chat.
    document.getElementById('sheld')?.classList.add('sa-sheld-narrowed');
}

function closePanel() {
    $panel.classList.remove('sa-panel-open');
    document.getElementById('sheld')?.classList.remove('sa-sheld-narrowed');
}

// ─── chat changed ────────────────────────────────────────────────────────────

function onChatChanged() {
    const isSub = isCurrentChatSubroutine();

    // Toggle button visibility.
    if ($toggleBtn) $toggleBtn.style.display = isSub ? 'flex' : 'none';

    if (isSub) {
        populateForm();
        openPanel();       // auto-open when entering a subroutine
    } else {
        closePanel();      // auto-close when leaving
    }
}

// ─── form population ─────────────────────────────────────────────────────────

function populateForm() {
    const config = getSubroutineConfig();
    if (!config) return;

    setVal('sa-cfg-running',            config.running);
    setVal('sa-cfg-triggerType',        config.triggerType);
    setVal('sa-cfg-intervalSeconds',    config.intervalSeconds);
    setVal('sa-cfg-toolName',           config.toolName);
    setVal('sa-cfg-toolCondition',      config.toolCondition);
    setVal('sa-cfg-apiUrl',             config.apiUrl);
    setVal('sa-cfg-heartbeatMessage',   config.heartbeatMessage);
    setVal('sa-cfg-autoQueue',          config.autoQueue);
    setVal('sa-cfg-autoQueuePrompt',    config.autoQueuePrompt);
    setVal('sa-cfg-useSummary',         config.useSummary);
    setVal('sa-cfg-useLorebooks',       config.useLorebooks);
    setVal('sa-cfg-useExampleMessages', config.useExampleMessages);
    setVal('sa-cfg-color',              config.color);

    updateConditionalVisibility();
}

// ─── form → metadata ─────────────────────────────────────────────────────────

function attachFormListeners() {
    // Single delegated listener on the panel body — catches all inputs/selects/checkboxes.
    $body.addEventListener('input',  onFormChange);
    $body.addEventListener('change', onFormChange);
}

async function onFormChange() {
    const config = getSubroutineConfig();
    if (!config) return;   // not a subroutine — ignore

    // Read every control back into the config object.
    config.running            = getVal('sa-cfg-running');
    config.triggerType        = getVal('sa-cfg-triggerType');
    config.intervalSeconds    = Number(getVal('sa-cfg-intervalSeconds')) || 300;
    config.toolName           = getVal('sa-cfg-toolName');
    config.toolCondition      = getVal('sa-cfg-toolCondition');
    config.apiUrl             = getVal('sa-cfg-apiUrl');
    config.heartbeatMessage   = getVal('sa-cfg-heartbeatMessage');
    config.autoQueue          = getVal('sa-cfg-autoQueue');
    config.autoQueuePrompt    = getVal('sa-cfg-autoQueuePrompt');
    config.useSummary         = getVal('sa-cfg-useSummary');
    config.useLorebooks       = getVal('sa-cfg-useLorebooks');
    config.useExampleMessages = getVal('sa-cfg-useExampleMessages');
    config.color              = getVal('sa-cfg-color');

    // Persist.
    await setSubroutineConfig(config);

    // Tell subroutines.js the config changed — it decides whether to start/stop/restart.
    const { eventSource } = SillyTavern.getContext();
    await eventSource.emit('sa:config-changed');

    // Also tell chat-list.js to re-colour this chat.
    await eventSource.emit('sa:color-changed', { color: config.color });

    updateConditionalVisibility();
}

// ─── conditional field visibility ────────────────────────────────────────────

function updateConditionalVisibility() {
    const triggerType = getVal('sa-cfg-triggerType');
    const autoQueue   = getVal('sa-cfg-autoQueue');

    show('sa-tool-fields',       triggerType === 'tool');
    show('sa-api-fields',        triggerType === 'api');
    show('sa-autoqueue-fields',  autoQueue);
}

// ─── loop state from subroutines.js ──────────────────────────────────────────

function onLoopState({ running }) {
    // Sync the checkbox to match the actual runtime state (in case of external stop).
    const el = document.getElementById('sa-cfg-running');
    if (el) el.checked = running;
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function getVal(id) {
    const el = document.getElementById(id);
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
}

function setVal(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') { el.checked = !!value; return; }
    el.value = value ?? '';
}

function show(id, visible) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
}
