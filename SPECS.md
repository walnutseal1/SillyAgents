## SillyAgents
Is a project that plans to bring complex agents to SillyTavern. It does this by bringing autonomous agentic loops and agent skills to SillyTavern

### Subroutines
Special automated chat instances that send scheduled messages to LLMs without manual intervention. 
#### Integration
- Adds a Create a new Subroutine button next to create a new chat.
- Will prompt configuration.
- When viewing chats with the manage chats button, subroutines are always pinned to the top, and coloured differently.
- Subroutines, other than the automated integration, should be chats. They should not have 100000 new classes invented for them.
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
- Passive mode - waits for external applications to send requests
- Triggers when external API call is received
- Enables integration with other automation systems
#### Auto-Queue Mode
- Provides LLMs with a finish tool to signal task completion
- Automatically prompts the model to continue if no tool calls are made
- Prompt is customizable, options only show if auto-queue is enabled
- Helps recover from models that fail to call tools consistently
- Keeps the subroutine running until explicitly finished
#### Other Configs
- Use summary - use the native SillyTavern summarizer for compression?
- Color of subroutine chat for organization, you could set blue for discord, gold for email, and orange for moltbook
- Use lorebooks? - Determines if Lorebooks are included in context of subroutine chats.
- Use example messages? - Determines if example messages are included in context of subroutine chats
#### Configuration Failsafes
- No silent failure
- Subroutines only work with tool-enabled chat-completions models
- Doesn’t work with raw token completion or single shot instruct
- Will warn on bad config in gui
### Macros
#### Tool Call Macros
- {call tool X and return response here} - Executes a tool inline and inserts its response
- {lastCapturedCode} - Returns the most recent content from markdown code blocks
- Macros can be used as arguments in function calls
#### Context Macros
- {contextRemaining} - Shows remaining context window space
- Helps LLMs manage their token budget during long-running tasks
#### Hardware Macros
- {GPU} model, eg NVIDIA RTX 6000
- {VRAM} in gb
- {CPU} model, eg AMD Ryzen 5
- {RAM} in gb
### Agent Skills
SillyAgents supports Anthropic style SKILLS.

Agent Skills are a lightweight, open format for extending AI agent capabilities with specialized knowledge and workflows.
At its core, a skill is a folder containing a SKILL.md file. This file includes metadata ( name and description, at minimum) and instructions that tell an agent how to perform a specific task. Skills can also bundle scripts, templates, and reference materials.
#### Skills Official Documentation
- https://agentskills.io/integrate-skills 
- https://agentskills.io/specification 
- https://agentskills.io/what-are-skills
#### Integration
- Skills can be attached to a character or chat, like a Lorebook.
- Supports importing a .zip as a skill
- Will error on importing if a SKILL.md is not found
### MCP Client
Planned to be natively supported in far future, but existing MCP plugins already do a good job. 
Will suggest to users to install one if not found, as SillyAgents is most useful when used in combination with MCP.
### Implementation
Uses https://docs.sillytavern.app/for-contributors/server-plugins/ for most functionality
Uses https://docs.sillytavern.app/for-contributors/writing-extensions/ for the GUI
If you are a LLM developing this (eg. claude), always read this or else you will hallucinate the code. The example extension is helpful too
