const { z } = require('zod');
const { Plugin, LIFECYCLE_EVENTS } = require('./base');

// Environment Actions
const ENVIRONMENT_ACTIONS = {
    SYNC: 'sync',
    CHECK: 'check',
    REPAIR: 'repair'
};

// Environment Plugin Interface Schema extends base plugin schema
const environmentPluginSchema = z.object({
    type: z.literal('environment'),
    capabilities: z.object({
        syncNodeVersion: z.boolean(),
        syncDependencies: z.boolean(),
        syncConfigs: z.boolean(),
        crossPlatform: z.boolean()
    })
});

// Environment Context Schema
const environmentContextSchema = z.object({
    action: z.enum(Object.values(ENVIRONMENT_ACTIONS)),
    projectPath: z.string(),
    requiredVersions: z.record(z.string()).optional(),
    configurations: z.record(z.unknown()).optional()
});

class EnvironmentPlugin extends Plugin {
    constructor(config) {
        // Validate environment-specific configuration
        environmentPluginSchema.parse(config);
        super(config);
        
        // Register default hooks
        this.registerHook(LIFECYCLE_EVENTS.PRE_EXECUTE, this.validateContext.bind(this));
    }

    async validateContext(context) {
        try {
            return environmentContextSchema.parse(context);
        } catch (error) {
            throw new Error(`Invalid environment context: ${error.message}`);
        }
    }

    async onExecute(context) {
        const { action } = context;

        switch (action) {
            case ENVIRONMENT_ACTIONS.SYNC:
                return this.syncEnvironment(context);
            case ENVIRONMENT_ACTIONS.CHECK:
                return this.validateEnvironment(context);
            case ENVIRONMENT_ACTIONS.REPAIR:
                return this.repairEnvironment(context);
            default:
                throw new Error(`Unsupported environment action: ${action}`);
        }
    }

    // Abstract methods to be implemented by concrete environment plugins
    async validateEnvironment(context) {
        throw new Error('validateEnvironment must be implemented by plugin');
    }

    async syncEnvironment(context) {
        throw new Error('syncEnvironment must be implemented by plugin');
    }

    async repairEnvironment(context) {
        throw new Error('repairEnvironment must be implemented by plugin');
    }

    // Helper methods for environment plugins
    validateDependencies(dependencies) {
        if (!dependencies || typeof dependencies !== 'object') {
            throw new Error('Dependencies must be an object');
        }
        
        Object.entries(dependencies).forEach(([name, version]) => {
            if (typeof version !== 'string') {
                throw new Error(`Invalid version for dependency ${name}`);
            }
        });
    }

    validateConfigurations(configs) {
        if (!configs || typeof configs !== 'object') {
            throw new Error('Configurations must be an object');
        }
    }
}

module.exports = {
    EnvironmentPlugin,
    environmentPluginSchema,
    ENVIRONMENT_ACTIONS
};
