/**
 * Generates a response for any chat (active or inactive) using its chatId.
 * Includes tool definitions so the model can see/use tools, but does NOT
 * automatically execute or loop over tool calls — caller is responsible for that.
 *
 * @param {string} chatId - Filename of the chat (e.g. "Alice - 2025-03-15.json")
 * @param {object} [options] - Optional overrides
 * @param {number} [options.max_tokens] - Override max tokens
 * @param {string} [options.temperature] - Override temperature
 * @returns {Promise<object>} Raw generation result (with possible tool_calls)
 */
async function generateFromChatId(chatId, options = {}) {
    const context = SillyTavern.getContext();

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
    // 2. Build the full message collection (same pipeline as normal generation)
    // ────────────────────────────────────────────────
    const messageCollection = new MessageCollection();

    // System prompts
    const systemKeys = ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'];
    for (const key of systemKeys) {
        let content = chatCompletionDefaultPrompts[key] || '';
        content = substituteParams(content, character);
        if (content.trim()) {
            const prompt = new Prompt({ identifier: key, role: 'system', content });
            messageCollection.add(await Message.fromPromptAsync(prompt));
        }
    }

    // Character card data
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

    // Example messages (from character.mes_example)
    if (character.mes_example?.trim()) {
        const examples = parseExampleIntoIndividual(character.mes_example);
        for (const ex of examples) {
            messageCollection.insertAtStart(ex);
        }
    }

    // Chat history — newest messages at the bottom
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

    // World / lorebook info — temporarily set selected_world_info to character's world
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

    // Extension injections
    const extPrompts = getExtensionPrompt('chat', 0);
    populateInjectionPrompts(extPrompts, messageCollection);

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
    // 4. Generate (single shot — no tool loop)
    // ────────────────────────────────────────────────
    try {
        const result = await context.generateRaw(generationOptions);
        return result;
    } catch (err) {
        console.error("Generation failed:", err);
        throw err;
    }
}
