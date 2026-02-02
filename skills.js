/**
 * SillyAgents — Skills manager.
 *
 * Responsibilities:
 *   • Inject a Skills icon tab next to the Lorebook tab in the character panel.
 *   • When clicked, open a modal that lists all imported skills.
 *   • Let the user attach/detach skills to the current chat (stored in chatMetadata).
 *   • Handle import (.zip and folder) and export flows.
 *   • Persist the global skill library in localforage.
 *
 * Communication contract:
 *   LISTENS FOR:
 *     CHAT_CHANGED         — refresh which skills are attached to the new chat.
 *   EMITS:
 *     (none — skills are self-contained; the prompt interceptor in index.js reads
 *      attached skills at generation time.)
 */

import { importSkillFromZip, importSkillFromFiles } from './skills-import.js';
import { log, logError }                            from './utils.js';

// ─── storage key ─────────────────────────────────────────────────────────────
const SKILLS_STORE_KEY = 'sillyagents_skills';   // localforage key for the skill library

// ─── in-memory skill library (loaded from localforage on init) ───────────────
let _skills = [];   // Array<Skill>

// ─── DOM references ──────────────────────────────────────────────────────────
let $modal      = null;
let $skillsList = null;   // container where skill cards render inside the modal

// ─── init ─────────────────────────────────────────────────────────────────────

export async function init() {
    const { eventSource, event_types } = SillyTavern.getContext();
    const { localforage }             = SillyTavern.libs;

    // Load persisted skills.
    _skills = (await localforage.getItem(SKILLS_STORE_KEY)) || [];

    // Inject the tab icon.
    injectSkillsTab();

    // Inject the modal (hidden).
    injectModal();

    // Listen for chat changes to refresh the attachment state in the modal.
    eventSource.on(event_types.CHAT_CHANGED, () => {
        if ($modal && $modal.classList.contains('sa-modal-open')) renderSkillCards();
    });

    log('Skills manager ready. Library contains', _skills.length, 'skill(s).');
}

// ─── tab icon injection ──────────────────────────────────────────────────────
// We look for the Lorebook / World Info icon tab in the character panel and
// append ours immediately after it.

function injectSkillsTab() {
    // The lorebook icon is typically inside a tab-row near the character panel.
    // Common selectors across ST versions — we try several for resilience.
    const lorebook =
        document.querySelector('#world_info_btn') ||
        document.querySelector('.world_info_btn') ||
        document.querySelector('[data-action="world_info"]');

    if (!lorebook) {
        // Retry after APP_READY.
        const { eventSource, event_types } = SillyTavern.getContext();
        eventSource.on(event_types.APP_READY, () => {
            const lb = document.querySelector('#world_info_btn') ||
                       document.querySelector('.world_info_btn');
            if (lb) appendSkillsTab(lb);
            else log('Warning: could not find lorebook tab anchor for skills tab.');
        });
        return;
    }
    appendSkillsTab(lorebook);
}

function appendSkillsTab(anchor) {
    const btn = document.createElement('button');
    btn.id        = 'sa-skills-tab';
    btn.className = 'sa-skills-tab-btn';
    btn.title     = 'Agent Skills';
    // Placeholder icon — replace with a proper SVG or icon-font glyph later.
    btn.innerHTML = `<span class="sa-skills-icon">📦</span>`;

    btn.addEventListener('click', openModal);

    // Insert right after the lorebook tab.
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    log('Skills tab injected.');
}

// ─── modal ───────────────────────────────────────────────────────────────────

const MODAL_HTML = `
<div id="sa-skills-modal" class="sa-modal">
  <div class="sa-modal-backdrop"></div>
  <div class="sa-modal-content">

    <div class="sa-modal-header">
      <h3 class="sa-modal-title">📦 Agent Skills</h3>
      <button id="sa-skills-modal-close" class="sa-modal-close-btn" title="Close">✕</button>
    </div>

    <div class="sa-modal-toolbar">
      <!-- Import buttons -->
      <label class="sa-btn sa-btn-import" title="Import a .zip skill">
        Import .zip
        <input type="file" id="sa-skills-import-zip" accept=".zip" class="sa-file-input-hidden">
      </label>
      <label class="sa-btn sa-btn-import" title="Import a skill folder">
        Import Folder
        <input type="file" id="sa-skills-import-folder" class="sa-file-input-hidden"
               webkitdirectory multiple>
      </label>
    </div>

    <!-- Skill cards render here -->
    <div id="sa-skills-list" class="sa-skills-list">
      <p class="sa-skills-empty">No skills imported yet. Use the buttons above to add one.</p>
    </div>

  </div><!-- end modal-content -->
</div>
`;

function injectModal() {
    document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    $modal      = document.getElementById('sa-skills-modal');
    $skillsList = document.getElementById('sa-skills-list');

    // Close on backdrop click or close button.
    document.getElementById('sa-skills-modal-close').addEventListener('click', closeModal);
    $modal.querySelector('.sa-modal-backdrop').addEventListener('click', closeModal);

    // Import handlers.
    document.getElementById('sa-skills-import-zip').addEventListener('change', onImportZip);
    document.getElementById('sa-skills-import-folder').addEventListener('change', onImportFolder);
}

function openModal() {
    renderSkillCards();
    $modal.classList.add('sa-modal-open');
}

function closeModal() {
    $modal.classList.remove('sa-modal-open');
}

// ─── import handlers ─────────────────────────────────────────────────────────

