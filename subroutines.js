/**
 * SillyAgents — Subroutine loop runtime.
 *
 * Responsibilities:
 *   • Manage the setInterval loop for the active subroutine (if any).
 *   • Evaluate triggers (time / tool / api) on each tick.
 *   • Inject heartbeat messages and kick off generation.
 *   • Implement auto-queue: re-prompt if the model didn't call a tool.
 *
 * Communication contract:
 *   LISTENS FOR (custom events via eventSource):
 *     sa:config-changed   — panel or chat-list told us config was written; restart loop if needed.
 *     sa:subroutine-created — chat-list created a new subroutine; switch into it.
 *   EMITS:
 *     sa:loop-state        — { running: bool } — panel listens to update its toggle UI.
 */

import { getSubroutineConfig, isCurrentChatSubroutine, log, logError, logWarn } from './utils.js';

// ─── state ───────────────────────────────────────────────────────────────────

let _intervalId   = null;   // setInterval handle
let _isRunning    = false;  // logical flag (mirrors config.running)
let _isGenerating = false;  // guard: don't overlap generations

// ─── public API ──────────────────────────────────────────────────────────────

export async function init() {
    const { eventSource, event_types } = SillyTavern.getContext();

    // When the user switches chats, stop any running loop then maybe start a new one.
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    // When generation ends, auto-queue may need to fire.
    eventSource.on(event_types.GENERATION_ENDED, onGenerationEnded);

    // Custom events from sibling modules.
    eventSource.on('sa:config-changed',       onConfigChanged);
    eventSource.on('sa:subroutine-created',   onSubroutineCreated);

    // On first load, if we're already in a subroutine that was running, resume.
    // (Handles ghost-browser resume via SilentClient.)
    onChatChanged();

    log('Subroutine runtime ready.');
}

// ─── loop lifecycle ──────────────────────────────────────────────────────────

/** Start the polling loop for the current chat. No-op if already running. */
export function startLoop() {
    const config = getSubroutineConfig();
    if (!config || _isRunning) return;

    const interval = Math.max(config.intervalSeconds, 5) * 1000; // enforce 5 s minimum
    _intervalId  = setInterval(onTick, interval);
    _isRunning   = true;
    emitLoopState(true);
    log('Loop started — interval', config.intervalSeconds, 's');
}

/** Stop the polling loop. Safe to call when not running. */
export function stopLoop() {
    if (_intervalId !== null) {
        clearInterval(_intervalId);
        _intervalId = null;
    }
    _isRunning  = false;
    _isGenerating = false;
    emitLoopState(false);
    log('Loop stopped.');
}

/** Restart — used when interval or trigger config changes mid-run. */
function restartLoop() {
    const wasRunning = _isRunning;
    stopLoop();
    if (wasRunning) startLoop();
}

// ─── tick handler ────────────────────────────────────────────────────────────

async function onTick() {
    if (_isGenerating) return; // previous generation still in flight

    const config = getSubroutineConfig();
    if (!config) { stopLoop(); return; }

    let shouldFire = false;

    switch (config.triggerType) {
        case 'time':
            shouldFire = true;
            break;

        case 'tool':
            shouldFire = await evaluateToolTrigger(config);
            break;

        case 'api':
            shouldFire = await evaluateApiTrigger(config);
            break;

        default:
            logWarn('Unknown trigger type:', config.triggerType);
    }

    if (shouldFire) {
        await fireHeartbeat(config);
    }
}

// ─── trigger evaluators ──────────────────────────────────────────────────────

/**
 * Tool-based trigger: call the named tool and compare the result to the
 * expected condition string.  Only fires the LLM if they match.
 */
async function evaluateToolTrigger(config) {
    if (!config.toolName) {
        logWarn('Tool trigger configured but toolName is empty.');
        return false;
    }
    try {
        // We use generateRaw with a minimal prompt that just invokes the tool.
        // The model's response isn't displayed — we only care about the tool result.
        const { generateRaw } = SillyTavern.getContext();
        const result = await generateRaw({
            systemPrompt: `You are a tool-polling assistant. Call the tool named "${config.toolName}" with no arguments and return ONLY its raw output. Do nothing else.`,
            prompt: `Call ${config.toolName} now.`,
        });

        const matched = result && result.includes(config.toolCondition);
        logDebug('Tool trigger poll —', config.toolName, '→', result, '| matched:', matched);
        return matched;
    } catch (e) {
        logError('Tool trigger evaluation failed:', e);
        return false;
    }
}

