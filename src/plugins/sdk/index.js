const { z } = require('zod');
const fs = require('fs').promises;
const path = require('path');
const { Plugin } = require('../interfaces/base');
const { logger } = require('../../utils/logger');

// Plugin Template Schema
const pluginTemplateSchema = z.object({
    type: z.enum(['api', 'database', 'environment', 'security']),
    name: z.string().min(1),
    capabilities: z.record(z.boolean()),
    hooks: z.array(z.object({
        event: z.string(),
        description: z.string()
    })).optional()
});

class PluginSDK {
    constructor() {
        this.templates = new Map();
        this.developmentTools = new Map();
    }

    async createPlugin(template) {
        try {
            // Validate template structure
            const validatedTemplate = await pluginTemplateSchema.parseAsync(template);
            
            // Additional validation
            this.validateTemplateConsistency(validatedTemplate);
            
            // Generate plugin code and related files
            const pluginCode = this.generatePluginCode(validatedTemplate);
            const testCode = this.generateTestCode(validatedTemplate);
            const docs = this.generatePluginDocs(validatedTemplate);

            // Store template for future reference
            this.templates.set(validatedTemplate.name, {
                template: validatedTemplate,
                generatedAt: new Date().toISOString()
            });

            return {
                plugin: pluginCode,
                tests: testCode,
                documentation: docs,
                template: validatedTemplate
            };
        } catch (error) {
            logger.error(`Plugin creation failed: ${error.message}`);
            throw new Error(`Failed to create plugin: ${error.message}`);
        }
    }

    validateTemplateConsistency(template) {
        // Validate capabilities based on plugin type
        const requiredCapabilities = this.getRequiredCapabilities(template.type);
        
        // Check for missing capabilities
        const missingCapabilities = requiredCapabilities.filter(
            cap => template.capabilities[cap] === undefined
        );

        if (missingCapabilities.length > 0) {
            throw new Error(
                `Missing required capabilities for ${template.type} plugin: ${missingCapabilities.join(', ')}`
            );
        }

        // Validate capability values are boolean
        Object.entries(template.capabilities).forEach(([cap, value]) => {
            if (typeof value !== 'boolean') {
                throw new Error(
                    `Invalid capability value for "${cap}". Must be a boolean, received: ${typeof value}`
                );
            }
        });

        // Validate hooks if provided
        if (template.hooks) {
            template.hooks.forEach((hook, index) => {
                // Validate hook event
                if (!hook.event || typeof hook.event !== 'string') {
                    throw new Error(`Hook at index ${index} must have a valid event name`);
                }
                
                // Validate hook description
                if (!hook.description || typeof hook.description !== 'string') {
                    throw new Error(`Hook at index ${index} must have a valid description`);
                }

                // Validate event name is a valid lifecycle event
                const validEvents = ['PRE_EXECUTE', 'POST_EXECUTE', 'PRE_INIT', 'POST_INIT', 'PRE_CLEANUP', 'POST_CLEANUP'];
                if (!validEvents.includes(hook.event)) {
                    throw new Error(`Invalid hook event "${hook.event}" at index ${index}. Must be one of: ${validEvents.join(', ')}`);
                }
                
                // Ensure description is meaningful
                if (hook.description.length < 10) {
                    throw new Error(`Hook at index ${index} must have a meaningful description (at least 10 characters)`);
                }
            });
        }

        return true;
    }

    getRequiredCapabilities(type) {
        const capabilities = {
            api: ['design', 'mock', 'test', 'document', 'monitor'],
            database: ['migrations', 'seeding', 'backup', 'restore'],
            environment: ['syncNodeVersion', 'syncDependencies', 'syncConfigs', 'crossPlatform'],
            security: ['dependencyScan', 'codeScan', 'configScan', 'reportGeneration']
        };

        return capabilities[type] || [];
    }

