/**
 * SillyAgents — Entry point.
 *
 * This file is intentionally thin.  It does exactly three things:
 *   1. Imports every module and calls their init() on APP_READY.
 *   2. Registers the prompt interceptor declared in manifest.json
 *      (sillyAgentsInterceptor) — this is the only place skills get
 *      injected into the prompt and the auto-queue finish tool is added.
 *   3. Nothing else.
 *
 * All real logic lives in the modules it imports.
 */

import { init as initMacros }          from './macros.js';
import { init as initSubroutines }     from './subroutines.js';
import { init as initSubroutinePanel } from './subroutine-panel.js';
import { init as initChatList }        from './chat-list.js';
import { init as initSkills, getAttachedSkillContents } from './skills.js';
import { log }                         from './utils.js';

// ─── boot sequence ───────────────────────────────────────────────────────────

(async () => {
    const { eventSource, event_types } = SillyTavern.getContext();

    // Wait for ST to be fully ready before touching anything.
    await new Promise(resolve => {
        eventSource.on(event_types.APP_READY, resolve);
    });

    log('Initializing…');

    // Order matters slightly: macros first (they register sync callbacks that
    // the interceptor may reference), then the runtime, then UI.
    await initMacros();
    await initSubroutines();
    await initSubroutinePanel();
    await initChatList();
    await initSkills();

    log('All modules initialized.');
})();

// ─── prompt interceptor ──────────────────────────────────────────────────────
// Declared as a global function because manifest.json references it by name.
// Runs BEFORE every generation.  Two jobs:
//   A) Inject attached skill SKILL.md contents as a system note at the top.
//   B) If the current chat is a subroutine with auto-queue enabled, append a
//      system note telling the model about the "finish" tool.

globalThis.sillyAgentsInterceptor = async function (chat, contextSize, abort, type) {
    // ── A: Skill injection ───────────────────────────────────────────────
    const skillContents = getAttachedSkillContents();
    if (skillContents.length > 0) {
        const skillBlock = skillContents
            .map((md, i) => `--- Skill ${i + 1} ---\n${md}`)
            .join('\n\n');

        const skillNote = {
            is_user:    false,
            name:       'Skills Context',
            send_date:  new Date().toLocaleString(),
            mes:        skillBlock,
            id:         'sa-skills-inject',
        };

        // Insert at position 0 (top of context, before everything else).
        chat.unshift(skillNote);
    }

    // ── B: Auto-queue finish tool hint ───────────────────────────────────
    const meta = SillyTavern.getContext().chatMetadata;
    const config = meta?.sillyagents;

    if (config?.isSubroutine && config?.autoQueue && config?.running) {
        const finishNote = {
            is_user:    false,
            name:       'System',
            send_date:  new Date().toLocaleString(),
            mes:        'You have access to a special "finish" tool. '
                      + 'Call it when the current task is fully complete and no further action is needed. '
                      + 'If you do not call any tool, you will be prompted to continue automatically.',
            id:         'sa-autoqueue-hint',
        };

        // Insert just before the last message (the user's heartbeat).
        chat.splice(chat.length - 1, 0, finishNote);
    }
};
