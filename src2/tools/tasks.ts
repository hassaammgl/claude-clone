import { ToolDefinition } from "./types";
import { Task } from "../agent/context";

export const taskCreateTool: ToolDefinition = {
  name: "task_create",
  description: "Create a new task in the session's memory to track progress.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string", description: "Description of the task" },
      status: { type: "string", enum: ["pending", "in_progress", "done"], description: "Initial status" }
    },
    required: ["content", "status"]
  },
  execute: async (input, context) => {
    const id = `task_${Math.random().toString(36).substr(2, 6)}`;
    const task: Task = {
      id,
      content: input.content,
      status: input.status as any
    };
    context.tasks.push(task);
    return `Created task [${task.id}]: ${task.content} (${task.status})`;
  }
};

export const taskListTool: ToolDefinition = {
  name: "task_list",
  description: "List all tasks currently tracked in the session's memory.",
  input_schema: {
    type: "object",
    properties: {}
  },
  execute: async (_, context) => {
    if (context.tasks.length === 0) return "No tasks currently tracked.";
    
    return context.tasks.map(t => `[${t.id}] ${t.status.toUpperCase()} - ${t.content}`).join("\n");
  }
};

export const taskGetTool: ToolDefinition = {
  name: "task_get",
  description: "Get details for a specific task by ID.",
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string" }
    },
    required: ["task_id"]
  },
  execute: async (input, context) => {
    const task = context.tasks.find(t => t.id === input.task_id);
    if (!task) return `Error: Task ${input.task_id} not found.`;
    return JSON.stringify(task, null, 2);
  }
};

export const taskUpdateTool: ToolDefinition = {
  name: "task_update",
  description: "Update a task's content or status.",
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      content: { type: "string", description: "New content (optional)" },
      status: { type: "string", enum: ["pending", "in_progress", "done"], description: "New status (optional)" }
    },
    required: ["task_id"]
  },
  execute: async (input, context) => {
    const task = context.tasks.find(t => t.id === input.task_id);
    if (!task) return `Error: Task ${input.task_id} not found.`;
    
    if (input.content) task.content = input.content;
    if (input.status) task.status = input.status;
    
    return `Updated task [${task.id}]: ${task.content} (${task.status})`;
  }
};

export const taskDeleteTool: ToolDefinition = {
  name: "task_delete",
  description: "Delete a task from memory.",
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string" }
    },
    required: ["task_id"]
  },
  execute: async (input, context) => {
    const initialLen = context.tasks.length;
    context.tasks = context.tasks.filter(t => t.id !== input.task_id);
    
    if (context.tasks.length === initialLen) return `Error: Task ${input.task_id} not found.`;
    return `Deleted task ${input.task_id}`;
  }
};

export const todoWriteTool: ToolDefinition = {
  name: "todo_write",
  description: "Overwrite the entire task list at once. Useful for bulk creating a plan.",
  input_schema: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "done"] }
          },
          required: ["content", "status"]
        }
      }
    },
    required: ["todos"]
  },
  execute: async (input, context) => {
    context.tasks = input.todos.map((t: any) => ({
      id: `task_${Math.random().toString(36).substr(2, 6)}`,
      content: t.content,
      status: t.status
    }));
    return `Successfully bulk-wrote ${context.tasks.length} tasks.`;
  }
};
