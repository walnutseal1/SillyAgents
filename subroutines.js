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

import { getSubroutineConfig, isCurrentChatSubroutine, log, logError, logWarn, logDebug } from './utils.js';
import { generateFromChatId } from './gen.js';

// NOTE: getSubroutineConfig now takes chatId parameter: getSubroutineConfig(chatId)

// ─── state ───────────────────────────────────────────────────────────────────

// Map of chatId -> { intervalId, isGenerating }
const _runningLoops = new Map();

// ─── public API ──────────────────────────────────────────────────────────────

export async function init() {
    const { eventSource, event_types } = SillyTavern.getContext();

    // Custom events from sibling modules.
    eventSource.on('sa:config-changed',       onConfigChanged);
    eventSource.on('sa:subroutine-created',   onSubroutineCreated);

    // On first load, scan all chats and start any running subroutines.
    // (Handles ghost-browser resume via SilentClient.)
    await startAllRunningSubroutines();

    log('Subroutine runtime ready.');
}

// ─── loop lifecycle ──────────────────────────────────────────────────────────

/** Start the polling loop for a specific chatId. No-op if already running. */
export function startLoop(chatId) {
    if (!chatId) {
        logWarn('startLoop called without chatId');
        return;
    }

    if (_runningLoops.has(chatId)) {
        logDebug('Loop already running for', chatId);
        return;
    }

    const config = getSubroutineConfig(chatId);
    if (!config) {
        logWarn('No subroutine config found for', chatId);
        return;
    }

    const interval = Math.max(config.intervalSeconds, 5) * 1000; // enforce 5 s minimum
    const intervalId = setInterval(() => onTick(chatId), interval);
    
    _runningLoops.set(chatId, {
        intervalId,
        isGenerating: false,
    });

    emitLoopState(chatId, true);
    log('Loop started for', chatId, '— interval', config.intervalSeconds, 's');
}

/** Stop the polling loop for a specific chatId. Safe to call when not running. */
export function stopLoop(chatId) {
    if (!chatId) {
        logWarn('stopLoop called without chatId');
        return;
    }

    const loopState = _runningLoops.get(chatId);
    if (!loopState) {
        logDebug('No loop running for', chatId);
        return;
    }

    clearInterval(loopState.intervalId);
    _runningLoops.delete(chatId);
    
    emitLoopState(chatId, false);
    log('Loop stopped for', chatId);
}

/** Restart a loop — used when interval or trigger config changes mid-run. */
function restartLoop(chatId) {
    const wasRunning = _runningLoops.has(chatId);
    stopLoop(chatId);
    if (wasRunning) startLoop(chatId);
}

/** Scan all chats and start loops for any running subroutines. */
async function startAllRunningSubroutines() {
    try {
        // Get list of all chats from SillyTavern
        const { getChats } = SillyTavern.getContext();
        const chats = await getChats();

        for (const chat of chats) {
            const config = getSubroutineConfig(chat.file_name);
            if (config?.running) {
                startLoop(chat.file_name);
            }
        }

        log('Scanned chats, started', _runningLoops.size, 'subroutine(s)');
    } catch (e) {
        logError('Failed to start all running subroutines:', e);
    }
}

// ─── tick handler ────────────────────────────────────────────────────────────

async function onTick(chatId) {
    const loopState = _runningLoops.get(chatId);
    if (!loopState) {
        logWarn('Tick fired for non-running loop:', chatId);
        return;
    }

    if (loopState.isGenerating) {
        logDebug('Skipping tick for', chatId, '— generation in progress');
        return;
    }

    const config = getSubroutineConfig(chatId);
    if (!config) { 
        stopLoop(chatId); 
        return; 
    }

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
        await fireHeartbeat(chatId, config);
    }
}

// ─── trigger evaluators ──────────────────────────────────────────────────────

/**
 * Tool-based trigger: directly invoke the registered function tool and compare 
 * the result to the expected condition string. Only fires the LLM if they match.
 */
