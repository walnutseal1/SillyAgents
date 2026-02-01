[!IMPORTANT] This will not work. it is still in development,
> A piece of vibe-coded garbage that strives to be as good as another piece of vibe-coded garbage, OpenClaw

SillyAgents (UI Extension)
Autonomous agentic loops and agent skills for SillyTavern.

[!IMPORTANT] Requirement: This extension will not work without the SillyAgents-Plugin. Please install the plugin first.

## System Overview
SillyAgents is a dual-component system designed to bring complex agentic workflows to SillyTavern.

Extension (This Repo): The user interface for creating subroutines, managing skills, and viewing macros.

Plugin (Backend): The engine that handles timers, file storage, and API triggers.

## Installation
1. Install the Backend
Follow the instructions in the SillyAgents-Plugin Repository.

2. Install this Extension
Copy the sillyagents-extension folder to your SillyTavern extensions directory:

User-scoped: data/default-user/extensions/sillyagents

Server-scoped: public/scripts/extensions/third-party/sillyagents

Refresh the SillyTavern web interface and enable SillyAgents in the "Manage Extensions" menu.

## Key Features
Subroutines: Automated chat instances that run on Time, Tool, or API triggers.

Agent Skills: Lightweight, open-format packages following the agentskills.io spec.

Dynamic Macros: Inject hardware stats ({GPU}, {VRAM}) or tool responses directly into prompts.

Auto-Queue Mode: Intelligent loops that keep the agent working until a finish tool is called.

## Usage
Create Agents: Use the "Create Subroutine" button next to the "Create Chat" icon.

Manage Skills: Access the "Manage Skills" dashboard to import .zip skill files.

Slash Commands:

/subroutine list — View active loops.

/skill manage — Open the skills UI.

## API & Development
For detailed API documentation, file storage structures, and backend development guides, please refer to the Plugin Documentation.
