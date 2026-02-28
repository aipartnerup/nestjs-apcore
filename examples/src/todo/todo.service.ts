import { Injectable } from '@nestjs/common';
import { Type } from '@sinclair/typebox';
import { ApModule, ApTool } from 'nestjs-apcore';

interface Todo {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
}

/**
 * A stateful NestJS service exposed as MCP tools via @ApTool decorators.
 *
 * This is the same service injected into TodoController for REST endpoints,
 * demonstrating that one NestJS service can serve both REST and AI interfaces.
 */
@ApModule({ namespace: 'todo', description: 'Todo list management' })
@Injectable()
export class TodoService {
  private todos: Todo[] = [
    { id: 1, title: 'Try the nestjs-apcore demo', done: false, createdAt: new Date().toISOString() },
    { id: 2, title: 'Read the nestjs-apcore README', done: false, createdAt: new Date().toISOString() },
  ];
  private nextId = 3;

  @ApTool({
    description: 'List all todos, optionally filtered by completion status',
    inputSchema: Type.Object({
      done: Type.Optional(Type.Boolean({ description: 'Filter: true=completed, false=pending, omit=all' })),
    }),
    outputSchema: Type.Object({
      todos: Type.Array(Type.Object({
        id: Type.Number(),
        title: Type.String(),
        done: Type.Boolean(),
        createdAt: Type.String(),
      })),
      count: Type.Number({ description: 'Number of todos returned' }),
    }),
    annotations: { readonly: true, idempotent: true },
    tags: ['todo', 'query'],
  })
  list(inputs: Record<string, unknown>): Record<string, unknown> {
    let result = this.todos;
    if (inputs.done !== undefined) {
      result = result.filter((t) => t.done === inputs.done);
    }
    return { todos: result, count: result.length };
  }

  @ApTool({
    description: 'Add a new todo item',
    inputSchema: Type.Object({
      title: Type.String({ description: 'What needs to be done' }),
    }),
    outputSchema: Type.Object({
      todo: Type.Object({
        id: Type.Number(),
        title: Type.String(),
        done: Type.Boolean(),
        createdAt: Type.String(),
      }),
    }),
    annotations: { readonly: false, destructive: false },
    tags: ['todo', 'mutate'],
  })
  add(inputs: Record<string, unknown>): Record<string, unknown> {
    const todo: Todo = {
      id: this.nextId++,
      title: inputs.title as string,
      done: false,
      createdAt: new Date().toISOString(),
    };
    this.todos.push(todo);
    return { todo };
  }

  @ApTool({
    description: 'Mark a todo as completed',
    inputSchema: Type.Object({
      id: Type.Number({ description: 'Todo ID to complete' }),
    }),
    outputSchema: Type.Object({
      todo: Type.Object({
        id: Type.Number(),
        title: Type.String(),
        done: Type.Boolean(),
        createdAt: Type.String(),
      }),
    }),
    annotations: { readonly: false, idempotent: true },
    tags: ['todo', 'mutate'],
  })
  complete(inputs: Record<string, unknown>): Record<string, unknown> {
    const todo = this.todos.find((t) => t.id === inputs.id);
    if (!todo) {
      throw new Error(`Todo #${inputs.id} not found`);
    }
    todo.done = true;
    return { todo };
  }

  @ApTool({
    description: 'Delete a todo item',
    inputSchema: Type.Object({
      id: Type.Number({ description: 'Todo ID to delete' }),
    }),
    outputSchema: Type.Object({
      deleted: Type.Boolean(),
      id: Type.Number(),
    }),
    annotations: { readonly: false, destructive: true },
    tags: ['todo', 'mutate'],
  })
  remove(inputs: Record<string, unknown>): Record<string, unknown> {
    const idx = this.todos.findIndex((t) => t.id === inputs.id);
    if (idx === -1) {
      throw new Error(`Todo #${inputs.id} not found`);
    }
    this.todos.splice(idx, 1);
    return { deleted: true, id: inputs.id as number };
  }

  /** Used by TodoController for REST API (not an MCP tool) */
  getAll(): Todo[] {
    return this.todos;
  }
}
