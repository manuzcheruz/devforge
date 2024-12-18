const { z } = require('zod');
const { Plugin, LIFECYCLE_EVENTS } = require('./base');

// API specific actions
const API_ACTIONS = {
    DESIGN: 'design',
    MOCK: 'mock',
    TEST: 'test',
    DOCUMENT: 'document',
    MONITOR: 'monitor'
};

// API Plugin Interface Schema extends base plugin schema
const apiPluginSchema = z.object({
    type: z.literal('api'),
    capabilities: z.object({
        design: z.boolean(),
        mock: z.boolean(),
        test: z.boolean(),
        document: z.boolean(),
        monitor: z.boolean()
    })
});

// API Context Schema
const apiContextSchema = z.object({
    action: z.enum(Object.values(API_ACTIONS)),
    projectPath: z.string(),
    apiSpec: z.unknown().optional(),
    endpoints: z.array(z.unknown()).optional(),
    testConfig: z.unknown().optional()
});

class APIPlugin extends Plugin {
    constructor(config) {
        // Validate API-specific configuration
        apiPluginSchema.parse(config);
        super(config);
        
        // Register default hooks
        this.registerHook(LIFECYCLE_EVENTS.PRE_EXECUTE, this.validateContext.bind(this));
    }

    async validateContext(context) {
        try {
            return apiContextSchema.parse(context);
        } catch (error) {
            throw new Error(`Invalid API context: ${error.message}`);
        }
    }

    async onExecute(context) {
        const { action } = context;

        switch (action) {
            case API_ACTIONS.DESIGN:
                return this.designAPI(context);
            case API_ACTIONS.MOCK:
                return this.generateMock(context);
            case API_ACTIONS.TEST:
                return this.runTests(context);
            case API_ACTIONS.DOCUMENT:
                return this.generateDocs(context);
            case API_ACTIONS.MONITOR:
                return this.monitorPerformance(context);
            default:
                throw new Error(`Unsupported API action: ${action}`);
        }
    }

    // Abstract methods to be implemented by concrete API plugins
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

    // Helper methods for API plugins
    validateEndpoint(endpoint) {
        // Common endpoint validation logic
        if (!endpoint.path || !endpoint.method) {
            throw new Error('Endpoint must have path and method');
        }
    }

    validateAPISpec(spec) {
        // Common OpenAPI spec validation logic
        if (!spec.openapi && !spec.swagger) {
            throw new Error('Invalid OpenAPI specification');
        }
    }
}

module.exports = {
    APIPlugin,
    apiPluginSchema,
    API_ACTIONS
};
