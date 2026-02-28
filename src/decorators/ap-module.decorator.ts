import { AP_MODULE_METADATA_KEY } from '../constants.js';
import type { ApModuleOptions } from '../types.js';

export function ApModule(options: ApModuleOptions): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(AP_MODULE_METADATA_KEY, options, target);
  };
}
