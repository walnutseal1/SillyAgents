# SillyAgents Development Guide

## Getting Started

This guide will help you understand and extend the SillyAgents codebase.

## Architecture Overview

SillyAgents consists of two main components:

1. **Server Plugin** - Backend functionality running in Node.js
2. **UI Extension** - Frontend interface running in browser

### Communication Flow

```
Browser (UI Extension)
    â†“ HTTP Requests
Server Plugin API Endpoints
    â†“ File I/O
Persistent Storage (JSON files)
```

## Server Plugin Deep Dive

### File: `sillyagents-plugin/index.js`

#### Key Functions

**`init(router)`**
- Called when SillyTavern starts
- Registers API routes
- Creates storage directories
- Returns a Promise

**`exit()`**  
- Called when SillyTavern stops
- Clean up timers, connections, etc.
- Returns a Promise

#### API Routes

All routes are mounted under `/api/plugins/sillyagents/`

**Subroutine Routes:**
```javascript
POST   /subroutines          - Create new subroutine
GET    /subroutines          - List all subroutines  
GET    /subroutines/:id      - Get specific subroutine
PUT    /subroutines/:id      - Update subroutine
DELETE /subroutines/:id      - Delete subroutine
```

**Skill Routes:**
```javascript
POST   /skills/import        - Import skill from ZIP
GET    /skills               - List all skills
GET    /skills/:id           - Get skill details
DELETE /skills/:id           - Delete skill
```

**Macro Routes:**
```javascript
POST   /macros/process       - Process macros in text
```

**Trigger Routes:**
```javascript
POST   /triggers/:id/start   - Start a trigger
POST   /triggers/:id/stop    - Stop a trigger
```

### Data Storage

Data is stored in JSON files:

```
data/sillyagents/
â”œâ”€â”€ subroutines/
â”‚   â”œâ”€â”€ {id}.json            # Subroutine config
â”‚   â””â”€â”€ ...
â””â”€â”€ skills/
    â”œâ”€â”€ {id}/
    â”‚   â”œâ”€â”€ SKILL.md         # Skill instructions
    â”‚   â”œâ”€â”€ skill-info.json  # Metadata
    â”‚   â””â”€â”€ ...              # Other skill files
    â””â”€â”€ ...
```

#### Subroutine JSON Structure

```json
{
  "id": "1234567890-abc123",
  "name": "Email Monitor",
  "triggerType": "tool",
  "config": {
    "interval": 300,
    "color": "#4A90E2",
    "autoQueue": true,
    "toolName": "check_email",
    "triggerCondition": "new_messages > 0"
  },
  "createdAt": "2025-01-30T12:00:00Z",
  "updatedAt": "2025-01-30T12:30:00Z",
  "active": false
}
```

#### Skill Info JSON Structure

```json
{
  "id": "skill-abc123",
  "name": "Email Management",
  "description": "Handles email operations",
  "path": "/path/to/skill/folder",
  "importedAt": "2025-01-30T12:00:00Z"
}
```

### Adding New Features

#### Example: Adding a New API Endpoint

```javascript
// In registerSubroutineRoutes()
router.post('/subroutines/:id/duplicate', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(SUBROUTINES_DIR, `${id}.json`);
        
        // Read original
        const content = await fs.readFile(filePath, 'utf-8');
        const original = JSON.parse(content);
        
        // Create duplicate with new ID
        const duplicate = {
            ...original,
            id: generateId(),
            name: `${original.name} (Copy)`,
            createdAt: new Date().toISOString(),
        };
        
        // Save duplicate
        const newPath = path.join(SUBROUTINES_DIR, `${duplicate.id}.json`);
        await fs.writeFile(newPath, JSON.stringify(duplicate, null, 2));
        
        res.json({ success: true, subroutine: duplicate });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

## UI Extension Deep Dive

### File: `sillyagents-extension/index.js`

#### Initialization Flow

1. Extension loaded by SillyTavern
2. `init()` function called
3. Settings loaded from `extensionSettings`
4. UI elements injected
5. Event listeners registered
6. Slash commands registered
7. Initial data loaded from server

#### Key Concepts

**Getting SillyTavern Context:**
```javascript
const context = SillyTavern.getContext();
const {
    chat,              // Current chat messages
    characters,        // All characters
    characterId,       // Current character index
    extensionSettings, // Settings storage
    chatMetadata,      // Current chat metadata
    eventSource,       // Event system
    event_types,       // Event type constants
} = context;
```

**Saving Settings:**
```javascript
// Modify settings
extensionSettings[MODULE_NAME].myOption = newValue;