async function evaluateToolTrigger(config) {
    if (!config.toolName) {
        logWarn('Tool trigger configured but toolName is empty.');
        return false;
    }
    
    try {
        const ToolManager = SillyTavern.getContext().ToolManager;
        
        // Verify the tool exists and is callable
        if (!ToolManager || typeof ToolManager.invokeFunctionTool !== 'function') {
            logError('ToolManager not available or invokeFunctionTool not found');
            return false;
        }
        
        // Directly invoke the tool with empty parameters (most trigger tools don't need args)
        const result = await ToolManager.invokeFunctionTool(config.toolName, {});
        
        // If result is an Error object, the tool failed
        if (result instanceof Error) {
            logWarn('Tool trigger failed:', config.toolName, '→', result.message);
            return false;
        }
        
        // Convert result to string and check against condition
        const resultStr = String(result || '');
        const matched = resultStr.includes(config.toolCondition);
        
        logDebug('Tool trigger poll —', config.toolName, '→', resultStr, '| matched:', matched);
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
 * Now uses generateFromChatId to work with background chats.
 * Handles tool execution loop and auto-queue inline.
 */
async function fireHeartbeat(chatId, config) {
    const loopState = _runningLoops.get(chatId);
    if (!loopState) return;

    loopState.isGenerating = true;
    try {
        // Load the chat data to append heartbeat message
        const chatData = await loadChatData(chatId);
        if (!chatData) {
            logError('Failed to load chat data for', chatId);
            return;
        }

        // Build heartbeat message
        const heartbeat = {
            is_user: true,
            name: 'User',
            send_date: new Date().toISOString(),
            mes: config.heartbeatMessage || '[heartbeat]',
        };

        // Append to chat
        chatData.chat.push(heartbeat);
        await saveChatData(chatId, chatData);

        // Generate response using the indirect generation function
        let result = await generateFromChatId(chatId);
        
        // Handle tool calls if present - manual execution loop
        if (result.tool_calls && result.tool_calls.length > 0) {
            logDebug('Generated with', result.tool_calls.length, 'tool call(s) for', chatId);
            
            // Execute each tool call
            const ToolManager = SillyTavern.getContext().ToolManager;
            for (const toolCall of result.tool_calls) {
                try {
                    const toolResult = await ToolManager.invokeFunctionTool(
                        toolCall.function.name,
                        JSON.parse(toolCall.function.arguments || '{}')
                    );
                    
                    // Append tool result to chat
                    const toolMessage = {
                        is_user: false,
                        name: 'System',
                        send_date: new Date().toISOString(),
                        mes: `[Tool: ${toolCall.function.name}]\n${toolResult}`,
                        extra: { tool_call_id: toolCall.id }
                    };
                    chatData.chat.push(toolMessage);
                    await saveChatData(chatId, chatData);
                } catch (e) {
                    logError('Tool execution failed:', toolCall.function.name, e);
                }
            }
            
            // After tool execution, generate again to get the model's response to tool results
            result = await generateFromChatId(chatId);
        }
        
        // Auto-queue: check if we should re-prompt
        if (config.autoQueue) {
            // If the model didn't call any tools and auto-queue is enabled, re-prompt
            if (!result.tool_calls || result.tool_calls.length === 0) {
                logDebug('Auto-queue: no tool calls detected, re-prompting for', chatId);
                
                const autoQueueMsg = {
                    is_user: true,
                    name: 'User',
                    send_date: new Date().toISOString(),
                    mes: config.autoQueuePrompt || 'Continue or call the finish tool if done.',
                };
                chatData.chat.push(autoQueueMsg);
                await saveChatData(chatId, chatData);
                
                await generateFromChatId(chatId);
            }
        }

        log('Heartbeat fired for', chatId);
    } catch (e) {
        logError('Heartbeat generation failed for', chatId, ':', e);
    } finally {
        loopState.isGenerating = false;
    }
}

/** Helper to load chat data from file */
async function loadChatData(chatId) {
    try {
        const { loadChat } = SillyTavern.getContext();
        return await loadChat(chatId);
    } catch (e) {
        logError('Failed to load chat:', chatId, e);
        return null;
    }
}

/** Helper to save chat data to file */
async function saveChatData(chatId, chatData) {
    try {
        const { saveChat } = SillyTavern.getContext();
        await saveChat(chatId, chatData);
    } catch (e) {
        logError('Failed to save chat:', chatId, e);
    }
}

// ─── event handlers ──────────────────────────────────────────────────────────

function onConfigChanged(data) {
    // data should contain chatId
    const chatId = data?.chatId;
    if (!chatId) {
        logWarn('onConfigChanged called without chatId');
        return;
    }

    const config = getSubroutineConfig(chatId);
    if (!config) { 
        stopLoop(chatId); 
        return; 
    }

    const isRunning = _runningLoops.has(chatId);

    if (config.running && !isRunning) {
        startLoop(chatId);
    } else if (!config.running && isRunning) {
        stopLoop(chatId);
    } else if (isRunning) {
        // Still running but something changed (e.g. interval) — restart.
        restartLoop(chatId);
    }
}

async function onSubroutineCreated(data) {
    // data should contain chatId
    const chatId = data?.chatId;
    if (!chatId) {
        logWarn('onSubroutineCreated called without chatId');
        return;
    }

    // Give the system a tick to settle
    await new Promise(r => setTimeout(r, 100));
    
    const config = getSubroutineConfig(chatId);
    if (config?.running) {
        startLoop(chatId);
    }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function emitLoopState(chatId, running) {
    const { eventSource } = SillyTavern.getContext();
    eventSource.emit('sa:loop-state', { chatId, running });
}
