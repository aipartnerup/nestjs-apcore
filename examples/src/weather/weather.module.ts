import { Module } from '@nestjs/common';
import { GeoService } from './geo.service.js';
import { WeatherService } from './weather.service.js';

@Module({
  providers: [GeoService, WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