// Save (debounced - won't write immediately)
context.saveSettingsDebounced();
```

**Listening to Events:**
```javascript
eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('Chat changed!');
    // React to chat change
});
```

**Registering Slash Commands:**
```javascript
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'mycommand',
    callback: async (namedArgs, unnamedArgs) => {
        // Command logic here
        return 'Result message';
    },
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
            name: 'option',
            description: 'An option',
            typeList: ARGUMENT_TYPE.STRING,
        }),
    ],
    helpString: 'Help text for the command',
}));
```

**Making API Calls:**
```javascript
const response = await fetch(`${API_BASE}/subroutines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test' }),
});

const data = await response.json();
if (data.success) {
    toastr.success('Success!');
} else {
    toastr.error('Error: ' + data.error);
}
```

**Showing Dialogs:**
```javascript
const { Popup } = SillyTavern.getContext();

// Confirmation dialog
const confirmed = await Popup.show.confirm('Title', 'Message');

// Input dialog
const value = await Popup.show.input('Title', 'Prompt', 'default');

// Text dialog
await Popup.show.text('Title', 'Content HTML');
```

### CSS Styling

The extension uses SillyTavern's CSS variables for theming:

```css
/* Common variables */
--SmartThemeBorderColor  /* Border color */
--black30a               /* Semi-transparent black */
--grey70                 /* Grey text */

/* Custom properties */
--subroutine-color       /* Dynamically set per subroutine */
```

### Adding New UI Features

#### Example: Adding a Status Indicator

**JavaScript (index.js):**
```javascript
function updateSubroutineStatus(subroutineId, active) {
    const indicator = $(`.subroutine-status[data-id="${subroutineId}"]`);
    if (active) {
        indicator.addClass('active').text('Running');
    } else {
        indicator.removeClass('active').text('Stopped');
    }
}

// In showCreateSubroutineDialog or similar
const statusHtml = `
    <div class="subroutine-status" data-id="${subroutine.id}">
        Stopped
    </div>
`;
```

**CSS (style.css):**
```css
.subroutine-status {
    padding: 5px 10px;
    border-radius: 3px;
    background-color: #E74C3C;
    color: white;
    display: inline-block;
}

.subroutine-status.active {
    background-color: #2ECC71;
}
```

## Implementing Triggers

### Time-based Triggers

```javascript
// In server plugin
const activeTimers = new Map();

function startTimeTrigger(subroutineId, interval) {
    // Clear existing timer
    stopTimeTrigger(subroutineId);
    
    // Create new timer
    const timer = setInterval(async () => {
        await executeTrigger(subroutineId);
    }, interval * 1000);
    
    activeTimers.set(subroutineId, timer);
}

function stopTimeTrigger(subroutineId) {
    const timer = activeTimers.get(subroutineId);
    if (timer) {
        clearInterval(timer);
        activeTimers.delete(subroutineId);
    }
}

async function executeTrigger(subroutineId) {
    // Load subroutine config
    const config = await loadSubroutineConfig(subroutineId);
    
    // TODO: Send message to LLM
    console.log(`Executing trigger for ${subroutineId}`);
}
```

### Tool-based Triggers

```javascript
async function startToolTrigger(subroutineId, toolName, condition, interval) {
    const timer = setInterval(async () => {
        // Execute tool
        const result = await executeTool(toolName);
        
        // Check condition
        if (evaluateCondition(result, condition)) {
            await executeTrigger(subroutineId);
        }
    }, interval * 1000);
    
    activeTimers.set(subroutineId, timer);
}

function evaluateCondition(result, condition) {
    // Simple evaluation (can be enhanced with expression parser)
    // Example: "new_messages > 0"
    try {
        return eval(condition.replace(/(\w+)/g, 'result.$1'));
    } catch {
        return false;
    }
}
```

### API-based Triggers

```javascript
// In registerTriggerRoutes()
router.post('/triggers/:id/webhook', async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;
        
        // Execute trigger with payload
        await executeTrigger(id, payload);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

## Implementing Skills

### Skill ZIP Structure

```
skill-name.zip
â”œâ”€â”€ SKILL.md              # Required: Instructions
â”œâ”€â”€ script.js             # Optional: Executable code
â”œâ”€â”€ template.hbs          # Optional: Handlebars template
â”œâ”€â”€ examples/             # Optional: Examples
â”‚   â””â”€â”€ example1.txt
â””â”€â”€ assets/               # Optional: Images, etc.
    â””â”€â”€ diagram.png
```

### Parsing SKILL.md

```javascript
function parseSkillMetadata(content) {
    const metadata = {};
    
    // Extract YAML front matter
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontMatterMatch) {
        const yaml = frontMatterMatch[1];
        // Parse YAML (would need yaml parser library)
        // metadata = parseYAML(yaml);
    }
    
    // Extract first heading as name
    const nameMatch = content.match(/^#\s+(.+)$/m);
    if (nameMatch) {
        metadata.name = nameMatch[1].trim();
    }
    
    // Extract description (first paragraph)
    const lines = content.split('\n');
    let inDescription = false;
    let description = [];
    
    for (const line of lines) {
        if (line.startsWith('#')) {
            if (inDescription) break;
            inDescription = true;
            continue;
        }
        if (inDescription && line.trim()) {
            description.push(line.trim());
        }
        if (inDescription && !line.trim() && description.length > 0) {
            break;
        }
    }
    
    metadata.description = description.join(' ');
    
    return metadata;
}
```

### Attaching Skills to Chats

```javascript
// In UI extension
async function attachSkillToChat(skillId) {
    const context = SillyTavern.getContext();
    
    // Get current chat metadata
    const metadata = context.chatMetadata;
    
    // Initialize skills array if needed
    if (!metadata.sillyagents_skills) {
        metadata.sillyagents_skills = [];
    }
    
    // Add skill if not already attached
    if (!metadata.sillyagents_skills.includes(skillId)) {
        metadata.sillyagents_skills.push(skillId);
        
        // Save metadata
        await context.saveMetadata();
        
        toastr.success('Skill attached to chat');
    }
}
```

### Injecting Skills into Context

```javascript
// In server plugin or via extension
async function injectSkillsIntoContext(chatId) {
    // Get chat metadata
    const metadata = await getChatMetadata(chatId);
    const skillIds = metadata.sillyagents_skills || [];
    
    // Load skill contents
    const skillContents = [];
    for (const skillId of skillIds) {
        const skillPath = path.join(SKILLS_DIR, skillId, 'SKILL.md');
        const content = await fs.readFile(skillPath, 'utf-8');
        skillContents.push(content);
    }
    
    // Combine into system prompt addition
    const systemAddition = skillContents.join('\n\n---\n\n');
    
    return systemAddition;
}
```

## Implementing Macros

### Macro Processing

```javascript
// In server plugin
function processMacros(text, context) {
    let processed = text;
    
    // Process tool call macros
    const toolCallRegex = /\{call\s+(\w+)(?:\s+(.+?))?\}/g;
    processed = processed.replace(toolCallRegex, (match, toolName, args) => {
        // Execute tool and return result
        const result = executeToolSync(toolName, args);
        return result;
    });
    
    // Process context macros
    processed = processed.replace(/\{contextRemaining\}/g, () => {
        return context.contextRemaining || 'Unknown';
    });
    
    // Process hardware macros
    processed = processed.replace(/\{GPU\}/g, getGPUInfo());
    processed = processed.replace(/\{VRAM\}/g, getVRAMInfo());
    processed = processed.replace(/\{CPU\}/g, getCPUInfo());
    processed = processed.replace(/\{RAM\}/g, getRAMInfo());
    
    // Process code capture macro
    processed = processed.replace(/\{lastCapturedCode\}/g, () => {
        return context.lastCapturedCode || '';
    });
    
    return processed;
}

function getGPUInfo() {
    // Platform-specific GPU detection
    // Could use nvidia-smi, system_profiler, etc.
    return 'NVIDIA RTX 6000'; // Placeholder
}
```

### Capturing Code Blocks

```javascript
// In UI extension
function captureCodeBlocks() {
    const context = SillyTavern.getContext();
    const { chat } = context;
    
    // Find last message with code block
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        const codeMatch = message.mes.match(/```[\s\S]*?\n([\s\S]*?)```/);
        
        if (codeMatch) {
            // Store captured code
            if (!context.chatMetadata.sillyagents) {
                context.chatMetadata.sillyagents = {};
            }
            context.chatMetadata.sillyagents.lastCapturedCode = codeMatch[1];
            break;
        }
    }
}

