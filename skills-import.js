/**
 * SillyAgents — Skill import logic.
 *
 * Responsibilities:
 *   • Parse .zip files containing skills.
 *   • Validate that a SKILL.md exists at the root or one level deep.
 *   • Extract metadata (name, description) from SKILL.md front-matter or headers.
 *   • Return a clean Skill object that skills.js can store.
 *
 * This module is intentionally isolated so that its dependency on JSZip (loaded
 * dynamically via CDN) doesn't leak into the rest of the extension.
 *
 * Export surface:
 *   importSkillFromZip(File) → Promise<Skill>
 *   importSkillFromFiles(FileList) → Promise<Skill>   (folder drag-and-drop)
 */

import { logError, logDebug } from './utils.js';

// ─── JSZip — loaded once on first use ────────────────────────────────────────

let _JSZip = null;

async function getJSZip() {
    if (_JSZip) return _JSZip;
    // Dynamic import from CDN — bundlers should ignore this (webpackIgnore).
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload  = () => { _JSZip = window.JSZip; };
    script.onerror = () => { throw new Error('Failed to load JSZip from CDN.'); };
    document.head.appendChild(script);

    // Wait for it to load.
    await new Promise((resolve, reject) => {
        if (_JSZip) { resolve(); return; }
        script.onload  = () => { _JSZip = window.JSZip; resolve(); };
        script.onerror = reject;
    });
    return _JSZip;
}

// ─── types ───────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Skill
 * @property {string}   id            - unique id (slugified name + timestamp)
 * @property {string}   name          - human-readable name from SKILL.md
 * @property {string}   description   - description from SKILL.md
 * @property {string}   skillMdContent- full raw text of SKILL.md
 * @property {Object}   files         - { relativePath: textContent } for all text files
 * @property {number}   importedAt    - epoch timestamp
 */

// ─── ZIP import ──────────────────────────────────────────────────────────────

/**
 * Import a skill from a .zip File.
 * Throws if SKILL.md is not found or is unparseable.
 * @param {File} zipFile
 * @returns {Promise<Skill>}
 */
export async function importSkillFromZip(zipFile) {
    const JSZip = await getJSZip();
    const zip   = await new JSZip().loadAsync(zipFile);

    // Find SKILL.md — at root or one directory deep.
    const skillMdPath = findSkillMd(zip);
    if (!skillMdPath) {
        throw new Error('Invalid skill: no SKILL.md found in the zip root or one level deep.');
    }

    const skillMdContent = await zip.file(skillMdPath).async('string');
    const { name, description } = parseSkillMd(skillMdContent);

    // Extract all other text files relative to the SKILL.md's directory.
    const baseDir = skillMdPath.includes('/') ? skillMdPath.split('/').slice(0, -1).join('/') + '/' : '';
    const files   = {};

    for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir) continue;                          // skip directories
        if (!path.startsWith(baseDir)) continue;         // only files inside the skill folder
        const relativePath = path.slice(baseDir.length);
        try {
            files[relativePath] = await file.async('string');
        } catch (e) {
            logDebug('Skipping binary file in zip:', path);
        }
    }

    return buildSkill({ name, description, skillMdContent, files });
}

// ─── Folder import (FileList from drag-and-drop or <input webkitdirectory>) ──

/**
 * Import a skill from a FileList (e.g. from a folder upload).
 * @param {FileList} fileList
 * @returns {Promise<Skill>}
 */
export async function importSkillFromFiles(fileList) {
    // Find SKILL.md in the list.
    let skillMdFile = null;
    let skillMdRelPath = null;

    for (const file of fileList) {
        // file.webkitRelativePath gives us the folder-relative path.
        const parts = (file.webkitRelativePath || file.name).split('/');
        // SKILL.md at root (1 segment after folder name) or one level deep (2 segments).
        if (parts[parts.length - 1] === 'SKILL.md' && parts.length <= 3) {
            skillMdFile    = file;
            skillMdRelPath = file.webkitRelativePath || file.name;
            break;
        }
    }

    if (!skillMdFile) {
        throw new Error('Invalid skill: no SKILL.md found in the uploaded folder.');
    }

    const skillMdContent = await skillMdFile.text();
    const { name, description } = parseSkillMd(skillMdContent);

    // Determine the base directory prefix so we can compute relative paths.
    const baseDir = skillMdRelPath.slice(0, skillMdRelPath.lastIndexOf('/') + 1);
    const files   = {};

    for (const file of fileList) {
        const rel = (file.webkitRelativePath || file.name);
        if (!rel.startsWith(baseDir)) continue;
        const relativePath = rel.slice(baseDir.length);
        try {
            files[relativePath] = await file.text();
        } catch (e) {
            logDebug('Skipping binary file in folder upload:', file.name);
        }
    }

    return buildSkill({ name, description, skillMdContent, files });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Scan a JSZip instance for SKILL.md at root or one level deep.
 * Returns the path string or null.
 */
function findSkillMd(zip) {
    const paths = Object.keys(zip.files);

    // Root level: "SKILL.md"
    if (paths.includes('SKILL.md')) return 'SKILL.md';

    // One level deep: "something/SKILL.md"
    const deep = paths.find(p => {
        const parts = p.split('/');
        return parts.length === 2 && parts[1] === 'SKILL.md';
    });
    return deep || null;
}

/**
 * Parse name and description out of a SKILL.md file.
 *
 * Supports two formats:
 *   1. YAML-style front-matter:
 *        ---
 *        name: My Skill
 *        description: Does cool things
 *        ---
 *   2. Markdown headers (fallback):
 *        # My Skill
 *        Does cool things (first non-empty paragraph after the h1)
 *
 * @param {string} content
 * @returns {{ name: string, description: string }}
 */
function parseSkillMd(content) {
    let name        = 'Unnamed Skill';
    let description = '';

    // Try front-matter first.
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
        const fm = fmMatch[1];
        const nameMatch = fm.match(/^name\s*:\s*(.+)$/m);
        const descMatch = fm.match(/^description\s*:\s*(.+)$/m);
        if (nameMatch) name        = nameMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
        return { name, description };
    }

    // Fallback: markdown headers.
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!name || name === 'Unnamed Skill') {
            const h1 = line.match(/^#\s+(.+)$/);
            if (h1) { name = h1[1].trim(); continue; }
        }
        // First non-empty, non-header line after the name becomes the description.
        if (name !== 'Unnamed Skill' && !description && line && !line.startsWith('#')) {
            description = line;
            break;
        }
    }

    return { name, description };
}

/**
 * Assemble a Skill object with a generated ID.
 */
function buildSkill({ name, description, skillMdContent, files }) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
        id:              `${slug}-${Date.now()}`,
        name,
        description,
        skillMdContent,
        files,
        importedAt:      Date.now(),
    };
}