async function onImportZip(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so the same file can be re-imported

    try {
        toastr.info('Importing skill…');
        const skill = await importSkillFromZip(file);
        await addSkill(skill);
        toastr.success(`Skill "${skill.name}" imported successfully.`);
        renderSkillCards();
    } catch (err) {
        logError('ZIP import failed:', err);
        toastr.error(err.message || 'Failed to import skill from zip.');
    }
}

async function onImportFolder(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = '';

    try {
        toastr.info('Importing skill…');
        const skill = await importSkillFromFiles(files);
        await addSkill(skill);
        toastr.success(`Skill "${skill.name}" imported successfully.`);
        renderSkillCards();
    } catch (err) {
        logError('Folder import failed:', err);
        toastr.error(err.message || 'Failed to import skill from folder.');
    }
}

// ─── skill library CRUD ──────────────────────────────────────────────────────

async function addSkill(skill) {
    const { localforage } = SillyTavern.libs;
    _skills.push(skill);
    await localforage.setItem(SKILLS_STORE_KEY, _skills);
}

async function deleteSkill(skillId) {
    const { localforage } = SillyTavern.libs;
    _skills = _skills.filter(s => s.id !== skillId);
    await localforage.setItem(SKILLS_STORE_KEY, _skills);

    // Also detach from current chat if it was attached.
    detachSkillFromCurrentChat(skillId);
}

function exportSkill(skill) {
    // Export as a plain JSON blob containing the skill data.
    // A future iteration could re-zip the files, but JSON is simpler and lossless.
    const blob = new Blob([JSON.stringify(skill, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${skill.name.replace(/[^a-z0-9]/gi, '_')}.skill.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── attach / detach to current chat ─────────────────────────────────────────
// Attached skills are stored as an array of skill IDs in chatMetadata.sillyagents_attached.

function getAttachedSkillIds() {
    const meta = SillyTavern.getContext().chatMetadata;
    return meta?.sillyagents_attached ?? [];
}

async function attachSkillToCurrentChat(skillId) {
    const attached = getAttachedSkillIds();
    if (attached.includes(skillId)) return; // already attached
    attached.push(skillId);
    SillyTavern.getContext().chatMetadata['sillyagents_attached'] = attached;
    await SillyTavern.getContext().saveMetadata();
}

async function detachSkillFromCurrentChat(skillId) {
    const attached = getAttachedSkillIds().filter(id => id !== skillId);
    SillyTavern.getContext().chatMetadata['sillyagents_attached'] = attached;
    await SillyTavern.getContext().saveMetadata();
}

// ─── render skill cards ──────────────────────────────────────────────────────

function renderSkillCards() {
    if (!$skillsList) return;

    const attached = getAttachedSkillIds();

    if (_skills.length === 0) {
        $skillsList.innerHTML = '<p class="sa-skills-empty">No skills imported yet. Use the buttons above to add one.</p>';
        return;
    }

    $skillsList.innerHTML = _skills.map(skill => {
        const isAttached = attached.includes(skill.id);
        return `
        <div class="sa-skill-card" data-skill-id="${skill.id}">
          <div class="sa-skill-card-header">
            <span class="sa-skill-name">${escapeHtml(skill.name)}</span>
            <span class="sa-skill-badge ${isAttached ? 'sa-badge-attached' : ''}">
              ${isAttached ? 'Attached' : 'Available'}
            </span>
          </div>
          <p class="sa-skill-description">${escapeHtml(skill.description || 'No description.')}</p>
          <div class="sa-skill-card-actions">
            <button class="sa-btn sa-btn-sm ${isAttached ? 'sa-btn-detach' : 'sa-btn-attach'}"
                    data-action="${isAttached ? 'detach' : 'attach'}"
                    data-skill-id="${skill.id}">
              ${isAttached ? 'Detach' : 'Attach'}
            </button>
            <button class="sa-btn sa-btn-sm sa-btn-export"
                    data-action="export" data-skill-id="${skill.id}">
              Export
            </button>
            <button class="sa-btn sa-btn-sm sa-btn-delete"
                    data-action="delete" data-skill-id="${skill.id}">
              Delete
            </button>
          </div>
        </div>`;
    }).join('');

    // Attach click handlers via delegation.
    $skillsList.onclick = onSkillCardAction;
}

async function onSkillCardAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action  = btn.dataset.action;
    const skillId = btn.dataset.skillId;
    const skill   = _skills.find(s => s.id === skillId);
    if (!skill && action !== 'delete') return;

    switch (action) {
        case 'attach':
            await attachSkillToCurrentChat(skillId);
            renderSkillCards();
            break;

        case 'detach':
            await detachSkillFromCurrentChat(skillId);
            renderSkillCards();
            break;

        case 'export':
            exportSkill(skill);
            break;

        case 'delete': {
            const { Popup } = SillyTavern.getContext();
            const confirmed = await Popup.show.confirm(
                'Delete Skill',
                `Are you sure you want to delete "${skill?.name || 'this skill'}"? This cannot be undone.`
            );
            if (confirmed) {
                await deleteSkill(skillId);
                renderSkillCards();
                toastr.success('Skill deleted.');
            }
            break;
        }
    }
}

// ─── utility ─────────────────────────────────────────────────────────────────

/**
 * Returns the full SKILL.md contents for all skills attached to the current chat.
 * Called by the prompt interceptor in index.js to inject skill context.
 * @returns {string[]}
 */
export function getAttachedSkillContents() {
    const attached = getAttachedSkillIds();
    return _skills
        .filter(s => attached.includes(s.id))
        .map(s => s.skillMdContent)
        .filter(Boolean);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