    generatePluginCode(template) {
        // Validate and prepare template data
        const description = template.description || `A ${template.type} plugin for NodeForge`;
        const author = template.author || 'NodeForge';
        const className = this.getClassName(template.name);
        const baseClass = this.getBaseClass(template.type);
        
        // Format capabilities with proper indentation
        const capabilities = JSON.stringify(
            this.getRequiredCapabilities(template.type).reduce((acc, cap) => ({
                ...acc,
                [cap]: template.capabilities[cap] || false
            }), {}),
            null,
            2
        );
        
        // Generate hooks and capability methods
        const hooks = this.generateHooksCode(template.hooks);
        const capabilityMethods = this.generateCapabilityMethods(template);

        return `const { ${baseClass} } = require('../interfaces/${template.type}');
const { LIFECYCLE_EVENTS } = require('../interfaces/base');
const { logger } = require('../../utils/logger');

class ${className} extends ${baseClass} {
    constructor() {
        super({
            name: '${template.name}',
            version: '1.0.0',
            type: '${template.type}',
            description: '${description}',
            author: '${author}',
            capabilities: ${capabilities},
            hooks: [${hooks ? `\n                ${hooks}\n            ` : ''}]
        });

        // Initialize plugin state
        this.setState('executionCount', 0);
        this.setState('lastExecution', null);
    }

    async initialize(context = {}) {
        try {
            await super.initialize(context);
            logger.info(\`[${template.name}] Plugin initialized successfully\`);
            return true;
        } catch (error) {
            logger.error(\`[${template.name}] Initialization failed: \${error.message}\`);
            throw error;
        }
    }

${capabilityMethods}

    async cleanup() {
        try {
            await super.cleanup();
            logger.info(\`[${template.name}] Plugin cleaned up successfully\`);
            return true;
        } catch (error) {
            logger.error(\`[${template.name}] Cleanup failed: \${error.message}\`);
            throw error;
        }
    }
}

// Create plugin instance
const plugin = new ${className}();

// Export plugin interface
module.exports = {
    name: plugin.config.name,
    version: plugin.config.version,
    type: plugin.config.type,
    description: plugin.config.description,
    author: plugin.config.author,
    capabilities: plugin.config.capabilities,
    hooks: plugin.config.hooks,
    execute: context => plugin.execute(context),
    initialize: context => plugin.initialize(context),
    cleanup: () => plugin.cleanup()
};`;
    }

    generateTestCode(template) {
        const className = this.getClassName(template.name);
        return `
const { ${className} } = require('./${template.name}');
const { LIFECYCLE_EVENTS } = require('../interfaces/base');

describe('${className}', () => {
    let plugin;
    
    beforeEach(() => {
        plugin = new ${className}();
    });

    describe('Initialization', () => {
        test('initializes correctly', async () => {
            await expect(plugin.initialize()).resolves.toBe(true);
            expect(plugin.isInitialized()).toBe(true);
            expect(plugin.getState('executionCount')).toBe(0);
        });

        test('handles initialization errors gracefully', async () => {
            // Mock super.initialize to throw
            jest.spyOn(Object.getPrototypeOf(plugin), 'initialize')
                .mockRejectedValueOnce(new Error('Init error'));

            await expect(plugin.initialize())
                .rejects.toThrow('Init error');
        });
    });

    describe('Configuration', () => {
        test('has correct configuration', () => {
            expect(plugin.config).toMatchObject({
                name: '${template.name}',
                version: '1.0.0',
                type: '${template.type}'
            });
        });

        test('exposes correct capabilities', () => {
            const capabilities = plugin.getCapabilities();
            ${Object.entries(template.capabilities)
                .map(([cap, enabled]) => `
            expect(capabilities.${cap}).toBe(${enabled});`)
                .join('')}
        });
    });

    describe('Hook System', () => {
        ${template.hooks ? `
        test('registers hooks correctly', async () => {
            ${template.hooks.map(hook => `
            const ${hook.event.toLowerCase()}Handler = jest.fn();
            await plugin.registerHook(LIFECYCLE_EVENTS.${hook.event}, ${hook.event.toLowerCase()}Handler);
            await plugin.executeHooks(LIFECYCLE_EVENTS.${hook.event});
            expect(${hook.event.toLowerCase()}Handler).toHaveBeenCalled();`).join('\n')}
        });` : ''}

        test('handles invalid hook registration', async () => {
            await expect(plugin.registerHook('INVALID_EVENT', () => {}))
                .rejects.toThrow();
        });
    });

    describe('Capabilities', () => {
        ${this.generateCapabilityTests(template)}
    });

    describe('Cleanup', () => {
        test('performs cleanup correctly', async () => {
            await plugin.initialize();
            await plugin.cleanup();
            expect(plugin.isInitialized()).toBe(false);
        });

        test('handles cleanup errors gracefully', async () => {
            // Mock super.cleanup to throw
            jest.spyOn(Object.getPrototypeOf(plugin), 'cleanup')
                .mockRejectedValueOnce(new Error('Cleanup error'));

            await expect(plugin.cleanup())
                .rejects.toThrow('Cleanup error');
        });
    });
});`;
    }

