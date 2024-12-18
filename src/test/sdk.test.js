const { PluginSDK, default: pluginSDK } = require('../plugins/sdk');
const path = require('path');

describe('Plugin SDK', () => {
    let sdk;
    const validApiTemplate = {
        type: 'api',
        name: 'test-api-plugin',
        capabilities: {
            design: true,
            mock: true,
            test: false,
            document: true,
            monitor: true
        },
        hooks: [
            {
                event: 'PRE_EXECUTE',
                description: 'Pre-execution validation'
            }
        ]
    };

    const validDatabaseTemplate = {
        type: 'database',
        name: 'test-db-plugin',
        capabilities: {
            migrations: true,
            seeding: true,
            backup: true,
            restore: true
        }
    };

    beforeEach(() => {
        sdk = new PluginSDK();
    });

    describe('Plugin Creation', () => {
        test('creates API plugin from valid template', async () => {
            const result = await sdk.createPlugin(validApiTemplate);
            expect(result).toBeDefined();
            expect(result.plugin).toContain('class TestApiPluginPlugin');
            expect(result.template).toEqual(validApiTemplate);
        });

        test('creates database plugin from valid template', async () => {
            const result = await sdk.createPlugin(validDatabaseTemplate);
            expect(result).toBeDefined();
            expect(result.plugin).toContain('class TestDbPluginPlugin');
            expect(result.template).toEqual(validDatabaseTemplate);
        });

        test('fails with invalid plugin type', async () => {
            const invalidTemplate = { ...validApiTemplate, type: 'invalid' };
            await expect(sdk.createPlugin(invalidTemplate)).rejects.toThrow();
        });

        test('fails with missing required capabilities', async () => {
            const invalidTemplate = {
                ...validApiTemplate,
                capabilities: { design: true } // Missing required capabilities
            };
            await expect(sdk.createPlugin(invalidTemplate)).rejects.toThrow(/Missing required capabilities/);
        });

        test('fails with invalid hook structure', async () => {
            const invalidTemplate = {
                ...validApiTemplate,
                hooks: [{ event: 'PRE_EXECUTE' }] // Missing description
            };
            await expect(sdk.createPlugin(invalidTemplate)).rejects.toThrow(/Hook must have both/);
        });
    });

    describe('Code Generation', () => {
        test('generates valid plugin code', async () => {
            const result = await sdk.createPlugin(validApiTemplate);
            expect(result.plugin).toContain('extends APIPlugin');
            expect(result.plugin).toContain('design: true');
            expect(result.plugin).toContain('mock: true');
        });

        test('generates test code with capability tests', async () => {
            const result = await sdk.createPlugin(validApiTemplate);
            expect(result.tests).toContain('test(\'design capability works correctly\'');
            expect(result.tests).toContain('test(\'mock capability works correctly\'');
            expect(result.tests).not.toContain('test(\'unusedCapability works correctly\'');
        });

        test('generates comprehensive documentation', async () => {
            const result = await sdk.createPlugin(validApiTemplate);
            expect(result.documentation).toContain('## Capabilities');
            expect(result.documentation).toContain('## Hooks');
            expect(result.documentation).toContain('## Usage');
        });
    });

    describe('Template Management', () => {
        test('stores created template', async () => {
            await sdk.createPlugin(validApiTemplate);
            const stored = sdk.templates.get(validApiTemplate.name);
            expect(stored).toBeDefined();
            expect(stored.template).toEqual(validApiTemplate);
            expect(stored.generatedAt).toBeDefined();
        });

        test('overwrites existing template', async () => {
            await sdk.createPlugin(validApiTemplate);
            const firstStored = sdk.templates.get(validApiTemplate.name);
            
            // Wait a bit to ensure different timestamp
            await new Promise(resolve => setTimeout(resolve, 100));
            
            await sdk.createPlugin(validApiTemplate);
            const secondStored = sdk.templates.get(validApiTemplate.name);
            
            expect(secondStored.generatedAt).not.toBe(firstStored.generatedAt);
        });
    });
});