// Listen for new messages
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, captureCodeBlocks);
```

## Implementing Auto-Queue Mode

### Server Side

```javascript
async function handleAutoQueue(subroutineId, response) {
    const config = await loadSubroutineConfig(subroutineId);
    
    if (!config.config.autoQueue) {
        return; // Auto-queue disabled
    }
    
    // Check if response contains tool calls
    const hasToolCalls = response.tool_calls && response.tool_calls.length > 0;
    
    // Check for finish tool
    const hasFinish = hasToolCalls && 
        response.tool_calls.some(tc => tc.function.name === 'finish');
    
    if (hasFinish) {
        // Task completed, stop subroutine
        await stopSubroutine(subroutineId);
        return;
    }
    
    if (!hasToolCalls) {
        // No tool calls, prompt to continue
        const continuePrompt = config.config.continuePrompt || 
            'Continue with your task. If you have completed the task, use the finish tool.';
        
        await sendMessageToSubroutine(subroutineId, continuePrompt);
    }
}
```

### Adding Finish Tool

```javascript
// In system prompt or tool definitions
const finishTool = {
    type: 'function',
    function: {
        name: 'finish',
        description: 'Call this when you have completed the task',
        parameters: {
            type: 'object',
            properties: {
                summary: {
                    type: 'string',
                    description: 'Summary of what was accomplished'
                }
            },
            required: ['summary']
        }
    }
};
```

## Testing

### Manual Testing Checklist

**Server Plugin:**
- [ ] Plugin loads without errors
- [ ] API endpoints respond correctly
- [ ] Subroutines can be created/updated/deleted
- [ ] Skills can be imported from ZIP
- [ ] File storage works correctly

**UI Extension:**
- [ ] Extension loads in browser
- [ ] Settings panel appears
- [ ] Create Subroutine dialog works
- [ ] Skills dialog works
- [ ] Slash commands function
- [ ] API calls succeed

**Integration:**
- [ ] UI can communicate with server plugin
- [ ] Data persists across restarts
- [ ] Events trigger correctly
- [ ] Error handling works

### Debugging Tips

**Server Plugin:**
```javascript
// Add detailed logging
console.log('[SillyAgents]', 'Debug info:', data);