    generatePluginDocs(template) {
        return `# ${this.getClassName(template.name)}

## Overview
A ${template.type} plugin for NodeForge that provides ${Object.keys(template.capabilities).join(', ')} capabilities.

## Installation
\`\`\`bash
npm install ${template.name}
\`\`\`

## Usage
\`\`\`javascript
const plugin = require('${template.name}');

// Initialize plugin
await plugin.initialize();

// Execute plugin
const result = await plugin.execute({
    // Add context specific to your needs
});
\`\`\`

## Capabilities
${Object.entries(template.capabilities)
    .map(([cap, enabled]) => `- ${cap}: ${enabled ? 'Enabled' : 'Disabled'}`)
    .join('\n')}

## Hooks
${template.hooks?.map(hook => `- ${hook.event}: ${hook.description}`).join('\n') || 'No hooks defined'}

## Development
1. Install dependencies
2. Run tests: \`npm test\`
3. Build: \`npm run build\`

## License
ISC
`;
    }

    getBaseClass(type) {
        const classes = {
            api: 'APIPlugin',
            database: 'DatabasePlugin',
            environment: 'EnvironmentPlugin',
            security: 'SecurityPlugin'
        };
        return classes[type];
    }

    getClassName(name) {
        return name
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('') + 'Plugin';
    }

    generateHooksCode(hooks = []) {
        if (!hooks || !Array.isArray(hooks) || hooks.length === 0) return '';
        
        return hooks
            .map(hook => {
                if (!hook.event || !hook.description) {
                    return ''; // Skip invalid hooks
                }
                
                const eventName = hook.event.toString().trim();
                const description = hook.description.toString()
                    .replace(/'/g, "\\'")
                    .replace(/\n/g, ' ');
                
                return `{
                event: LIFECYCLE_EVENTS.${eventName},
                description: '${description}',
                handler: async (context) => {
                    try {
                        logger.info(\`[${eventName}] ${description}\`);
                        // Implement hook logic here
                        return { success: true, context };
                    } catch (error) {
                        logger.error(\`[${eventName}] Hook execution failed: \${error.message}\`);
                        throw error;
                    }
                }
            }`;
            })
            .filter(Boolean) // Remove empty strings from invalid hooks
            .join(',\n                ');
    }

    generateCapabilityMethods(template) {
        if (!template || !template.capabilities) return '';

        const methods = [];
        for (const [capability, enabled] of Object.entries(template.capabilities)) {
            if (enabled) {
                const methodName = this.camelCase(capability);
                methods.push(`
    async ${methodName}(context = {}) {
        try {
            logger.info(\`[${capability}] Starting execution\`);
            
            // Update execution state
            const count = this.getState('executionCount') || 0;
            this.setState('executionCount', count + 1);
            this.setState('lastExecution', new Date().toISOString());
            
            // Execute capability logic
            // TODO: Implement specific ${capability} functionality
            
            logger.info(\`[${capability}] Execution completed\`);
            return {
                success: true,
                details: {
                    message: '${capability} executed successfully',
                    timestamp: new Date().toISOString(),
                    executionCount: count + 1
                }
            };
        } catch (error) {
            logger.error(\`[${capability}] Execution failed: \${error.message}\`);
            throw new Error(\`${capability} capability failed: \${error.message}\`);
        }
    }`);
            }
        }
        return methods.join('\n\n');
    }

    generateCapabilityTests(template) {
        if (!template || !template.capabilities) return '';

        return Object.entries(template.capabilities)
            .filter(([_, enabled]) => enabled)
            .map(([capability]) => {
                const methodName = this.camelCase(capability);
                return `
        test('${capability} capability works correctly', async () => {
            const result = await plugin.${methodName}({});
            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.details).toMatchObject({
                message: '${capability} executed successfully'
            });
            expect(result.details.timestamp).toBeDefined();
        });`;
            })
            .join('\n');
    }

    camelCase(str) {
        return str
            .split(/[-_]/)
            .map((word, index) => 
                index === 0 ? word.toLowerCase() : 
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            )
            .join('');
    }
}

// Export both the class and a default instance
module.exports = {
    PluginSDK,
    default: new PluginSDK()
};