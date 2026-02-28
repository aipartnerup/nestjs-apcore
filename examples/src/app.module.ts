import { Module } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import {
  ApcoreModule,
  ApcoreMcpModule,
  ApcoreRegistryService,
  ApToolScannerService,
} from 'nestjs-apcore';
import { TodoModule } from './todo/todo.module.js';
import { WeatherModule } from './weather/weather.module.js';

/**
 * Root application module.
 *
 * Demonstrates how nestjs-apcore turns standard NestJS services into
 * AI-perceivable MCP tools — no changes needed to your business logic.
 *
 * - TodoService: CRUD with @ApTool decorators + REST controller (dual-protocol)
 * - WeatherService: @ApTool with NestJS DI (injects GeoService)
 * - ApToolScannerService: auto-discovers all @ApTool decorated methods
 */
@Module({
  imports: [
    ApcoreModule.forRoot({}),

    ApcoreMcpModule.forRoot({
      transport: 'streamable-http',
      host: '0.0.0.0',
      port: 8000,
      explorer: true,
      allowExecute: true,
      name: 'nestjs-apcore-demo',
      version: '1.0.0',
    }),

    TodoModule,
    WeatherModule,
  ],
  providers: [
    // NOTE: useFactory needed only with file: link (development).
    // With a published npm package, just use: ApToolScannerService
    {
      provide: ApToolScannerService,
      useFactory: (
        registry: ApcoreRegistryService,
        modulesContainer: ModulesContainer,
      ) => new ApToolScannerService(registry, modulesContainer),
      inject: [ApcoreRegistryService, ModulesContainer],
    },
  ],
})
export class AppModule {}
