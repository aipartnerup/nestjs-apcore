import { AP_CONTEXT_METADATA_KEY } from '../constants.js';

export function ApContext(): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey !== undefined) {
      Reflect.defineMetadata(AP_CONTEXT_METADATA_KEY, parameterIndex, target, propertyKey);
    }
  };
}
