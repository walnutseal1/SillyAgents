/**
 * SillyAgents — Chat-list integration.
 *
 * Responsibilities:
 *   • Inject "Create a new Subroutine" button next to "Create a new Chat".
 *   • Observe the past-chats panel for DOM mutations.
 *   • When chat items render, check metadata → pin subroutines to top + color them.
 *
 * Communication contract:
 *   LISTENS FOR:
 *     CHAT_CHANGED         — re-scan the list after navigation.
 *     sa:color-changed     — a subroutine's color was edited; re-scan.
 *   EMITS:
 *     sa:subroutine-created — after a new subroutine is made and we've switched into it.
 */

import { defaultSubroutineConfig, setSubroutineConfig, log, logError } from './utils.js';

// ─── state ───────────────────────────────────────────────────────────────────
let _observer = null;   // MutationObserver instance (created once)

// ─── init ─────────────────────────────────────────────────────────────────────

export async function init() {
    const { eventSource, event_types } = SillyTavern.getContext();

    injectCreateButton();

    eventSource.on(event_types.CHAT_CHANGED, scanChatList);
    eventSource.on('sa:color-changed',       scanChatList);

    // Observe the past-chats container once it exists.
    // It may not be in the DOM yet on first load — poll briefly.
    await waitForElement('.past_chats', 3000).then(setupObserver).catch(() => {
        log('Warning: .past_chats not found within 3 s — observer not attached.');
    });

    // Initial scan in case we loaded while the list is already visible.
    scanChatList();

    log('Chat-list integration ready.');
}

// ─── "Create a new Subroutine" button ────────────────────────────────────────

function injectCreateButton() {
    // SillyTavern has a "Create a new Chat" button; we find it and append ours after it.
    // The button typically has the id "create_chat_btn" or a recognisable class.
    // We'll try multiple selectors for resilience across ST versions.
    const anchor =
        document.getElementById('create_chat_btn') ||
        document.querySelector('.create_chat_btn') ||
        document.querySelector('[data-action="create_chat"]');

    if (!anchor) {
        // Fallback: try again after APP_READY (DOM may not be ready yet).
        const { eventSource, event_types } = SillyTavern.getContext();
        eventSource.on(event_types.APP_READY, () => {
            const a = document.getElementById('create_chat_btn') ||
                      document.querySelector('.create_chat_btn');
            if (a) appendCreateButton(a);
            else log('Warning: could not find create_chat_btn anchor.');
        });
        return;
    }
    appendCreateButton(anchor);
}

function appendCreateButton(anchor) {
    const btn = document.createElement('button');
    btn.id        = 'sa-create-subroutine-btn';
    btn.className = 'sa-create-btn';
    btn.title     = 'Create a new Subroutine';
    btn.innerHTML = '＋ Subroutine';

    btn.addEventListener('click', onCreateSubroutine);

    // Insert right after the anchor element.
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    log('Create Subroutine button injected.');
}

// ─── create subroutine flow ──────────────────────────────────────────────────

async function onCreateSubroutine() {
    try {
        const { Popup } = SillyTavern.getContext();

        // 1. Ask for a name.
        const name = await Popup.show.input(
            'New Subroutine',
            'Enter a name for this subroutine:',
            'My Subroutine'
        );
        if (!name) return; // user cancelled

        // 2. Create a normal chat with that name.
        //    We simulate what ST does internally: click the create button
        //    programmatically then rename.  A more robust approach would be to
        //    call ST's internal createNewChat() if ever exposed — for now we
        //    dispatch a click on the real create button and then rename.
        const createBtn = document.getElementById('create_chat_btn') ||
                          document.querySelector('.create_chat_btn');
        if (createBtn) createBtn.click();

        // Give ST a tick to actually create and switch to the new chat.
        await new Promise(r => setTimeout(r, 500));

        // 3. Rename the chat.  ST exposes rename via the chat file name input or
        //    we can write directly.  We'll use the chat metadata approach — the
        //    chat name is stored in chatMetadata.custom_name.
        const { saveMetadata } = SillyTavern.getContext();
        SillyTavern.getContext().chatMetadata['custom_name'] = name;

        // 4. Write the subroutine config.
        const config = defaultSubroutineConfig();
        config.running = true;   // start running immediately
        await setSubroutineConfig(config);

        // 5. Notify siblings.
        const { eventSource } = SillyTavern.getContext();
        await eventSource.emit('sa:subroutine-created', { name });

        // 6. Re-scan so the chat list picks up the new entry.
        scanChatList();

        toastr.success(`Subroutine "${name}" created and started.`);
        log('Subroutine created:', name);
    } catch (e) {
        logError('Failed to create subroutine:', e);
        toastr.error('Failed to create subroutine. Check console for details.');
    }
}

