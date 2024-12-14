const { z } = require('zod');

// API Plugin Interface Schema
const apiPluginSchema = z.object({
    name: z.string(),
    version: z.string(),
    type: z.enum(['api']),
    capabilities: z.object({
        design: z.boolean(),
        mock: z.boolean(),
        test: z.boolean(),
        document: z.boolean(),
        monitor: z.boolean()
    }),
    execute: z.function()
        .args(z.object({
            action: z.enum(['design', 'mock', 'test', 'document', 'monitor']),
            context: z.object({
                projectPath: z.string(),
                apiSpec: z.unknown().optional(),
                endpoints: z.array(z.unknown()).optional(),
                testConfig: z.unknown().optional()
            }).optional()
        }))
        .returns(z.promise(z.object({
            success: z.boolean(),
            details: z.object({
                endpoints: z.array(z.unknown()).optional(),
                coverage: z.number().optional(),
                documentation: z.unknown().optional(),
                metrics: z.record(z.unknown()).optional(),
                issues: z.array(z.string()).optional()
            })
        })))
});

class APIPlugin {
    constructor(config) {
        this.config = apiPluginSchema.parse(config);
    }

    async designAPI(context) {
        throw new Error('designAPI must be implemented by plugin');
    }

    async generateMock(context) {
        throw new Error('generateMock must be implemented by plugin');
    }

    async runTests(context) {
        throw new Error('runTests must be implemented by plugin');
    }

    async generateDocs(context) {
        throw new Error('generateDocs must be implemented by plugin');
    }

    async monitorPerformance(context) {
        throw new Error('monitorPerformance must be implemented by plugin');
    }
}

module.exports = {
    APIPlugin,
    apiPluginSchema
};
