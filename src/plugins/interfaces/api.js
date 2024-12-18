const { z } = require('zod');
const { Plugin, LIFECYCLE_EVENTS } = require('./base');

// API specific actions and versions
const API_ACTIONS = {
    DESIGN: 'design',
    MOCK: 'mock',
    TEST: 'test',
    DOCUMENT: 'document',
    MONITOR: 'monitor',
    VALIDATE: 'validate',
    VERSION: 'version'
};

const API_VERSIONS = {
    V1: 'v1',
    V2: 'v2',
    V3: 'v3'
};

// API Plugin Interface Schema extends base plugin schema
const apiPluginSchema = z.object({
    type: z.literal('api'),
    capabilities: z.object({
        design: z.boolean(),
        mock: z.boolean(),
        test: z.boolean(),
        document: z.boolean(),
        monitor: z.boolean(),
        validation: z.boolean().optional(),
        versioning: z.boolean().optional()
    }),
    supportedVersions: z.array(z.enum(Object.values(API_VERSIONS))).optional(),
    defaultVersion: z.enum(Object.values(API_VERSIONS)).optional()
});

// API Context Schema with enhanced validation
const apiContextSchema = z.object({
    action: z.enum(Object.values(API_ACTIONS)),
    projectPath: z.string(),
    version: z.enum(Object.values(API_VERSIONS)).optional(),
    apiSpec: z.object({
        openapi: z.string(),
        info: z.object({
            title: z.string(),
            version: z.string(),
            description: z.string().optional()
        }),
        paths: z.record(z.any())
    }).optional(),
    endpoints: z.array(z.object({
        path: z.string(),
        method: z.string(),
        parameters: z.array(z.any()).optional(),
        responses: z.record(z.any()).optional()
    })).optional(),
    testConfig: z.object({
        environment: z.enum(['development', 'testing', 'production']).optional(),
        timeout: z.number().optional(),
        retries: z.number().optional(),
        parallel: z.boolean().optional()
    }).optional(),
    documentation: z.object({
        format: z.enum(['markdown', 'html', 'pdf']).optional(),
        output: z.string().optional(),
        includeExamples: z.boolean().optional()
    }).optional()
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
        const endpointSchema = z.object({
            path: z.string().min(1),
            method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']),
            parameters: z.array(z.object({
                name: z.string(),
                in: z.enum(['query', 'path', 'header', 'cookie']),
                required: z.boolean().optional(),
                schema: z.any()
            })).optional(),
            responses: z.record(z.any()).optional(),
            security: z.array(z.record(z.array(z.string()))).optional(),
            tags: z.array(z.string()).optional()
        });

        try {
            return endpointSchema.parse(endpoint);
        } catch (error) {
            throw new Error(`Invalid endpoint configuration: ${error.message}`);
        }
    }

    validateAPISpec(spec) {
        const openAPISchema = z.object({
            openapi: z.string().regex(/^3\.\d+\.\d+$/),
            info: z.object({
                title: z.string(),
                version: z.string(),
                description: z.string().optional()
            }),
            servers: z.array(z.object({
                url: z.string(),
                description: z.string().optional()
            })).optional(),
            paths: z.record(z.any()),
            components: z.object({
                schemas: z.record(z.any()).optional(),
                securitySchemes: z.record(z.any()).optional()
            }).optional()
        });

        try {
            return openAPISchema.parse(spec);
        } catch (error) {
            throw new Error(`Invalid OpenAPI specification: ${error.message}`);
        }
    }

    validateVersion(version) {
        if (!Object.values(API_VERSIONS).includes(version)) {
            throw new Error(`Invalid API version: ${version}. Supported versions: ${Object.values(API_VERSIONS).join(', ')}`);
        }
        return true;
    }

    // Utility method for API path normalization
    normalizeAPIPath(path) {
        return path
            .replace(/\/+/g, '/') // Replace multiple slashes with single slash
            .replace(/\/$/, '') // Remove trailing slash
            .replace(/^([^\/])/, '/$1'); // Ensure leading slash
    }

    // Utility method for generating OpenAPI path parameters
    generatePathParameters(path) {
        const params = path.match(/\{([^}]+)\}/g) || [];
        return params.map(param => ({
            name: param.replace(/[{}]/g, ''),
            in: 'path',
            required: true,
            schema: { type: 'string' }
        }));
    }
}

module.exports = {
    APIPlugin,
    apiPluginSchema,
    API_ACTIONS
};