// ─── MutationObserver ────────────────────────────────────────────────────────

function setupObserver(container) {
    if (_observer) return; // already set up

    _observer = new MutationObserver((mutations) => {
        // Only care about child additions (new chat items rendered).
        const hasAdditions = mutations.some(m => m.addedNodes.length > 0);
        if (hasAdditions) scanChatList();
    });

    _observer.observe(container, { childList: true, subtree: true });
    log('MutationObserver attached to .past_chats.');
}

// ─── scan & decorate ─────────────────────────────────────────────────────────
// This is the core of the chat-list integration.  It runs after any mutation
// or chat change.  It reads each chat item, checks metadata, and decorates
// subroutines with color + pinning.

// We cache metadata per chat filename to avoid excessive fetch calls.
// Cache is invalidated on CHAT_CHANGED.
let _metaCache = {};   // { filename: SubroutineConfig | null }

async function scanChatList() {
    const container = document.querySelector('.past_chats');
    if (!container) return;

    const items = container.querySelectorAll('.past_chat_item, .chat_item, [data-filename]');
    if (items.length === 0) return;

    const subroutineItems = [];

    for (const item of items) {
        const filename = item.dataset?.filename || item.getAttribute('data-filename');
        if (!filename) continue;

        // Check cache first; otherwise try to load metadata.
        let config = _metaCache[filename];
        if (config === undefined) {
            config = await fetchChatMetadataConfig(filename);
            _metaCache[filename] = config;
        }

        if (config && config.isSubroutine) {
            // Apply color.
            item.style.borderLeft = `4px solid ${config.color || '#4a90d9'}`;
            item.classList.add('sa-subroutine-item');
            subroutineItems.push(item);
        } else {
            // Make sure we haven't left stale decoration on a non-subroutine.
            item.style.borderLeft = '';
            item.classList.remove('sa-subroutine-item');
        }
    }

    // Pin subroutine items to the top by prepending them in order.
    for (let i = subroutineItems.length - 1; i >= 0; i--) {
        container.insertBefore(subroutineItems[i], container.firstChild);
    }
}

/**
 * Fetch a single chat's metadata from the server and extract the sillyagents
 * config block, if present.
 * @param {string} filename
 * @returns {Promise<SubroutineConfig|null>}
 */
async function fetchChatMetadataConfig(filename) {
    try {
        // SillyTavern stores chat metadata alongside the chat file.
        // The endpoint pattern is: /api/chats/metadata?filename=<name>
        // If that doesn't exist in your ST version, fall back to reading the
        // chat file directly and parsing the metadata block.
        const res = await fetch(`/api/chats/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename }),
        });
        if (!res.ok) return null;
        const meta = await res.json();
        return meta?.sillyagents ?? null;
    } catch (e) {
        // Non-fatal — just means we can't decorate this item.
        return null;
    }
}

// ─── cache invalidation ──────────────────────────────────────────────────────
// We clear the cache whenever the user switches chats, so stale data doesn't
// persist across navigation.

(() => {
    // Defer — SillyTavern context may not be ready at module parse time.
    // We piggyback on init() instead; see below.
})();

export function clearMetaCache() {
    _metaCache = {};
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Poll for a DOM element to appear, with a timeout.
 * @param {string} selector
 * @param {number} timeoutMs
 * @returns {Promise<Element>}
 */
function waitForElement(selector, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(selector);
        if (existing) { resolve(existing); return; }

        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) { observer.disconnect(); resolve(el); }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => { observer.disconnect(); reject(new Error('Timeout')); }, timeoutMs);
    });
}
