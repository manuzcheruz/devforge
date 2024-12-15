/**
 * Base interface for NodeForge plugins
 */
const { z } = require('zod');

// Plugin metadata schema
const PluginMetadataSchema = z.object({
    name: z.string(),
    version: z.string(),
    description: z.string(),
    author: z.string().optional(),
    homepage: z.string().url().optional(),
    repository: z.string().url().optional(),
    category: z.enum(['environment', 'api', 'microservices', 'performance', 'security', 'database']),
    capabilities: z.record(z.boolean()).optional(),
});

// Plugin configuration schema
const PluginConfigSchema = z.object({
    enabled: z.boolean().default(true),
    options: z.record(z.any()).optional(),
});

/**
 * Base Plugin Interface
 */
class BasePlugin {
    constructor(metadata, config = {}) {
        this.metadata = PluginMetadataSchema.parse(metadata);
        this.config = PluginConfigSchema.parse(config);
    }

    /**
     * Plugin initialization hook
     * @param {Object} context - Plugin context
     */
    async initialize(context) {
        throw new Error('Method initialize() must be implemented');
    }

    /**
     * Plugin execution hook
     * @param {Object} context - Plugin context
     */
    async execute(context) {
        throw new Error('Method execute() must be implemented');
    }

    /**
     * Plugin cleanup hook
     * @param {Object} context - Plugin context
     */
    async cleanup(context) {
        // Optional cleanup
    }

    /**
     * Plugin validation hook
     * @returns {boolean} - Validation result
     */
    validate() {
        return true;
    }
}

module.exports = {
    BasePlugin,
    PluginMetadataSchema,
    PluginConfigSchema
};
