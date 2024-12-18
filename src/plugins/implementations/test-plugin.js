const { APIPlugin } = require('../interfaces/api');
const { LIFECYCLE_EVENTS } = require('../interfaces/base');
const { logger } = require('../../utils/logger');

class TestPlugin extends APIPlugin {
    constructor() {
        super({
            name: 'core-test-plugin',
            version: '1.0.0',
            type: 'api',
            description: 'Test plugin for NodeForge',
            author: 'NodeForge',
            capabilities: {
                design: true,
                mock: true,
                test: true,
                document: true,
                monitor: true
            },
            hooks: [
                {
                    event: LIFECYCLE_EVENTS.PRE_EXECUTE,
                    handler: async (context) => {
                        logger.info(`[TestPlugin] Pre-execute hook triggered with context:`, context);
                    }
                },
                {
                    event: LIFECYCLE_EVENTS.POST_EXECUTE,
                    handler: async (context) => {
                        logger.info(`[TestPlugin] Post-execute hook triggered with context:`, context);
                    }
                }
            ]
        });

        // Initialize plugin state
        this.setState('executionCount', 0);
    }

    async designAPI(context) {
        const count = this.getState('executionCount') || 0;
        this.setState('executionCount', count + 1);
        
        return {
            success: true,
            details: {
                message: 'Test API design executed successfully',
                executionCount: count + 1,
                apiSpec: context.apiSpec
            }
        };
    }

    async generateMock(context) {
        return {
            success: true,
            details: {
                message: 'Mock generation not implemented in test plugin'
            }
        };
    }

    async runTests(context) {
        return {
            success: true,
            details: {
                message: 'Test execution not implemented in test plugin'
            }
        };
    }

    async generateDocs(context) {
        return {
            success: true,
            details: {
                message: 'Documentation generation not implemented in test plugin'
            }
        };
    }

    async monitorPerformance(context) {
        return {
            success: true,
            details: {
                message: 'Performance monitoring not implemented in test plugin'
            }
        };
    }
}

const testPlugin = new TestPlugin();

// Export plugin instance directly to preserve method bindings
module.exports = {
    name: testPlugin.config.name,
    version: testPlugin.config.version,
    type: testPlugin.config.type,
    description: testPlugin.config.description,
    author: testPlugin.config.author,
    capabilities: testPlugin.config.capabilities,
    hooks: testPlugin.config.hooks,
    execute: context => testPlugin.execute(context),
    initialize: context => testPlugin.initialize(context),
    cleanup: () => testPlugin.cleanup()
};
