# Task Master AI - Essential Reference

## MCP Tools (Core Workflow)

Use these MCP tools directly in Claude Code:

```javascript
// Daily workflow
mcp__task-master-ai__get_tasks          // List all tasks
mcp__task-master-ai__next_task          // Get next available task
mcp__task-master-ai__get_task           // Show task details (requires id parameter)
mcp__task-master-ai__set_task_status    // Update task status (requires id and status)

// Task management
mcp__task-master-ai__update_subtask     // Add implementation notes (requires id and prompt)
mcp__task-master-ai__expand_task        // Break task into subtasks (requires id)
mcp__task-master-ai__update_task        // Update specific task (requires id and prompt)
mcp__task-master-ai__add_task           // Add new task (requires prompt)
```

## Task Status Values

- `pending` - Ready to work on
- `in-progress` - Currently being worked on
- `done` - Completed and verified
- `review` - Awaiting review
- `deferred` - Postponed
- `cancelled` - No longer needed
- `blocked` - Waiting on dependencies

## Task ID Format

- Main tasks: `1`, `2`, `3`
- Subtasks: `1.1`, `1.2`, `2.1`
- Sub-subtasks: `1.1.1`, `1.1.2`

## Key Files

- `.taskmaster/tasks/tasks.json` - Main task database (auto-managed, don't edit manually)
- `.taskmaster/config.json` - AI model configuration
- `.taskmaster/CLAUDE.full.md` - Complete documentation (reference only)

## Essential Workflow

```bash
# 1. Get next task
mcp__task-master-ai__next_task

# 2. Work on task, log progress
mcp__task-master-ai__update_subtask(id="1.2", prompt="implementation notes...")

# 3. Mark complete
mcp__task-master-ai__set_task_status(id="1.2", status="done")
```

## Notes

- Use MCP tools directly (no CLI commands needed in Claude Code)
- Never manually edit `tasks.json` - use MCP tools instead
- For full documentation, see `.taskmaster/CLAUDE.full.md`
