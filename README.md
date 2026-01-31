# SillyAgents

Autonomous agentic loops and agent skills for SillyTavern.

## Overview

SillyAgents brings complex AI agents to SillyTavern by providing:

- **Subroutines**: Automated chat instances that send scheduled messages to LLMs
- **Agent Skills**: Anthropic-style skills for extending agent capabilities  
- **Macros**: Dynamic text substitution for tool calls, context info, and hardware details
- **Auto-Queue Mode**: Intelligent loop management for long-running tasks

## Features

### Subroutines

Special automated chat instances that operate without manual intervention.

#### Trigger Types

1. **Time-based Triggers**
   - Execute automatically at specified intervals
   - Send "heartbeat" messages to the LLM on schedule
   - Example: Check status every 60 seconds

2. **Tool-based Triggers** 
   - Extends time-based triggers with conditional logic
   - Poll a tool at intervals, only trigger when condition met
   - Example: Check email every 5 minutes, trigger only on new messages

3. **API-based Triggers**
   - Passive mode - waits for external API calls
   - Enables integration with automation systems
   - Example: Trigger when webhook receives request

#### Auto-Queue Mode

- Provides LLMs with a `finish` tool to signal task completion
- Automatically prompts model to continue if no tool calls made
- Customizable continuation prompt
- Helps recover from models that fail to call tools
- Keeps subroutine running until explicitly finished

#### Configuration Options

- **Name**: Identifier for the subroutine
- **Trigger Type**: Time-based, tool-based, or API-based
- **Interval**: For time/tool-based triggers (in seconds)
- **Color**: Visual identifier in chat list
- **Auto-Queue**: Enable/disable auto-queue mode
- **Use Summary**: Enable SillyTavern's native summarizer

### Agent Skills

