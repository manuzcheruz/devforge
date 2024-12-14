const { z } = require('zod');

// Environment Plugin Interface Schema
const environmentPluginSchema = z.object({
    name: z.string(),
    version: z.string(),
    type: z.enum(['environment']),
    capabilities: z.object({
        syncNodeVersion: z.boolean(),
        syncDependencies: z.boolean(),
        syncConfigs: z.boolean(),
        crossPlatform: z.boolean()
    }),
    execute: z.function()
        .args(z.object({
            action: z.enum(['sync', 'check', 'repair']),
            context: z.object({
                projectPath: z.string(),
                requiredVersions: z.record(z.string()),
                configurations: z.record(z.unknown())
            }).optional()
        }))
        .returns(z.promise(z.object({
            success: z.boolean(),
            details: z.object({
                nodeVersion: z.string().optional(),
                npmVersion: z.string().optional(),
                syncedConfigs: z.array(z.string()).optional(),
                issues: z.array(z.string()).optional()
            })
        })))
});

class EnvironmentPlugin {
    constructor(config) {
        this.config = environmentPluginSchema.parse(config);
    }

    async validateEnvironment(context) {
        throw new Error('validateEnvironment must be implemented by plugin');
    }

    async syncEnvironment(context) {
        throw new Error('syncEnvironment must be implemented by plugin');
    }

    async repairEnvironment(context) {
        throw new Error('repairEnvironment must be implemented by plugin');
    }
}

module.exports = {
    EnvironmentPlugin,
    environmentPluginSchema
};
