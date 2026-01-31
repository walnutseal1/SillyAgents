/**
 * SillyAgents UI Extension
 * Provides user interface for managing subroutines and agent skills
 */

(function() {
    'use strict';
    
    const MODULE_NAME = 'sillyagents';
    const API_BASE = '/api/plugins/sillyagents';
    
    // Extension state
    let extensionSettings = {};
    let subroutines = [];
    let skills = [];
    
    /**
     * Initialize the extension
     */
    async function init() {
        console.log('[SillyAgents] Initializing extension...');
        
        // Get SillyTavern context
        const context = SillyTavern.getContext();
        extensionSettings = loadSettings(context);
        
        // Add UI elements
        await injectUI();
        
        // Register event listeners
        registerEventListeners(context);
        
        // Register slash commands
        registerSlashCommands();
        
        // Load initial data
        await loadSubroutines();
        await loadSkills();
        
        console.log('[SillyAgents] Extension initialized successfully!');
    }
    
    /**
     * Load extension settings
     */
    function loadSettings(context) {
        const defaultSettings = {
            enabled: true,
            subroutineColor: '#4A90E2',
            showInChatList: true,
        };
        
        if (!context.extensionSettings[MODULE_NAME]) {
            context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        }
        
        // Ensure all defaults exist
        for (const key of Object.keys(defaultSettings)) {
            if (!Object.hasOwn(context.extensionSettings[MODULE_NAME], key)) {
                context.extensionSettings[MODULE_NAME][key] = defaultSettings[key];
            }
        }
        
        return context.extensionSettings[MODULE_NAME];
    }
    
    /**
     * Inject UI elements into SillyTavern
     */
    async function injectUI() {
        // Add "Create Subroutine" button next to "Create Chat"
        const createChatButton = $('#option_select_chat');
        if (createChatButton.length) {
            const createSubroutineButton = $('<div>')
                .attr('id', 'create_subroutine_button')
                .addClass('menu_button')
                .attr('title', 'Create a new Subroutine')
                .html('<i class="fa-solid fa-robot"></i> Create Subroutine')
                .on('click', showCreateSubroutineDialog);
            
            createChatButton.after(createSubroutineButton);
        }
        
        // Add Skills management button
        const settingsButton = $('#extensions_settings');
        if (settingsButton.length) {
            const skillsButton = $('<div>')
                .attr('id', 'manage_skills_button')
                .addClass('menu_button')
                .attr('title', 'Manage Agent Skills')
                .html('<i class="fa-solid fa-brain"></i> Manage Skills')
                .on('click', showSkillsDialog);
            
            settingsButton.before(skillsButton);
        }
        
        // Add settings panel to extensions menu
        await addSettingsPanel();
    }
    
    /**
     * Add settings panel to extensions menu
     */
    async function addSettingsPanel() {
        const settingsHtml = `
            <div id="sillyagents_settings">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>SillyAgents</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <label class="checkbox_label" for="sillyagents_enabled">
                            <input type="checkbox" id="sillyagents_enabled" name="sillyagents_enabled" />
                            <span>Enable SillyAgents</span>
                        </label>
                        <label for="sillyagents_subroutine_color">
                            <span>Subroutine Color</span>
                            <input type="color" id="sillyagents_subroutine_color" name="sillyagents_subroutine_color" />
                        </label>
                        <label class="checkbox_label" for="sillyagents_show_in_chat_list">
                            <input type="checkbox" id="sillyagents_show_in_chat_list" name="sillyagents_show_in_chat_list" />
                            <span>Show Subroutines in Chat List</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
        
        $('#extensions_settings').append(settingsHtml);
        
        // Load current settings
        $('#sillyagents_enabled').prop('checked', extensionSettings.enabled);
        $('#sillyagents_subroutine_color').val(extensionSettings.subroutineColor);
        $('#sillyagents_show_in_chat_list').prop('checked', extensionSettings.showInChatList);
        
        // Save settings on change
        $('#sillyagents_enabled').on('change', function() {
            extensionSettings.enabled = $(this).prop('checked');
            saveSettings();
        });
        
        $('#sillyagents_subroutine_color').on('change', function() {
            extensionSettings.subroutineColor = $(this).val();
            saveSettings();
        });
        
        $('#sillyagents_show_in_chat_list').on('change', function() {
            extensionSettings.showInChatList = $(this).prop('checked');
            saveSettings();
        });
    }
    
    /**
     * Save extension settings
     */
    function saveSettings() {
        const context = SillyTavern.getContext();
        context.saveSettingsDebounced();
    }
    
    /**
     * Register event listeners
     */
    function registerEventListeners(context) {
        const { eventSource, event_types } = context;
        
        // Listen for app ready event
        eventSource.on(event_types.APP_READY, () => {
            console.log('[SillyAgents] App ready');
        });
        
        // Listen for chat changes
        eventSource.on(event_types.CHAT_CHANGED, () => {
            console.log('[SillyAgents] Chat changed');
            // TODO: Check if current chat is a subroutine
        });
    }
    
    /**
     * Register slash commands
     */
    function registerSlashCommands() {
        // /subroutine command
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'subroutine',
            callback: async (namedArgs, unnamedArgs) => {
                const action = unnamedArgs.toString().trim();
                
                switch (action) {
                    case 'list':
                        await loadSubroutines();
                        return `Found ${subroutines.length} subroutine(s)`;
                    case 'create':
                        showCreateSubroutineDialog();
                        return 'Opening subroutine creation dialog...';
                    default:
                        return 'Usage: /subroutine [list|create]';
                }
            },
            helpString: 'Manage subroutines. Usage: /subroutine [list|create]',
        }));
        
        // /skill command
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'skill',
            callback: async (namedArgs, unnamedArgs) => {
                const action = unnamedArgs.toString().trim();
                
                switch (action) {
                    case 'list':
                        await loadSkills();
                        return `Found ${skills.length} skill(s)`;
                    case 'manage':
                        showSkillsDialog();
                        return 'Opening skills management dialog...';
                    default:
                        return 'Usage: /skill [list|manage]';
                }
            },
            helpString: 'Manage agent skills. Usage: /skill [list|manage]',
        }));
    }
    
    /**
     * Show create subroutine dialog
     */
    async function showCreateSubroutineDialog() {
        const { Popup } = SillyTavern.getContext();
        
        const dialogHtml = `
            <div id="subroutine_create_dialog">
                <h3>Create New Subroutine</h3>
                <div class="margin-bot-10px">
                    <label for="subroutine_name">Name</label>
                    <input type="text" id="subroutine_name" class="text_pole" placeholder="My Subroutine" />
                </div>
                <div class="margin-bot-10px">
                    <label for="subroutine_trigger_type">Trigger Type</label>
                    <select id="subroutine_trigger_type" class="text_pole">
                        <option value="time">Time-based</option>
                        <option value="tool">Tool-based</option>
                        <option value="api">API-based</option>
                    </select>
                </div>
                <div id="subroutine_time_config" class="margin-bot-10px">
                    <label for="subroutine_interval">Interval (seconds)</label>
                    <input type="number" id="subroutine_interval" class="text_pole" value="60" min="1" />
                </div>
                <div class="margin-bot-10px">
                    <label for="subroutine_color">Color</label>
                    <input type="color" id="subroutine_color" value="${extensionSettings.subroutineColor}" />
                </div>
                <div class="margin-bot-10px">
                    <label class="checkbox_label">
                        <input type="checkbox" id="subroutine_auto_queue" />
                        <span>Enable Auto-Queue Mode</span>
                    </label>
                </div>
            </div>
        `;
        
        const confirmed = await Popup.show.confirm('Create Subroutine', dialogHtml);
        
        if (confirmed) {
            const name = $('#subroutine_name').val();
            const triggerType = $('#subroutine_trigger_type').val();
            const interval = parseInt($('#subroutine_interval').val());
            const color = $('#subroutine_color').val();
            const autoQueue = $('#subroutine_auto_queue').prop('checked');
            
            if (!name) {
                toastr.error('Please provide a name for the subroutine');
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/subroutines`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        triggerType,
                        config: {
                            interval,
                            color,
                            autoQueue,
                        },
                    }),
                });
                
                const data = await response.json();
                
                if (data.success) {
                    toastr.success(`Subroutine "${name}" created successfully!`);
                    await loadSubroutines();
                } else {
                    toastr.error(`Failed to create subroutine: ${data.error}`);
                }
            } catch (error) {
                console.error('[SillyAgents] Error creating subroutine:', error);
                toastr.error('Failed to create subroutine');
            }
        }
    }
    
    /**
     * Show skills management dialog
     */
    async function showSkillsDialog() {
        const { Popup } = SillyTavern.getContext();
        
        await loadSkills();
        
        const skillsListHtml = skills.map(skill => `
            <div class="skill-item" data-skill-id="${skill.id}">
                <div class="skill-name">${skill.name}</div>
                <div class="skill-description">${skill.description || 'No description'}</div>
                <button class="delete-skill menu_button" data-skill-id="${skill.id}">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
            </div>
        `).join('');
        
        const dialogHtml = `
            <div id="skills_dialog">
                <h3>Manage Agent Skills</h3>
                <div class="margin-bot-10px">
                    <button id="import_skill_button" class="menu_button">
                        <i class="fa-solid fa-upload"></i> Import Skill (ZIP)
                    </button>
                </div>
                <div id="skills_list">
                    ${skillsListHtml || '<p>No skills imported yet.</p>'}
                </div>
            </div>
        `;
        
        await Popup.show.text('Manage Skills', dialogHtml);
        
        // Attach event handlers
        $('#import_skill_button').on('click', importSkillFromZip);
        $('.delete-skill').on('click', async function() {
            const skillId = $(this).data('skill-id');
            await deleteSkill(skillId);
        });
    }
    
    /**
     * Import skill from ZIP file
     */
    async function importSkillFromZip() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                // Read file as base64
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const base64Data = event.target.result.split(',')[1];
                    
                    const response = await fetch(`${API_BASE}/skills/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            zipData: base64Data,
                            filename: file.name,
                        }),
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        toastr.success(`Skill "${data.skill.name}" imported successfully!`);
                        await loadSkills();
                        showSkillsDialog(); // Refresh dialog
                    } else {
                        toastr.error(`Failed to import skill: ${data.error}`);
                    }
                };
                
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('[SillyAgents] Error importing skill:', error);
                toastr.error('Failed to import skill');
            }
        };
        
        input.click();
    }
    
    /**
     * Delete a skill
     */
    async function deleteSkill(skillId) {
        const { Popup } = SillyTavern.getContext();
        
        const confirmed = await Popup.show.confirm(
            'Delete Skill',
            'Are you sure you want to delete this skill?'
        );
        
        if (confirmed) {
            try {
                const response = await fetch(`${API_BASE}/skills/${skillId}`, {
                    method: 'DELETE',
                });
                
                const data = await response.json();
                
                if (data.success) {
                    toastr.success('Skill deleted successfully!');
                    await loadSkills();
                    showSkillsDialog(); // Refresh dialog
                } else {
                    toastr.error(`Failed to delete skill: ${data.error}`);
                }
            } catch (error) {
                console.error('[SillyAgents] Error deleting skill:', error);
                toastr.error('Failed to delete skill');
            }
        }
    }
    
    /**
     * Load subroutines from server
     */
    async function loadSubroutines() {
        try {
            const response = await fetch(`${API_BASE}/subroutines`);
            const data = await response.json();
            subroutines = data.subroutines || [];
            console.log('[SillyAgents] Loaded subroutines:', subroutines.length);
        } catch (error) {
            console.error('[SillyAgents] Error loading subroutines:', error);
        }
    }
    
    /**
     * Load skills from server
     */
    async function loadSkills() {
        try {
            const response = await fetch(`${API_BASE}/skills`);
            const data = await response.json();
            skills = data.skills || [];
            console.log('[SillyAgents] Loaded skills:', skills.length);
        } catch (error) {
            console.error('[SillyAgents] Error loading skills:', error);
        }
    }
    
    // Initialize extension when jQuery is ready
    jQuery(async () => {
        await init();
    });
})();
