/**
 * Generates a response for any chat (active or inactive) using its chatId.
 * Includes tool definitions so the model can see/use tools, but does NOT
 * automatically execute or loop over tool calls — caller is responsible for that.
 *
 * Enhanced flexibility:
 * - Disable prompt parts via flexOptions (e.g., { disableWorldInfo: true, disableExtensions: true, disableExamples: true, disableSystemPrompts: ['nsfw', 'jailbreak'] })
 * - Specify connectionProfile (string: preset name like 'OpenAI-Default' or API type like 'openai'). Defaults to chat's associated preset if available (from character.data.extensions.preset or similar), else global current.
 *
 * @param {string} chatId - Filename of the chat (e.g. "Alice - 2025-03-15.json")
 * @param {object} [options] - Optional generation overrides (e.g., { max_tokens: 400, temperature: 0.85 })
 * @param {object} [flexOptions] - Flexibility flags for prompt building
 * @param {boolean} [flexOptions.disableWorldInfo] - Skip world/lorebook injection (default: false)
 * @param {boolean} [flexOptions.disableExtensions] - Skip extension prompts (default: false)
 * @param {boolean} [flexOptions.disableExamples] - Skip example messages (default: false)
 * @param {string[]} [flexOptions.disableSystemPrompts] - Array of system prompt keys to skip (e.g., ['nsfw', 'jailbreak']) (default: [])
 * @param {string} [connectionProfile] - Preset/API name to use for generation (overrides default)
 * @returns {Promise<object>} Raw generation result (with possible tool_calls)
 */
async function generateFromChatId(chatId, options = {}, flexOptions = {}, connectionProfile = null) {
    const context = SillyTavern.getContext();

    // Resolve defaults for flexOptions
    const {
        disableWorldInfo = false,
        disableExtensions = false,
        disableExamples = false,
        disableSystemPrompts = [],
    } = flexOptions;

    // ────────────────────────────────────────────────
    // 1. Load the target chat
    // ────────────────────────────────────────────────
    let chatData;
    try {
        const response = await fetch(`/chats/${chatId}`);
        if (!response.ok) throw new Error(`Chat not found: ${chatId}`);
        chatData = await response.json();
    } catch (err) {
        throw new Error(`Failed to load chat ${chatId}: ${err.message}`);
    }

    const messages = chatData.chat || [];
    const characterId = chatData.chid;

    const character = context.characters.find(c => c.chat === chatId || c._id === characterId);
    if (!character) {
        throw new Error(`Character not found for chat ${chatId}`);
    }

    // ────────────────────────────────────────────────
    // 2. Build the full message collection (with conditional skips)
    // ────────────────────────────────────────────────
    const messageCollection = new MessageCollection();

    // System prompts (conditionally skip specific keys)
    const systemKeys = ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'].filter(key => !disableSystemPrompts.includes(key));
    for (const key of systemKeys) {
        let content = chatCompletionDefaultPrompts[key] || '';
        content = substituteParams(content, character);
        if (content.trim()) {
            const prompt = new Prompt({ identifier: key, role: 'system', content });
            messageCollection.add(await Message.fromPromptAsync(prompt));
        }
    }

    // Character card data (always include core char info; could add disableCharData if needed)
    const charBlocks = [
        { key: 'description', value: character.description },
        { key: 'personality', value: character.personality },
        { key: 'scenario', value: character.scenario },
    ];
    for (const { key, value } of charBlocks) {
        if (value?.trim()) {
            const text = substituteParams(`{{${key}}}: ${value}`, character);
            const prompt = new Prompt({ identifier: `char_${key}`, role: 'system', content: text });
            messageCollection.add(await Message.fromPromptAsync(prompt));
        }
    }

    // Example messages (skip if disabled)
    if (!disableExamples && character.mes_example?.trim()) {
        const examples = parseExampleIntoIndividual(character.mes_example);
        for (const ex of examples) {
            messageCollection.insertAtStart(ex);
        }
    }

    // Chat history — newest messages at the bottom (always include; core to chat)
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (!msg.mes?.trim()) continue;

        const role = msg.is_user ? 'user' : 'assistant';
        const message = new Message({
            role,
            content: msg.mes,
            name: msg.name || (role === 'user' ? context.name : character.name),
        });

        if (await messageCollection.canAfford(message)) {
            messageCollection.insertAtStart(message);
        }
    }

    // World / lorebook info (skip if disabled; use character's specific world)
    if (!disableWorldInfo) {
        const originalWorldInfo = selected_world_info;
        selected_world_info = character.data?.extensions?.world || '';  // Use character's specific world info if set
        try {
            const worldInfo = await getWorldInfoPrompt(messageCollection.getChat(), oai_settings.max_context);
            if (worldInfo?.before?.content) {
                messageCollection.add(await Message.fromPromptAsync(worldInfo.before));
            }
            if (worldInfo?.after?.content) {
                messageCollection.add(await Message.fromPromptAsync(worldInfo.after));
            }
        } finally {
            selected_world_info = originalWorldInfo;  // Restore original
        }
    }

    // Extension injections (skip if disabled)
    if (!disableExtensions) {
        const extPrompts = getExtensionPrompt('chat', 0);
        populateInjectionPrompts(extPrompts, messageCollection);
    }

    // ────────────────────────────────────────────────
    // 3. Prepare tools (so model can see them)
    // ────────────────────────────────────────────────
    const toolManager = ToolManager.instance;
    const activeTools = toolManager.tools.filter(t => !t.shouldRegister || t.shouldRegister());

    const generationOptions = {
        prompt: messageCollection.getChat(),   // final array of {role, content} messages
        max_tokens: options.max_tokens ?? oai_settings.max_tokens ?? 512,
        temperature: options.temperature ?? oai_settings.temp ?? 0.7,
    };

    // Attach tools if any are active
    if (activeTools.length > 0) {
        generationOptions.tools = activeTools.map(tool => tool.toFunctionOpenAI?.() || tool.toOpenAI?.() || {
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters || tool.schema || {}
            }
        });

        generationOptions.tool_choice = oai_settings.tool_choice || 'auto';
    }

    // ────────────────────────────────────────────────
    // 4. Handle connection profile (temporary switch if specified or default from chat/character)
    // ────────────────────────────────────────────────
    let originalPreset = null;
    let originalApiType = null;
    try {
        // Default: Use chat/character's associated preset if available
        const defaultProfile = connectionProfile || character.data?.extensions?.openai_preset || character.data?.extensions?.preset || null;

        if (defaultProfile) {
            // Assume preset_manager and api_type are globals; adjust based on exact SillyTavern vars
            originalPreset = preset_manager;  // Save current preset
            originalApiType = api_type;      // Save current API type (e.g., 'openai', 'claude')

            // Set to specified/default profile (this assumes profiles are preset names; tweak if needed)
            preset_manager = defaultProfile;  // Or loadPreset(defaultProfile)
            if (defaultProfile.startsWith('openai')) api_type = 'openai';  // Example logic; extend for other types
            // ... add more for claude, horde, etc.
        }

        // Generate (single shot — no tool loop)
        const result = await context.generateRaw(generationOptions);
        return result;
    } catch (err) {
        console.error("Generation failed:", err);
        throw err;
    } finally {
        // Restore originals if changed
        if (originalPreset !== null) preset_manager = originalPreset;
        if (originalApiType !== null) api_type = originalApiType;
    }
}
