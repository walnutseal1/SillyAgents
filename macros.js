/**
 * SillyAgents — Macro registration.
 * 
 * Merges the existing hardware/context macros with new tool-call macro caching.
 * All macros are registered immediately when this module is imported.
 * Exported init() sets up event listeners for live updates (lastCapturedCode).
 */

import { MODULE_NAME, log } from './utils.js';

const context = SillyTavern.getContext();

// ─── runtime cache ───────────────────────────────────────────────────────────
// Written by the prompt interceptor or event listeners; read by macro callbacks.

let _lastCapturedCode   = '';
let _cachedToolResults  = {};   // { "toolName": "result string" }

/**
 * Called by the prompt interceptor to cache a tool result before generation.
 * @param {string} toolName
 * @param {string} result
 */
export function cacheToolResult(toolName, result) {
    _cachedToolResults[toolName] = result;
}

/**
 * Called by CHARACTER_MESSAGE_RENDERED listener to extract the last code block.
 * @param {string} messageText
 */
export function updateLastCapturedCode(messageText) {
    const blocks = messageText.match(/```(?:\w*\n)?([\s\S]*?)```/g);
    if (blocks && blocks.length > 0) {
        const last = blocks[blocks.length - 1];
        _lastCapturedCode = last.replace(/^```\w*\n?/, '').replace(/```$/, '');
    }
}

// ─── Helper: Get unmasked GPU info via WebGL ─────────────────────────────────

function getGPUInfo() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'WebGL not supported';

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return 'Masked / no debug info';

        const vendor   = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

        return `${vendor} – ${renderer}`;
    } catch (e) {
        return 'Error detecting GPU';
    }
}

// ─── Hardware macros ─────────────────────────────────────────────────────────

context.registerMacro('CPU', () => {
    return String(navigator.hardwareConcurrency || 'unknown');
});

context.registerMacro('RAM', () => {
    return navigator.deviceMemory 
        ? `${navigator.deviceMemory} GB` 
        : 'unknown';
});

context.registerMacro('GPU', () => {
    return getGPUInfo();
});

context.registerMacro('VRAM', () => {
    // VRAM is not directly available in browsers; this is a placeholder.
    // Could attempt WebGPU adapter limits as a rough estimate, but keeping it simple.
    return 'unknown (not exposed by browser)';
});

// ─── Context macros ──────────────────────────────────────────────────────────

context.registerMacro('contextRemaining', () => {
    const max  = context.maxContext || context.maxContextSize || 4096;
    const used = context.contextSize || 0;

    if (!max || max <= 0) {
        return '(context size unknown)';
    }

    const left = Math.max(0, max - used);
    const percent = Math.round((left / max) * 100);

    return `${left} tokens (~${percent}% free)`;
});

context.registerMacro('contextUsed', () => {
    return String(context.contextSize || '(unknown)');
});

context.registerMacro('contextMax', () => {
    return String(context.maxContext || context.maxContextSize || '(unknown)');
});

// ─── Tool call / chat history macros ─────────────────────────────────────────

context.registerMacro('lastCapturedCode', () => {
    return _lastCapturedCode || '(no code block captured)';
});

// ─── init (called by index.js) ───────────────────────────────────────────────

/**
 * Set up event listeners for live macro updates.
 * Macros themselves are already registered above.
 */
export async function init() {
    const { eventSource, event_types } = SillyTavern.getContext();

    // Update lastCapturedCode whenever a new LLM message is rendered.
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        try {
            const { chat } = SillyTavern.getContext();
            const msg = chat?.find(m => m.id === messageId) ?? chat?.[chat.length - 1];
            if (msg?.mes) updateLastCapturedCode(msg.mes);
        } catch (e) { /* non-fatal */ }
    });

    log('Macro event listeners attached.');
}
