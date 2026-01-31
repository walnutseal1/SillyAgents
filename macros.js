// macros.js
// ────────────────────────────────────────────────
// Shared / utility macros for SillyTavern UI extensions
// Import this file wherever you need these macros registered
// Usage: import './macros.js';  (in index.js or other module)
// ────────────────────────────────────────────────

import { getContext } from '/scripts/extensions.js';

const context = getContext();

// ────────────────────────────────────────────────
// Helper: Get unmasked GPU info via WebGL
// ────────────────────────────────────────────────
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

// ────────────────────────────────────────────────
// Hardware macros
// ────────────────────────────────────────────────

context.registerMacro('cpu_cores', () => {
    return navigator.hardwareConcurrency || 'unknown';
});

context.registerMacro('ram_gb', () => {
    return navigator.deviceMemory 
        ? `${navigator.deviceMemory} GB` 
        : 'unknown / not supported';
});

context.registerMacro('gpu', () => {
    return getGPUInfo();
});

context.registerMacro('vram', async () => {
    if (!navigator.gpu) return 'WebGPU not supported';
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return 'No GPU adapter';
        return 'unknown (no direct API) – adapter limits suggest ' + 
               (adapter.limits?.maxBufferSize / 1e9 || '?').toFixed(1) + '+ GB possible?';
    } catch (e) {
        return `WebGPU error: ${e.message}`;
    }
});

context.registerMacro('hardware_summary', () => {
    const cpu = navigator.hardwareConcurrency || '?';
    const ram = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : '?';
    const gpu = getGPUInfo();
    return `CPU: ~${cpu} logical cores | RAM: ~${ram} | GPU: ${gpu}`;
});

// ────────────────────────────────────────────────
// Chat history macro: last_code_block
// ────────────────────────────────────────────────
context.registerMacro('last_code_block', () => {
    const chat = context.chat || [];
    if (chat.length === 0) return '(no messages)';

    const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)\s*```/g;

    for (let i = chat.length - 1; i >= 0; i--) {
        const text = chat[i].mes || '';
        let match;
        let lastMatch = null;
        while ((match = codeBlockRegex.exec(text)) !== null) {
            lastMatch = match;
        }
        if (lastMatch) {
            return lastMatch[1].trim();
        }
    }

    return '(no code block found)';
});

// ────────────────────────────────────────────────
// Context size macros
// ────────────────────────────────────────────────
context.registerMacro('context_left', () => {
    const max  = context.maxContext || context.maxContextSize || 4096;
    const used = context.contextSize || 0;

    if (!max || max <= 0) {
        return '(context size unknown)';
    }

    const left = Math.max(0, max - used);
    const percent = Math.round((left / max) * 100);

    return `${left} tokens left (~${percent}% free)`;
});

context.registerMacro('context_used', () => {
    return context.contextSize || '(unknown)';
});

context.registerMacro('context_max', () => {
    return context.maxContext || context.maxContextSize || '(unknown)';
});

// Optional: colored version (uncomment if desired)
// context.registerMacro('context_left_colored', () => {
//     const max  = context.maxContext || 4096;
//     const used = context.contextSize || 0;
//     const left = Math.max(0, max - used);
//     const perc = Math.round((left / max) * 100);
//
//     let color = 'green';
//     if (perc < 30) color = 'orange';
//     if (perc < 10) color = 'red';
//
//     return `<span style="color:${color}">${left}</span> tokens left (${perc}%)`;
// });

console.log('[macros.js] All utility macros registered');
