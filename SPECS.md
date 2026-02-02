### SillyAgents
A project that brings complex agents to SillyTavern through autonomous agentic loops and agent skills. Runs as a pure client-side UI extension, with persistence provided by the separate SilentClient plugin.
#### Architecture
SillyAgents is a UI extension for SillyTavern. All logic — subroutine loops, tool call macros, skill management, auto-queue — runs in the browser context. Persistence (keeping that context alive when the user isn't actively browsing) is handled by SilentClient, a general-purpose infrastructure plugin that runs a headless ghost browser. Extensions can check IsGhosted via SilentClient's API to know whether they're running in the ghost client or a real browser tab.
#### Subroutines
Special automated chat instances that send scheduled messages to LLMs without manual intervention.
#### Integration
- Adds a "Create a new Subroutine" button next to "Create a new Chat."
- Will prompt configuration on creation.
- When viewing chats with the manage chats button, subroutines are always pinned to the top and coloured differently.
- When in a chat which is a subroutine, show the subroutines settings panel
- Subroutines panel is a side-panel like the connections panel.
	- Goes on right side of screen (overrides character panel when open)
	- Can be opened or closed
	- Should research how side panels like that are made
- Subroutines are chats. They use the same chat systems, storage, and metadata as any other chat — no new classes invented for them. Configuration is stored in chatMetadata.

#### Trigger Types
Time-based Triggers
- Execute automatically at specified intervals (every X minutes/seconds)
- Sends a "heartbeat" message to the LLM on schedule
Tool-based Triggers
- Extends time-based triggers with conditional logic
- Polls a tool at specified intervals
- Only triggers the LLM when the tool returns a specific result
- Example: Check email every 5 minutes, only trigger when new messages arrive
API-based Triggers
- Passive mode — fetches from a dictated address to check for incoming triggers
- Triggers when the external source has a pending request
- Enables integration with other automation systems
#### Auto-Queue Mode
- Provides LLMs with a finish tool to signal task completion
- Automatically prompts the model to continue if no tool calls are made
- Prompt is customizable, options only show if auto-queue is enabled
- Helps recover from models that fail to call tools consistently
- Keeps the subroutine running until explicitly finished
#### Other Configs
- Use summary — use the native SillyTavern summarizer for compression?
- Color — color of subroutine chat for organization. Example: blue for Discord, gold for email, orange for Moltbook.
- Use lorebooks? — determines if lorebooks are included in context of subroutine chats.
- Use example messages? — determines if example messages are included in context of subroutine chats.
#### Configuration Failsafes
- No silent failure
- Subroutines only work with tool-enabled chat-completions models
- Doesn't work with raw token completion or single-shot instruct
- Will warn on bad config in GUI
#### Macros
#### Tool Call Macros
- {call tool X and return response here} — executes a tool inline and inserts its response
- {lastCapturedCode} — returns the most recent content from markdown code blocks
- Macros can be used as arguments in function calls
#### Context Macros
- {contextRemaining} — shows remaining context window space
- Helps LLMs manage their token budget during long-running tasks
#### Hardware Macros
- {GPU} — model, e.g. NVIDIA RTX 6000
- {VRAM} — in GB
- {CPU} — model, e.g. AMD Ryzen 5
- {RAM} — in GB
- These are optional and should be added last
#### Agent Skills
SillyAgents supports Anthropic-style Skills.
Agent Skills are a lightweight, open format for extending AI agent capabilities with specialized knowledge and workflows. At its core, a skill is a folder containing a SKILL.md file. This file includes metadata (name and description, at minimum) and instructions that tell an agent how to perform a specific task. Skills can also bundle scripts, templates, and reference materials.
#### Skills Official Documentation
- https://agentskills.io/integrate-skills
- https://agentskills.io/specification
- https://agentskills.io/what-are-skills
#### Integration
- Adds a new icon tab next to the Lorebook icon tab 
- When clicked, open up a dialogue similar to the Lorebook manager (should look online to see how that looks as a reference)
- Can import and export skills
- Import skills as .zip or as a folder
- Skills can be attached to a character or chat, like a Lorebook.
- Will error on import if a SKILL.md is not found.
#### MCP Client
Planned to be natively supported in the far future, but existing MCP plugins already do a good job. Will suggest to users to install one if not found, as SillyAgents is most useful when used in combination with MCP.
#### Implementation
SillyAgents is a single UI extension built using the SillyTavern Extensions API.
- Subroutine logic runs entirely in the browser via extension event listeners and setInterval loops. Configuration and state are stored in chatMetadata.
- Macros are registered client-side using registerMacro.
- Skills are managed through the extension UI, attached to chats like lorebooks.
- API-based triggers fetch from a user-dictated external address to poll for incoming requests.
- Persistence is provided by SilentClient. When the user closes their browser, SilentClient's headless ghost browser keeps the SillyTavern tab (and therefore all active subroutine loops) alive. Extensions can check the IsGhosted flag via /api/plugins/silentclient/ghosted to adjust behavior in the ghost context.
- SilentClient repo: https://github.com/walnutseal1/SillyTavern-SilentClient 
#### For LLMs
If you are an LLM developing this (e.g. Claude), always read this document before writing code or else you will hallucinate the APIs. The example extension is also helpful.