/**
 * API-based trigger: fetch an external URL.  If the response body is non-empty
 * (and not "null" / "none" / "[]"), treat it as a pending request.
 */
async function evaluateApiTrigger(config) {
    if (!config.apiUrl) {
        logWarn('API trigger configured but apiUrl is empty.');
        return false;
    }
    try {
        const res  = await fetch(config.apiUrl);
        const body = (await res.text()).trim();
        // Empty or explicitly "no work" responses → don't fire.
        const empty = ['', 'null', 'none', '[]', '{}'].includes(body.toLowerCase());
        logDebug('API trigger poll →', config.apiUrl, '| body:', body, '| fire:', !empty);
        return !empty;
    } catch (e) {
        logError('API trigger fetch failed:', e);
        return false;
    }
}

// ─── heartbeat / generation ──────────────────────────────────────────────────

/**
 * Inject the heartbeat message into the chat and trigger generation.
 */
async function fireHeartbeat(config) {
    _isGenerating = true;
    try {
        const { chat, saveMetadata } = SillyTavern.getContext();

        // Build a user-side heartbeat message and push it into the live chat array.
        const heartbeat = {
            is_user:    true,
            name:       'User',
            send_date:  new Date().toLocaleString(),
            mes:        config.heartbeatMessage || '[heartbeat]',
            id:         chat.length,
        };
        chat.push(heartbeat);

        // Persist so it survives a reload.
        await saveMetadata();

        // Trigger the normal generation pipeline (uses current character context).
        const { generateQuietPrompt } = SillyTavern.getContext();
        await generateQuietPrompt({ quietPrompt: config.heartbeatMessage || '[heartbeat]' });

        log('Heartbeat fired.');
    } catch (e) {
        logError('Heartbeat generation failed:', e);
    } finally {
        _isGenerating = false;
    }
}

// ─── auto-queue ──────────────────────────────────────────────────────────────

/**
 * After every generation ends, check whether auto-queue should re-prompt.
 * Auto-queue fires if:
 *   1. We're in a running subroutine with autoQueue enabled.
 *   2. The model's last message did NOT contain a tool call.
 * This keeps the subroutine alive even when models forget to call tools.
 */
async function onGenerationEnded() {
    const config = getSubroutineConfig();
    if (!config || !config.running || !config.autoQueue) return;

    const { chat } = SillyTavern.getContext();
    const lastMsg  = chat?.[chat.length - 1];

    // Heuristic: if the last message contains a tool_calls block, the model
    // is doing its job — don't re-prompt.
    if (lastMsg?.mes && lastMsg.mes.includes('[tool_calls]')) return;

    // Re-prompt with the customisable auto-queue prompt.
    _isGenerating = true;
    try {
        const { generateQuietPrompt } = SillyTavern.getContext();
        await generateQuietPrompt({ quietPrompt: config.autoQueuePrompt });
        log('Auto-queue re-prompt fired.');
    } catch (e) {
        logError('Auto-queue re-prompt failed:', e);
    } finally {
        _isGenerating = false;
    }
}

// ─── event handlers ──────────────────────────────────────────────────────────

function onChatChanged() {
    // Always stop whatever was running — it belonged to the previous chat.
    stopLoop();

    // If the new chat is a subroutine that was marked running, resume.
    const config = getSubroutineConfig();
    if (config?.running) {
        startLoop();
    }
}

function onConfigChanged() {
    const config = getSubroutineConfig();
    if (!config) { stopLoop(); return; }

    if (config.running && !_isRunning) {
        startLoop();
    } else if (!config.running && _isRunning) {
        stopLoop();
    } else if (_isRunning) {
        // Still running but something changed (e.g. interval) — restart.
        restartLoop();
    }
}

async function onSubroutineCreated() {
    // The chat-list module already switched us into the new chat.
    // Give the CHAT_CHANGED event a tick to fire, then check.
    await new Promise(r => setTimeout(r, 100));
    const config = getSubroutineConfig();
    if (config?.running) startLoop();
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function emitLoopState(running) {
    const { eventSource } = SillyTavern.getContext();
    eventSource.emit('sa:loop-state', { running });
}

// Import logDebug locally — utils exports it but we alias for clarity here.
import { logDebug } from './utils.js';
