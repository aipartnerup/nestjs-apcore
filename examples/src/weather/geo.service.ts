import { Injectable } from '@nestjs/common';

interface Location {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

const CITIES: Record<string, Location> = {
  tokyo: { city: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69 },
  london: { city: 'London', country: 'United Kingdom', lat: 51.51, lon: -0.13 },
  'new york': { city: 'New York', country: 'United States', lat: 40.71, lon: -74.01 },
  paris: { city: 'Paris', country: 'France', lat: 48.86, lon: 2.35 },
  beijing: { city: 'Beijing', country: 'China', lat: 39.91, lon: 116.40 },
  sydney: { city: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21 },
};

/**
 * Geo lookup service — a regular NestJS @Injectable with no apcore awareness.
 * Injected into WeatherService via standard NestJS DI.
 */
@Injectable()
export class GeoService {
  lookup(city: string): Location {
    const key = city.toLowerCase();
    return CITIES[key] ?? { city, country: 'Unknown', lat: 0, lon: 0 };
  }
}
