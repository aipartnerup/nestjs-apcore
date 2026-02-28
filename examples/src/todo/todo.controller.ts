import { Controller, Get, Post, Delete, Param, Body, Inject } from '@nestjs/common';
import { TodoService } from './todo.service.js';

/**
 * REST controller for the same TodoService that powers the MCP tools.
 *
 * Demonstrates that one NestJS service can simultaneously serve:
 *   - REST API   → GET /todos, POST /todos, DELETE /todos/:id
 *   - MCP tools  → todo.list, todo.add, todo.complete, todo.remove
 */
@Controller('todos')
export class TodoController {
  constructor(
    @Inject(TodoService) private readonly todoService: TodoService,
  ) {}

  @Get()
  list() {
    return this.todoService.getAll();
  }

  @Post()
  add(@Body() body: { title: string }) {
    return this.todoService.add({ title: body.title });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.todoService.remove({ id: Number(id) });
  }
}
