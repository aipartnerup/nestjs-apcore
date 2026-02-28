import { Inject, Injectable } from '@nestjs/common';
import { Type } from '@sinclair/typebox';
import { ApModule, ApTool } from 'nestjs-apcore';
import { GeoService } from './geo.service.js';

/**
 * Weather service that depends on GeoService via NestJS DI.
 *
 * Demonstrates that @ApTool decorated services can use constructor
 * injection just like any other NestJS service — the DI container
 * resolves dependencies before the tool scanner registers tools.
 */
@ApModule({ namespace: 'weather', description: 'Weather queries (mock data)' })
@Injectable()
export class WeatherService {
  constructor(@Inject(GeoService) private readonly geo: GeoService) {}

  @ApTool({
    description: 'Get current weather for a city (mock data for demo)',
    inputSchema: Type.Object({
      city: Type.String({ description: 'City name, e.g. "Tokyo"' }),
    }),
    outputSchema: Type.Object({
      city: Type.String(),
      country: Type.String(),
      temperature: Type.Number({ description: 'Temperature in Celsius' }),
      condition: Type.String(),
      humidity: Type.Number({ description: 'Humidity percentage' }),
    }),
    annotations: { readonly: true, idempotent: true },
    tags: ['weather', 'query'],
  })
  current(inputs: Record<string, unknown>): Record<string, unknown> {
    const city = inputs.city as string;
    const location = this.geo.lookup(city);

    // Generate deterministic mock weather from city name
    const hash = [...city].reduce((h, c) => h + c.charCodeAt(0), 0);
    const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Snowy'];

    return {
      city: location.city,
      country: location.country,
      temperature: 10 + (hash % 25),
      condition: conditions[hash % conditions.length],
      humidity: 30 + (hash % 50),
    };
  }

  @ApTool({
    description: 'Get 3-day weather forecast for a city (mock data for demo)',
    inputSchema: Type.Object({
      city: Type.String({ description: 'City name' }),
    }),
    outputSchema: Type.Object({
      city: Type.String(),
      forecast: Type.Array(Type.Object({
        day: Type.String(),
        high: Type.Number(),
        low: Type.Number(),
        condition: Type.String(),
      })),
    }),
    annotations: { readonly: true, idempotent: true },
    tags: ['weather', 'query'],
  })
  forecast(inputs: Record<string, unknown>): Record<string, unknown> {
    const city = inputs.city as string;
    const location = this.geo.lookup(city);
    const hash = [...city].reduce((h, c) => h + c.charCodeAt(0), 0);
    const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Snowy'];
    const days = ['Today', 'Tomorrow', 'Day After'];

    return {
      city: location.city,
      forecast: days.map((day, i) => ({
        day,
        high: 12 + ((hash + i * 7) % 20),
        low: 2 + ((hash + i * 3) % 15),
        condition: conditions[(hash + i) % conditions.length],
      })),
    };
  }
}
