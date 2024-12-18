const pluginSDK = require('../plugins/sdk');
const { PluginSDK } = require('../plugins/sdk');
const path = require('path');

describe('Plugin SDK', () => {
    let sdk;
    const testTemplate = {
        type: 'api',
        name: 'test-api-plugin',
        capabilities: {
            design: true,
            mock: true,
            test: false
        },
        hooks: [
            {
                event: 'PRE_EXECUTE',
                description: 'Pre-execution validation'
            }
        ]
    };

    beforeEach(() => {
        sdk = new PluginSDK();
    });

    test('creates plugin from template', async () => {
        const result = await sdk.createPlugin(testTemplate);
        expect(result).toBeDefined();
        expect(result.plugin).toContain('class TestApiPluginPlugin');
        expect(result.tests).toContain('describe(\'TestApiPluginPlugin\'');
        expect(result.documentation).toContain('# TestApiPluginPlugin');
    });

    test('generates valid plugin code', async () => {
        const result = await sdk.createPlugin(testTemplate);
        expect(result.plugin).toContain('extends APIPlugin');
        expect(result.plugin).toContain('design: true');
        expect(result.plugin).toContain('mock: true');
        expect(result.plugin).toContain('test: false');
    });

    test('generates test code with capability tests', async () => {
        const result = await sdk.createPlugin(testTemplate);
        expect(result.tests).toContain('test(\'design capability works correctly\'');
        expect(result.tests).toContain('test(\'mock capability works correctly\'');
        expect(result.tests).not.toContain('test(\'test capability works correctly\'');
    });

    test('generates comprehensive documentation', async () => {
        const result = await sdk.createPlugin(testTemplate);
        expect(result.documentation).toContain('## Capabilities');
        expect(result.documentation).toContain('## Hooks');
        expect(result.documentation).toContain('## Usage');
    });
});
