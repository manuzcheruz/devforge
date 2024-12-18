const { PluginCore } = require('../plugins/sdk/core');

describe('Plugin Core', () => {
    let core;
    const validPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        type: 'api',
        description: 'Test plugin for core functionality',
        capabilities: {
            test: true
        }
    };

    beforeEach(() => {
        core = new PluginCore();
    });

    describe('Plugin Registration', () => {
        test('registers valid plugin successfully', async () => {
            const plugin = await core.registerPlugin(validPlugin);
            expect(plugin).toBeDefined();
            expect(plugin.config.name).toBe('test-plugin');
        });

        test('fails with invalid plugin config', async () => {
            const invalidPlugin = { ...validPlugin, version: 'invalid' };
            await expect(core.registerPlugin(invalidPlugin))
                .rejects.toThrow();
        });

        test('prevents duplicate plugin registration', async () => {
            await core.registerPlugin(validPlugin);
            await expect(core.registerPlugin(validPlugin))
                .rejects.toThrow(/already registered/);
        });
    });

    describe('Hook System', () => {
        test('registers and executes hooks', async () => {
            const plugin = await core.registerPlugin(validPlugin);
            const mockHandler = jest.fn();
            
            await core.registerHook('test-plugin', 'TEST_EVENT', mockHandler);
            await core.executeHooks('TEST_EVENT', { test: true });
            
            expect(mockHandler).toHaveBeenCalledWith({ test: true });
        });

        test('handles hook execution errors', async () => {
            await core.registerPlugin(validPlugin);
            const errorHandler = () => { throw new Error('Test error'); };
            
            await core.registerHook('test-plugin', 'ERROR_EVENT', errorHandler);
            const results = await core.executeHooks('ERROR_EVENT');
            
            expect(results[0].success).toBe(false);
            expect(results[0].error).toBe('Test error');
        });
    });

    describe('State Management', () => {
        test('manages plugin state correctly', async () => {
            await core.registerPlugin(validPlugin);
            
            core.setPluginState('test-plugin', 'testKey', 'testValue');
            const value = core.getPluginState('test-plugin', 'testKey');
            
            expect(value).toBe('testValue');
        });

        test('throws error for invalid plugin state access', () => {
            expect(() => core.getPluginState('invalid-plugin', 'key'))
                .toThrow(/not found/);
        });
    });
});
