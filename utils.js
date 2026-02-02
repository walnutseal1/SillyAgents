/**
 * SillyAgents — shared utilities.
 * Pure helpers only. No side-effects, no event listeners, no DOM.
 * Every other module imports from here; nothing imports from them.
 */

export const MODULE_NAME = 'sillyagents';

// ─── chatMetadata helpers ────────────────────────────────────────────────────
// Always re-read chatMetadata from context (the reference changes on chat switch).

/**
 * Returns the sillyagents config block from the current chat, or null if this
 * chat is not a subroutine.
 * @returns {SubroutineConfig|null}
 */
export function getSubroutineConfig() {
    const meta = SillyTavern.getContext().chatMetadata;
    return meta?.sillyagents ?? null;
}

/**
 * Writes a full config object into the current chat's metadata and persists it.
 * @param {SubroutineConfig} config
 */
export async function setSubroutineConfig(config) {
    SillyTavern.getContext().chatMetadata['sillyagents'] = config;
    await SillyTavern.getContext().saveMetadata();
}

/**
 * Convenience: is the *current* chat a subroutine?
 * @returns {boolean}
 */
export function isCurrentChatSubroutine() {
    return getSubroutineConfig() !== null;
}

// ─── default config factory ──────────────────────────────────────────────────

/**
 * @typedef {Object} SubroutineConfig
 * @property {boolean}  isSubroutine
 * @property {'time'|'tool'|'api'} triggerType
 * @property {number}   intervalSeconds   - polling interval (all trigger types)
 * @property {string}   toolName          - tool to poll (tool-based triggers)
 * @property {string}   toolCondition     - value that must be returned to fire
 * @property {string}   apiUrl            - external URL to poll (api-based triggers)
 * @property {boolean}  autoQueue         - auto-queue mode on/off
 * @property {string}   autoQueuePrompt   - prompt sent when model goes silent
 * @property {string}   heartbeatMessage  - message sent on each tick
 * @property {boolean}  useSummary        - use native summariser for compression
 * @property {string}   color             - hex color for chat list indicator
 * @property {boolean}  useLorebooks      - include lorebooks in context
 * @property {boolean}  useExampleMessages- include example messages in context
 * @property {boolean}  running           - is the loop currently active
 */

/** @returns {SubroutineConfig} */
export function defaultSubroutineConfig() {
    return {
        isSubroutine:       true,
        triggerType:        'time',
        intervalSeconds:    300,          // 5 min
        toolName:           '',
        toolCondition:      '',
        apiUrl:             '',
        autoQueue:          false,
        autoQueuePrompt:    'Continue working on the current task. Call a tool or report your status.',
        heartbeatMessage:   '[heartbeat]',
        useSummary:         false,
        color:              '#4a90d9',
        useLorebooks:       true,
        useExampleMessages: true,
        running:            false,
    };
}

// ─── logging ─────────────────────────────────────────────────────────────────

export function log(...args)   { console.log   (`[${MODULE_NAME}]`, ...args); }
export function logDebug(...args) { console.debug(`[${MODULE_NAME}]`, ...args); }
export function logError(...args) { console.error(`[${MODULE_NAME}]`, ...args); }
export function logWarn(...args)  { console.warn (`[${MODULE_NAME}]`, ...args); }
