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
     * Get current character name from SillyTavern context
     */
    function getCurrentCharacterName() {
        const context = SillyTavern.getContext();
        const character = context.characters[context.characterId];
        
        if (!character) {
            throw new Error('No character selected. Please select a character first.');
        }
        
        return character.name;
    }
    
    /**
     * Show create subroutine dialog
     */
    async function showCreateSubroutineDialog() {
        const { Popup } = SillyTavern.getContext();
        
        // Check if a character is selected
        let characterName;
        try {
            characterName = getCurrentCharacterName();
        } catch (error) {
            toastr.error(error.message);
            return;
        }
        
        const dialogHtml = `
            <div id="subroutine_create_dialog">
                <h3>Create New Subroutine</h3>
                <div class="margin-bot-10px">
                    <label for="subroutine_character">Character</label>
                    <input type="text" id="subroutine_character" class="text_pole" value="${characterName}" readonly />
                    <small>Subroutine will be created for the currently selected character</small>
                </div>
                <div class="margin-bot-10px">
                    <label for="subroutine_chat_name">Chat Name</label>
                    <input type="text" id="subroutine_chat_name" class="text_pole" placeholder="email_checker" />
                    <small>Name for the subroutine chat file (lowercase, use underscores)</small>
                </div>
                <div class="margin-bot-10px">
                    <label for="subroutine_trigger_type">Trigger Type</label>
                    <select id="subroutine_trigger_type" class="text_pole">
                        <option value="time-based">Time-based</option>
                        <option value="tool-based">Tool-based</option>
                        <option value="api-based">API-based</option>
                    </select>
                </div>
                <div id="subroutine_time_config" class="margin-bot-10px">
                    <label for="subroutine_interval">Interval (seconds)</label>
                    <input type="number" id="subroutine_interval" class="text_pole" value="60" min="1" />
                </div>
                <div id="subroutine_tool_config" class="margin-bot-10px" style="display: none;">
                    <label for="subroutine_tool_name">Tool Name</label>
                    <input type="text" id="subroutine_tool_name" class="text_pole" placeholder="check_email" />
                    <label for="subroutine_tool_interval">Polling Interval (seconds)</label>
                    <input type="number" id="subroutine_tool_interval" class="text_pole" value="300" min="1" />
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
                <div class="margin-bot-10px">
                    <label class="checkbox_label">
                        <input type="checkbox" id="subroutine_use_summary" />
                        <span>Use Summary for Compression</span>
                    </label>
                </div>
                <div class="margin-bot-10px">
                    <label class="checkbox_label">
                        <input type="checkbox" id="subroutine_use_lorebooks" checked />
                        <span>Include Lorebooks</span>
                    </label>
                </div>
                <div class="margin-bot-10px">
                    <label class="checkbox_label">
                        <input type="checkbox" id="subroutine_use_examples" checked />
                        <span>Include Example Messages</span>
                    </label>
                </div>
            </div>
        `;
        
        // Show dialog and wait for user action
        const dialogElement = $(dialogHtml);
        $('body').append(dialogElement);
        
        // Handle trigger type changes
        $('#subroutine_trigger_type').on('change', function() {
            const triggerType = $(this).val();
            
            // Show/hide relevant config sections
            $('#subroutine_time_config').toggle(triggerType === 'time-based');
            $('#subroutine_tool_config').toggle(triggerType === 'tool-based');
        });
        
        const confirmed = await Popup.show.confirm('Create Subroutine', dialogHtml);
        
        if (confirmed) {
            const chatName = $('#subroutine_chat_name').val().trim();
            const triggerType = $('#subroutine_trigger_type').val();
            const color = $('#subroutine_color').val();
            const autoQueue = $('#subroutine_auto_queue').prop('checked');
            const useSummary = $('#subroutine_use_summary').prop('checked');
            const useLorebooks = $('#subroutine_use_lorebooks').prop('checked');
            const useExampleMessages = $('#subroutine_use_examples').prop('checked');
            
            if (!chatName) {
                toastr.error('Please provide a chat name for the subroutine');
                return;
            }
            
            // Sanitize chat name
            const sanitizedChatName = chatName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            
            // Build config based on trigger type
            const config = {
                color,
                autoQueue,
                useSummary,
                useLorebooks,
                useExampleMessages,
            };
            
            if (triggerType === 'time-based') {
                const interval = parseInt($('#subroutine_interval').val());
                if (!interval || interval < 1) {
                    toastr.error('Please provide a valid interval (>= 1 second)');
                    return;
                }
                config.interval = interval;
            } else if (triggerType === 'tool-based') {
                const toolName = $('#subroutine_tool_name').val().trim();
                const toolInterval = parseInt($('#subroutine_tool_interval').val());
                
                if (!toolName) {
                    toastr.error('Please provide a tool name for tool-based triggers');
                    return;
                }
                if (!toolInterval || toolInterval < 1) {
                    toastr.error('Please provide a valid polling interval (>= 1 second)');
                    return;
                }
                
                config.toolName = toolName;
                config.interval = toolInterval;
            }
            
            try {
                const response = await fetch(`${API_BASE}/subroutines`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        characterName,
                        chatName: sanitizedChatName,
                        triggerType,
                        config,
                    }),
                });
                
                const data = await response.json();
                
                if (data.success) {
                    toastr.success(`Subroutine "${sanitizedChatName}" created for ${characterName}!`);
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
     * Show subroutines list dialog
     */
    async function showSubroutinesListDialog() {
        const { Popup } = SillyTavern.getContext();
        
        await loadSubroutines();
        
        const subroutinesListHtml = subroutines.map(sub => `
            <div class="subroutine-item" style="border-left: 4px solid ${sub.color || '#4A90E2'}; padding: 10px; margin-bottom: 10px;">
                <div class="subroutine-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${sub.chatName}</strong>
                        <span style="color: #888;"> (${sub.characterName})</span>
                    </div>
                    <div>
                        <span class="badge">${sub.triggerType}</span>
                        ${sub.active ? '<span class="badge" style="background: green;">Active</span>' : '<span class="badge" style="background: gray;">Inactive</span>'}
                    </div>
                </div>
                <div class="subroutine-config" style="font-size: 0.9em; color: #666; margin-top: 5px;">
                    ${sub.interval ? `Interval: ${sub.interval}s` : ''}
                    ${sub.toolName ? `Tool: ${sub.toolName}` : ''}
                </div>
                <div class="subroutine-actions" style="margin-top: 10px;">
                    <button class="menu_button start-subroutine" data-character="${sub.characterName}" data-chat="${sub.chatName}" ${sub.active ? 'disabled' : ''}>
                        <i class="fa-solid fa-play"></i> Start
                    </button>
                    <button class="menu_button stop-subroutine" data-character="${sub.characterName}" data-chat="${sub.chatName}" ${!sub.active ? 'disabled' : ''}>
                        <i class="fa-solid fa-stop"></i> Stop
                    </button>
                    <button class="menu_button delete-subroutine" data-character="${sub.characterName}" data-chat="${sub.chatName}">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
        
        const dialogHtml = `
            <div id="subroutines_list_dialog">
                <h3>Manage Subroutines</h3>
                <div id="subroutines_list">
                    ${subroutinesListHtml || '<p>No subroutines created yet.</p>'}
                </div>
            </div>
        `;
        
        await Popup.show.text('Manage Subroutines', dialogHtml);
        
        // Attach event handlers
        $('.start-subroutine').on('click', async function() {
            const characterName = $(this).data('character');
            const chatName = $(this).data('chat');
            await startSubroutine(characterName, chatName);
        });
        
        $('.stop-subroutine').on('click', async function() {
            const characterName = $(this).data('character');
            const chatName = $(this).data('chat');
            await stopSubroutine(characterName, chatName);
        });
        
        $('.delete-subroutine').on('click', async function() {
            const characterName = $(this).data('character');
            const chatName = $(this).data('chat');
            await deleteSubroutine(characterName, chatName);
        });
    }
    
    /**
     * Start a subroutine
     */
    async function startSubroutine(characterName, chatName) {
        try {
            const response = await fetch(`${API_BASE}/triggers/${characterName}/${chatName}/start`, {
                method: 'POST',
            });
            
            const data = await response.json();
            
            if (data.success) {
                toastr.success(`Subroutine "${chatName}" started!`);
                await loadSubroutines();
            } else {
                toastr.error(`Failed to start subroutine: ${data.error}`);
            }
        } catch (error) {
            console.error('[SillyAgents] Error starting subroutine:', error);
            toastr.error('Failed to start subroutine');
        }
    }
    
    /**
     * Stop a subroutine
     */
    async function stopSubroutine(characterName, chatName) {
        try {
            const response = await fetch(`${API_BASE}/triggers/${characterName}/${chatName}/stop`, {
                method: 'POST',
            });
            
            const data = await response.json();
            
            if (data.success) {
                toastr.success(`Subroutine "${chatName}" stopped!`);
                await loadSubroutines();
            } else {
                toastr.error(`Failed to stop subroutine: ${data.error}`);
            }
        } catch (error) {
            console.error('[SillyAgents] Error stopping subroutine:', error);
            toastr.error('Failed to stop subroutine');
        }
    }
    
    /**
     * Delete a subroutine
     */
    async function deleteSubroutine(characterName, chatName) {
        const { Popup } = SillyTavern.getContext();
        
        const confirmed = await Popup.show.confirm(
            'Delete Subroutine',
            `Are you sure you want to delete the subroutine "${chatName}" for ${characterName}?`
        );
        
        if (confirmed) {
            try {
                const response = await fetch(`${API_BASE}/subroutines/${characterName}/${chatName}`, {
                    method: 'DELETE',
                });
                
                const data = await response.json();
                
                if (data.success) {
                    toastr.success('Subroutine deleted successfully!');
                    await loadSubroutines();
                    showSubroutinesListDialog(); // Refresh dialog
                } else {
                    toastr.error(`Failed to delete subroutine: ${data.error}`);
                }
            } catch (error) {
                console.error('[SillyAgents] Error deleting subroutine:', error);
                toastr.error('Failed to delete subroutine');
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
