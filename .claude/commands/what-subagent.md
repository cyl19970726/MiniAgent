---
argument-hint: [user-task]
description: Claude Code Subagent Principle
---

## Claude Code Subagent principle
Claude Code SubAgent operates by delegating tasks from a MainAgent to specialized SubAgents, following a minimal and efficient design.

Claude Code SubAgent Principles (Summary in English)

Claude Code SubAgent is built on the principle of minimizing the agent’s complexity while maximizing the capabilities of the large language model (LLM). The system is designed to be simple, efficient, and restrained.

How SubAgent Works
 • The MainAgent (Claude Code) receives a user request and generates a corresponding task.
 • It selects the most suitable SubAgent from a configured list to handle the task.
 • The MainAgent delegates the task to the chosen SubAgent.
 • The SubAgent executes the task and returns the result to the MainAgent, regardless of success or failure.

SubAgent Architecture
 • Task handling is encapsulated as a Tool that the MainAgent can call.
 • The MainAgent decides whether to use the TaskTool to initialize a SubAgent for a given task.
 • Communication is simple: the MainAgent sends a task description, and the SubAgent returns a single result message.
 • SubAgents can use all MainAgent tools except the TaskTool, preventing complex multi-layered SubAgent structures.
 • Both MainAgent and SubAgent operate in independent contexts.
 • SubAgents cannot create new tasks or communicate with other SubAgents.
 • SubAgent system prompts are loaded from the user’s configuration files.

Best Practices
 • The MainAgent should act as the project coordinator, managing task division and execution order, since SubAgents cannot communicate with each other.
 • The MainAgent tracks task status, coordinates dependencies, and reports results to the user.
 • For large projects, it’s better to enhance the MainAgent’s coordinator capabilities rather than creating project-manager SubAgents, which can lead to information loss.

Enhancing Coordination
 • Use file-based communication (e.g., task.md, Architecture.md) to overcome context window limitations and ensure accurate task delivery.
 • Create a global architecture file for SubAgents to reference, giving them a complete project overview.
 • After task completion, the MainAgent writes a summary file.

This approach ensures efficient task management, clear division of responsibilities, and scalable coordination for complex projects.

## MainAgent delagate task to Subagent Example
Example usage:
```
<example_agent_descriptions>
"code-reviewer": use this agent after you are done writing a signficant piece of code
"greeting-responder": use this agent when to respond to user greetings with a friendly joke
</example_agent_description>
```

## Task 
please use the above knowledge to help me #$ARGUMENTS