// Log all requests
router.use((req, res, next) => {
    console.log(`[SillyAgents] ${req.method} ${req.path}`);
    next();
});
```

**UI Extension:**
```javascript
// Browser console logging
console.log('[SillyAgents]', 'Extension state:', {
    subroutines,
    skills,
    settings: extensionSettings[MODULE_NAME]
});

// Inspect API responses
const response = await fetch(url);
const data = await response.json();
console.log('API response:', data);
```

## Performance Considerations

1. **Debounce Saves**: Use `saveSettingsDebounced()` instead of immediate saves
2. **Batch Operations**: Load multiple items in single API call when possible
3. **Lazy Loading**: Only load data when needed
4. **Clean Up**: Remove event listeners and timers in cleanup functions
5. **Async Operations**: Use async/await to avoid blocking

## Security Considerations

1. **Input Validation**: Always validate user input on server side
2. **Path Traversal**: Sanitize file paths to prevent directory traversal
3. **ZIP Bombs**: Check ZIP file size before extraction
4. **SQL Injection**: N/A (we use file storage), but be aware for future DB
5. **XSS**: Sanitize user input before displaying in HTML

## Common Patterns

### Error Handling

```javascript
// Server side
try {
    // Operation
} catch (error) {
    console.error('[SillyAgents] Error:', error);
    res.status(500).json({ error: error.message });
}

// Client side
try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error);
    }
    
    // Handle success
} catch (error) {
    console.error('[SillyAgents] Error:', error);
    toastr.error('Operation failed: ' + error.message);
}
```

### Loading States

```javascript
// Show loading indicator
toastr.info('Loading...');

try {
    await longOperation();
    toastr.clear();
    toastr.success('Complete!');
} catch (error) {
    toastr.clear();
    toastr.error('Failed!');
}
```

## Next Steps

Now that you understand the architecture:

1. Review the existing code
2. Pick a feature from the roadmap
3. Implement it following these patterns
4. Test thoroughly
5. Submit a pull request!

## Resources

- [SillyTavern Documentation](https://docs.sillytavern.app)
- [Express.js Documentation](https://expressjs.com)
- [jQuery Documentation](https://api.jquery.com)
- [Agent Skills Specification](https://agentskills.io)
