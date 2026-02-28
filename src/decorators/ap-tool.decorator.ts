import { AP_TOOL_METADATA_KEY } from '../constants.js';
import type { ApToolOptions } from '../types.js';

export function ApTool(options: ApToolOptions): MethodDecorator {
  return (target, propertyKey, _descriptor) => {
    Reflect.defineMetadata(AP_TOOL_METADATA_KEY, options, target, propertyKey);
  };
}
