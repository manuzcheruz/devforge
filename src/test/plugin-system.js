const { PluginManager } = require('../plugins/manager');
const testPlugin = require('../plugins/implementations/test-plugin');
const securityScanner = require('../plugins/implementations/security-scanner');
const { logger } = require('../utils/logger');

async function testPluginSystem() {
    try {
        logger.info('Starting plugin system test...');
        
        // Initialize plugin manager
        const manager = new PluginManager();
        
        // Test API Plugin
        logger.info('Testing API Plugin...');
        await manager.register('api', testPlugin);
        
        const apiResults = await manager.applyPlugins('api', { 
            action: 'design',
            projectPath: process.cwd(),
            apiSpec: {
                openapi: '3.0.0',
                info: {
                    title: 'Test API',
                    version: '1.0.0'
                },
                paths: {}
            }
        });
        
        logger.info('API Plugin results:', apiResults);

        // Test Security Scanner Plugin
        logger.info('Testing Security Scanner Plugin...');
        await manager.register('security', securityScanner);
        
        const securityResults = await manager.applyPlugins('security', {
            action: 'scan',
            scanType: 'all',
            projectPath: process.cwd()
        });
        
        logger.info('Security Scanner results:', securityResults);
        
        return {
            apiPlugin: apiResults,
            securityScanner: securityResults
        };
    } catch (error) {
        logger.error('Plugin system test failed:', error);
        throw error;
    }
}

// Run the test
testPluginSystem().catch(console.error);