Support for Anthropic-style skills following the [agentskills.io](https://agentskills.io) specification.

#### What are Skills?

Skills are lightweight, open-format packages containing:
- **SKILL.md**: Instructions and metadata
- **Scripts**: Optional executable code
- **Templates**: Reusable patterns
- **Reference materials**: Documentation and examples

#### Skill Management

- Import skills from ZIP files
- Attach skills to characters or chats (like Lorebooks)
- Browse and search installed skills
- Delete unused skills
- Automatic SKILL.md validation on import

#### Skill Attachment

Skills can be attached to:
- Individual characters (via character card extensions)
- Specific chats (via chat metadata)
- Globally (available to all chats)

### Macros

Dynamic text substitution system for enhancing prompts.

#### Tool Call Macros

```
{call tool X and return response here}
```
Executes a tool inline and inserts its response.

```
{lastCapturedCode}
```
Returns the most recent content from markdown code blocks.

#### Context Macros

```
{contextRemaining}
```
Shows remaining context window space in tokens.

#### Hardware Macros

```
{GPU}     - GPU model (e.g., NVIDIA RTX 6000)
{VRAM}    - VRAM in GB
{CPU}     - CPU model (e.g., AMD Ryzen 5)
{RAM}     - RAM in GB
```

## Installation

### Server Plugin

1. Copy `sillyagents-plugin` folder to SillyTavern's `plugins` directory
2. Enable server plugins in `config.yaml`:
   ```yaml
   enableServerPlugins: true
   ```
3. Install dependencies:
   ```bash
   cd plugins/sillyagents-plugin
   npm install
   ```
4. Restart SillyTavern server

### UI Extension

1. Copy `sillyagents-extension` folder to SillyTavern's extensions directory:
   - User-scoped: `data/<user-handle>/extensions/sillyagents`
   - Server-scoped: `public/scripts/extensions/third-party/sillyagents`
2. Refresh SillyTavern web interface
3. Enable extension in "Manage Extensions" menu

## Usage

### Creating a Subroutine

1. Click "Create Subroutine" button (next to "Create Chat")
2. Configure:
   - **Name**: Give it a descriptive name
   - **Trigger Type**: Choose time-based, tool-based, or API-based
   - **Interval**: Set execution frequency (for time/tool-based)
   - **Color**: Choose a color for visual identification
   - **Auto-Queue**: Enable if you want automatic continuation
3. Click "Create"

The subroutine will appear at the top of your chat list with its designated color.

### Managing Skills

1. Click "Manage Skills" button
2. Click "Import Skill (ZIP)" to add new skills
3. Select a ZIP file containing a SKILL.md
4. The skill will be validated and imported
5. Attach skills to chats/characters as needed

### Using Slash Commands

```
/subroutine list     - List all subroutines
/subroutine create   - Open creation dialog

/skill list          - List all installed skills  
/skill manage        - Open skills management
```

### Attaching Skills

Skills can be attached similar to Lorebooks:

1. Open character card or chat settings
2. Find "Agent Skills" section
3. Click "Attach Skill"
4. Select from installed skills
5. Configure activation conditions (optional)

## Architecture

### Server Plugin (`sillyagents-plugin`)

Provides core backend functionality:

- **API Endpoints**:
  - `/api/plugins/sillyagents/subroutines` - CRUD operations
  - `/api/plugins/sillyagents/skills` - Skill management
  - `/api/plugins/sillyagents/macros` - Macro processing
  - `/api/plugins/sillyagents/triggers` - Trigger control

- **File Storage**:
  - `data/sillyagents/subroutines/` - Subroutine configs
  - `data/sillyagents/skills/` - Imported skills

- **Responsibilities**:
  - Subroutine lifecycle management
  - Trigger execution (timers, polling, webhooks)
  - Skill ZIP import and validation
  - Macro text processing
  - Tool execution coordination

### UI Extension (`sillyagents-extension`)

Provides user interface:

- **Components**:
  - Create Subroutine dialog
  - Skills management interface
  - Settings panel
  - Chat list modifications
  - Skill attachment UI

- **Integration Points**:
  - Event listeners for chat changes
  - Slash command registration
  - Extension settings storage
  - Character card metadata

## API Reference

### Server Plugin API

#### Create Subroutine
```http
POST /api/plugins/sillyagents/subroutines
Content-Type: application/json

{
  "name": "Email Monitor",
  "triggerType": "tool",
  "config": {
    "interval": 300,
    "color": "#4A90E2",
    "autoQueue": true
  }
}
```

#### List Subroutines
```http
GET /api/plugins/sillyagents/subroutines
```

#### Import Skill
```http
POST /api/plugins/sillyagents/skills/import
Content-Type: application/json

{
  "zipData": "base64-encoded-zip",
  "filename": "my-skill.zip"
}
```

#### List Skills
```http
GET /api/plugins/sillyagents/skills
```

## Development

### Prerequisites

- Node.js 18+
- SillyTavern (latest release)
- Basic knowledge of JavaScript

### Project Structure

```
sillyagents/
â”œâ”€â”€ sillyagents-plugin/          # Server plugin
â”‚   â”œâ”€â”€ index.js                 # Main entry point
â”‚   â”œâ”€â”€ package.json
â”‚   â””â”€â”€ README.md
â”‚
â””â”€â”€ sillyagents-extension/       # UI extension
    â”œâ”€â”€ index.js                 # Main script
    â”œâ”€â”€ style.css                # Styles
    â”œâ”€â”€ manifest.json            # Extension metadata
    â””â”€â”€ README.md
```

### Building

The current implementation doesn't require building. For production:

1. Consider bundling with Webpack for the UI extension
2. Use templates: 
   - [Extension-WebpackTemplate](https://github.com/SillyTavern/Extension-WebpackTemplate)
   - [Extension-ReactTemplate](https://github.com/SillyTavern/Extension-ReactTemplate)

### Testing

1. Start SillyTavern with plugin enabled
2. Open browser console for debug logs
3. Test subroutine creation and triggers
4. Import test skills
5. Verify macro substitution

## Roadmap

### Phase 1: Core Functionality âœ“
- [x] Server plugin structure
- [x] Subroutine CRUD operations  
- [x] Skill import/management
- [x] Basic UI extension
- [x] Settings panel

### Phase 2: Triggers & Execution
- [ ] Time-based trigger implementation
- [ ] Tool-based trigger with polling
- [ ] API-based trigger (webhook endpoint)
- [ ] Auto-queue mode with finish tool
- [ ] Trigger start/stop controls

### Phase 3: Skills Integration
- [ ] Skill attachment to chats/characters
- [ ] SKILL.md parsing and injection
- [ ] Activation condition logic
- [ ] Skill search and filtering

### Phase 4: Macros
- [ ] Tool call macro execution
- [ ] Context macros implementation
- [ ] Hardware info macros
- [ ] Code capture macro
- [ ] Custom macro registration

### Phase 5: Advanced Features
- [ ] MCP (Model Context Protocol) client integration
- [ ] Subroutine templates
- [ ] Skill marketplace/discovery
- [ ] Advanced scheduling (cron-style)
- [ ] Subroutine chaining
- [ ] Performance monitoring

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

Apache 2.0 License - See LICENSE file for details

## Support

- **Issues**: Report bugs on GitHub
- **Discussions**: Ask questions in SillyTavern Discord
- **Documentation**: See [docs/](docs/) folder

## Acknowledgments

- SillyTavern team for the extensible architecture
- Anthropic for the Agent Skills specification
- Community contributors and testers

## Related Projects

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Agent Skills](https://agentskills.io)
- [Model Context Protocol](https://modelcontextprotocol.io)
