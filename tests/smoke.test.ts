import {
  APCORE_MODULE_OPTIONS,
  APCORE_MCP_MODULE_OPTIONS,
  AP_TOOL_METADATA_KEY,
  AP_MODULE_METADATA_KEY,
  AP_CONTEXT_METADATA_KEY,
} from '../src/constants.js';

describe('constants', () => {
  it('exports APCORE_MODULE_OPTIONS', () => {
    expect(APCORE_MODULE_OPTIONS).toBe('APCORE_MODULE_OPTIONS');
  });

  it('exports APCORE_MCP_MODULE_OPTIONS', () => {
    expect(APCORE_MCP_MODULE_OPTIONS).toBe('APCORE_MCP_MODULE_OPTIONS');
  });

  it('exports AP_TOOL_METADATA_KEY', () => {
    expect(AP_TOOL_METADATA_KEY).toBe('apcore:tool');
  });

  it('exports AP_MODULE_METADATA_KEY', () => {
    expect(AP_MODULE_METADATA_KEY).toBe('apcore:module');
  });

  it('exports AP_CONTEXT_METADATA_KEY', () => {
    expect(AP_CONTEXT_METADATA_KEY).toBe('apcore:context');
  });
});
