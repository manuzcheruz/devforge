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
            const validatedTemplate = await pluginTemplateSchema.parseAsync(template);
            
            // Generate plugin code
            const pluginCode = this.generatePluginCode(validatedTemplate);
            const testCode = this.generateTestCode(validatedTemplate);
            const docs = this.generatePluginDocs(validatedTemplate);

            return {
                plugin: pluginCode,
                tests: testCode,
                documentation: docs
            };
        } catch (error) {
            logger.error(`Plugin creation failed: ${error.message}`);
            throw error;
        }
    }

    generatePluginCode(template) {
        return `
const { ${this.getBaseClass(template.type)} } = require('../interfaces/${template.type}');
const { LIFECYCLE_EVENTS } = require('../interfaces/base');
const { logger } = require('../../utils/logger');

class ${this.getClassName(template.name)} extends ${this.getBaseClass(template.type)} {
    constructor() {
        super({
            name: '${template.name}',
            version: '1.0.0',
            type: '${template.type}',
            capabilities: ${JSON.stringify(template.capabilities, null, 2)},
            hooks: [
                ${this.generateHooksCode(template.hooks)}
            ]
        });

        // Initialize plugin state
        this.setState('executionCount', 0);
    }

    ${this.generateCapabilityMethods(template)}
}

const plugin = new ${this.getClassName(template.name)}();

module.exports = {
    name: plugin.config.name,
    version: plugin.config.version,
    type: plugin.config.type,
    capabilities: plugin.config.capabilities,
    hooks: plugin.config.hooks,
    execute: context => plugin.execute(context),
    initialize: context => plugin.initialize(context),
    cleanup: () => plugin.cleanup()
};`;
    }

    generateTestCode(template) {
        return `
const { ${this.getClassName(template.name)} } = require('./${template.name}');
const { LIFECYCLE_EVENTS } = require('../interfaces/base');

describe('${this.getClassName(template.name)}', () => {
    let plugin;

    beforeEach(() => {
        plugin = new ${this.getClassName(template.name)}();
    });

    test('initializes correctly', async () => {
        await plugin.initialize();
        expect(plugin.isInitialized()).toBe(true);
    });

    test('executes with correct capabilities', async () => {
        const capabilities = plugin.getCapabilities();
        ${Object.entries(template.capabilities)
            .map(([cap, enabled]) => `
        expect(capabilities.${cap}).toBe(${enabled});`)
            .join('')}
    });

    ${this.generateCapabilityTests(template)}
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
        return hooks
            .map(hook => `{
                event: LIFECYCLE_EVENTS.${hook.event},
                handler: async (context) => {
                    logger.info(\`[${hook.event}] ${hook.description}\`);
                    // Implement hook logic here
                }
            }`)
            .join(',\n                ');
    }

    generateCapabilityMethods(template) {
        const methods = [];
        for (const [capability, enabled] of Object.entries(template.capabilities)) {
            if (enabled) {
                methods.push(`
    async ${this.camelCase(capability)}(context) {
        // Implement ${capability} capability
        return {
            success: true,
            details: {
                message: '${capability} executed successfully'
            }
        };
    }`);
            }
        }
        return methods.join('\n\n');
    }

    generateCapabilityTests(template) {
        return Object.entries(template.capabilities)
            .filter(([_, enabled]) => enabled)
            .map(([capability]) => `
    test('${capability} capability works correctly', async () => {
        const result = await plugin.${this.camelCase(capability)}({});
        expect(result.success).toBe(true);
        expect(result.details).toBeDefined();
    });`)
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

module.exports = new PluginSDK();
