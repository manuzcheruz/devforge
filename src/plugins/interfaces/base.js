const { z } = require('zod');

// Plugin Lifecycle Events
const LIFECYCLE_EVENTS = {
    PRE_INIT: 'preInit',
    POST_INIT: 'postInit',
    PRE_EXECUTE: 'preExecute',
    POST_EXECUTE: 'postExecute',
    ERROR: 'error',
    CLEANUP: 'cleanup'
};

// Base Plugin Configuration Schema
const basePluginSchema = z.object({
    name: z.string().min(1).refine(val => /^[a-z0-9-]+$/.test(val), {
        message: "Plugin name must contain only lowercase letters, numbers, and hyphens"
    }),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, {
        message: "Version must follow semantic versioning (e.g., 1.0.0)"
    }),
    type: z.string().refine(val => ['api', 'database', 'environment', 'security'].includes(val), {
        message: "Invalid plugin type. Must be one of: api, database, environment, security"
    }),
    description: z.string().min(10).optional(),
    author: z.string().min(1).optional(),
    dependencies: z.array(z.object({
        name: z.string(),
        version: z.string().regex(/^(\d+\.\d+\.\d+|>=?\d+\.\d+\.\d+|<=?\d+\.\d+\.\d+|\^?\d+\.\d+\.\d+|\~\d+\.\d+\.\d+)$/, {
            message: "Invalid version format. Use semantic versioning with optional ^, ~, >, <, >= or <= prefix"
        })
    })).optional(),
    capabilities: z.record(z.boolean()),
    hooks: z.array(z.object({
        event: z.enum(Object.values(LIFECYCLE_EVENTS)),
        handler: z.function(),
        priority: z.number().min(0).max(100).default(50),
        description: z.string().optional()
    })).optional(),
    config: z.record(z.unknown()).optional(),
    metadata: z.object({
        repository: z.string().url().optional(),
        homepage: z.string().url().optional(),
        keywords: z.array(z.string()).optional(),
        license: z.string().optional()
    }).optional()
});

class Plugin {
    constructor(config) {
        this.validateConfig(config);
        this.config = config;
        this.state = new Map();
        this.initialized = false;
        this.eventEmitter = new PluginEventEmitter();
        
        // Register event subscriptions if provided
        if (config.subscriptions) {
            for (const subscription of config.subscriptions) {
                this.eventEmitter.on(subscription.event, async (payload) => {
                    try {
                        await subscription.handler.call(this, payload);
                    } catch (error) {
                        await this.eventEmitter.emitAsync(LIFECYCLE_EVENTS.ERROR, {
                            error,
                            event: subscription.event,
                            context: payload
                        });
                    }
                });
            }
        }

        // Initialize plugin metrics
        this.setState('metrics', {
            eventExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            lastExecution: null
        });
    }

    validateConfig(config) {
        try {
            basePluginSchema.parse(config);
        } catch (error) {
            throw new Error(`Invalid plugin configuration: ${error.message}`);
        }
    }

    async registerHook(event, handler, options = {}) {
        try {
            if (!Object.values(LIFECYCLE_EVENTS).includes(event)) {
                throw await this.createError(
                    `Invalid hook event: ${event}`,
                    'INVALID_HOOK_EVENT'
                );
            }

            if (typeof handler !== 'function') {
                throw await this.createError(
                    'Hook handler must be a function',
                    'INVALID_HOOK_HANDLER'
                );
            }

            const hookConfig = {
                handler,
                priority: options.priority || 50,
                id: `${this.config.name}:${event}:${Date.now()}`,
                description: options.description,
                async execute(context) {
                    try {
                        return await handler(context);
                    } catch (error) {
                        throw await this.createError(
                            `Hook execution failed: ${error.message}`,
                            'HOOK_EXECUTION_ERROR',
                            { originalError: error }
                        );
                    }
                }
            };

            if (!this.hooks.has(event)) {
                this.hooks.set(event, []);
            }

            this.hooks.get(event).push(hookConfig);
            
            // Sort hooks by priority
            this.hooks.get(event).sort((a, b) => a.priority - b.priority);

            return hookConfig.id;
        } catch (error) {
            await this.trackError(error);
            throw error;
        }
    }

    removeHook(event, hookId) {
        if (this.hooks.has(event)) {
            const hooks = this.hooks.get(event);
            const index = hooks.findIndex(hook => hook.id === hookId);
            if (index !== -1) {
                hooks.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    async executeHooks(event, context = {}) {
        if (!this.hooks.has(event)) return;

        const handlers = this.getHooksByEvent(event);
        const results = [];
        let hasErrors = false;

        for (const handler of handlers) {
            try {
                const result = await handler(context);
                results.push({ success: true, result });
            } catch (error) {
                hasErrors = true;
                this.debug(`Hook execution failed for event ${event}:`, error);
                
                results.push({ 
                    success: false, 
                    error: error.message,
                    details: error.details || {} 
                });

                // Execute error hooks if available and not already in error event
                if (event !== LIFECYCLE_EVENTS.ERROR) {
                    await this.executeHooks(LIFECYCLE_EVENTS.ERROR, { 
                        error, 
                        event,
                        context 
                    });
                }
            }
        }

        // Store hook execution results in plugin state
        this.setState(`lastHookExecution:${event}`, {
            timestamp: new Date().toISOString(),
            results,
            hasErrors
        });

        return results;
    }

    async initialize(context = {}) {
        if (this.initialized) return;

        try {
            // Emit pre-init event
            await this.eventEmitter.emitAsync(LIFECYCLE_EVENTS.PRE_INIT, {
                pluginName: this.config.name,
                context
            });

            // Plugin-specific initialization logic
            await this.onInitialize?.(context);

            this.initialized = true;

            // Emit post-init event
            await this.eventEmitter.emitAsync(LIFECYCLE_EVENTS.POST_INIT, {
                pluginName: this.config.name,
                context,
                success: true
            });

            // Update metrics
            const metrics = await this.getState('metrics');
            metrics.successfulExecutions++;
            metrics.lastExecution = new Date().toISOString();
            await this.setState('metrics', metrics);

            return true;
        } catch (error) {
            await this.eventEmitter.emitAsync(LIFECYCLE_EVENTS.ERROR, {
                pluginName: this.config.name,
                error,
                phase: 'initialization',
                context
            });

            // Update error metrics
            const metrics = await this.getState('metrics');
            metrics.failedExecutions++;
            metrics.lastExecution = new Date().toISOString();
            await this.setState('metrics', metrics);

            throw error;
        }
    }

    async execute(context = {}) {
        if (!this.initialized) {
            await this.initialize(context);
        }

        try {
            // Emit pre-execute event
            await this.eventEmitter.emitAsync(LIFECYCLE_EVENTS.PRE_EXECUTE, {
                pluginName: this.config.name,
                context
            });

            // Plugin-specific execution logic
            const result = await this.onExecute?.(context);

            // Emit post-execute event
            await this.eventEmitter.emitAsync(LIFECYCLE_EVENTS.POST_EXECUTE, {
                pluginName: this.config.name,
                context,
                result,
                success: true
            });

            // Update success metrics
            const metrics = await this.getState('metrics');
            metrics.eventExecutions++;
            metrics.successfulExecutions++;
            metrics.lastExecution = new Date().toISOString();
            await this.setState('metrics', metrics);

            return result;
        } catch (error) {
            // Emit error event
            await this.eventEmitter.emitAsync(LIFECYCLE_EVENTS.ERROR, {
                pluginName: this.config.name,
                error,
                phase: 'execution',
                context
            });

            // Update error metrics
            const metrics = await this.getState('metrics');
            metrics.eventExecutions++;
            metrics.failedExecutions++;
            metrics.lastExecution = new Date().toISOString();
            await this.setState('metrics', metrics);

            throw error;
        }
    }

    async cleanup() {
        try {
            await this.executeHooks(LIFECYCLE_EVENTS.CLEANUP);
            // Plugin-specific cleanup logic should be implemented by child classes
            await this.onCleanup?.();
            this.initialized = false;
        } catch (error) {
            await this.executeHooks(LIFECYCLE_EVENTS.ERROR, { error });
            throw error;
        }
    }

    // State management methods
    setState(key, value) {
        this.state.set(key, value);
    }

    getState(key) {
        return this.state.get(key);
    }

    // Methods to be implemented by child classes
    async onInitialize(context) {}
    async onExecute(context) {}
    async onCleanup() {}

    // Error tracking and reporting
    async trackError(error, context = {}) {
        const errorData = {
            timestamp: new Date().toISOString(),
            pluginName: this.config.name,
            pluginVersion: this.config.version,
            error: {
                message: error.message,
                code: error.code || 'UNKNOWN_ERROR',
                stack: error.stack,
                details: error.details || {}
            },
            context
        };

        // Store error in plugin state
        const errors = this.getState('errors') || [];
        errors.push(errorData);
        this.setState('errors', errors);

        return errorData;
    }

    getErrorHistory() {
        return this.getState('errors') || [];
    }

    // Hook execution statistics
    getHookStats() {
        const stats = {};
        for (const event of Object.values(LIFECYCLE_EVENTS)) {
            const lastExecution = this.getState(`lastHookExecution:${event}`);
            if (lastExecution) {
                stats[event] = {
                    lastExecuted: lastExecution.timestamp,
                    success: !lastExecution.hasErrors,
                    results: lastExecution.results
                };
            }
        }
        return stats;
    }

    // Documentation generation and validation
    generateDocumentation() {
        const docs = {
            plugin: {
                name: this.config.name,
                version: this.config.version,
                type: this.config.type,
                description: this.config.description,
                author: this.config.author
            },
            capabilities: {
                ...this.getCapabilities(),
                description: 'Plugin capabilities and features',
                details: this.generateCapabilitiesDetails()
            },
            hooks: {
                available: Array.from(this.hooks.entries()).map(([event, handlers]) => ({
                    event,
                    handlers: handlers.map(h => ({
                        description: h.description,
                        priority: h.priority,
                        id: h.id
                    }))
                })),
                lifecycle: {
                    description: 'Plugin lifecycle events',
                    events: Object.values(LIFECYCLE_EVENTS)
                }
            },
            metadata: {
                ...this.getMetadata(),
                lastUpdated: new Date().toISOString()
            },
            usage: {
                examples: this.generateUsageExamples(),
                bestPractices: this.generateBestPractices(),
                configuration: this.generateConfigurationGuide()
            },
            errorHandling: {
                codes: this.listErrorCodes(),
                recovery: this.generateErrorRecoveryGuide()
            },
            testing: {
                examples: this.generateTestExamples(),
                coverage: this.getTestCoverage()
            },
            apis: {
                public: this.listPublicAPIs(),
                hooks: this.listHookAPIs(),
                events: this.listEventAPIs()
            }
        };

        return docs;
    }

    generateCapabilitiesDetails() {
        const capabilities = this.getCapabilities();
        return Object.entries(capabilities).map(([name, enabled]) => ({
            name,
            enabled,
            description: this.getCapabilityDescription(name),
            requirements: this.getCapabilityRequirements(name)
        }));
    }

    getCapabilityDescription(name) {
        const descriptions = {
            design: 'Ability to design and structure APIs',
            mock: 'Generate mock data and responses',
            test: 'Testing and validation capabilities',
            document: 'Documentation generation features',
            monitor: 'Performance monitoring and metrics',
            migrations: 'Database schema migration support',
            seeding: 'Database seeding functionality',
            backup: 'Database backup capabilities',
            restore: 'Database restoration features',
            syncNodeVersion: 'Node.js version synchronization',
            syncDependencies: 'Dependency management and sync',
            syncConfigs: 'Configuration synchronization',
            crossPlatform: 'Cross-platform compatibility',
            dependencyScan: 'Dependency vulnerability scanning',
            codeScan: 'Code security analysis',
            configScan: 'Configuration security validation',
            reportGeneration: 'Security report generation'
        };
        return descriptions[name] || 'Custom capability';
    }

    getCapabilityRequirements(name) {
        const requirements = {
            design: ['OpenAPI/Swagger knowledge', 'API design principles'],
            mock: ['JSON Schema understanding', 'Data generation tools'],
            test: ['Testing frameworks', 'Assertion libraries'],
            document: ['Documentation tools', 'Markdown/HTML knowledge'],
            monitor: ['Metrics collection', 'Performance analysis'],
            migrations: ['Database schema knowledge', 'SQL expertise'],
            seeding: ['Data modeling', 'Fixture handling'],
            backup: ['Database administration', 'Storage management'],
            restore: ['Backup verification', 'Recovery procedures']
        };
        return requirements[name] || [];
    }

    generateUsageExamples() {
        return {
            initialization: `
const plugin = new ${this.constructor.name}({
    name: '${this.config.name}',
    version: '${this.config.version}',
    type: '${this.config.type}',
    capabilities: ${JSON.stringify(this.getCapabilities(), null, 2)}
});`,
            hookRegistration: `
// Register a hook with priority and description
await plugin.registerHook('${Object.values(LIFECYCLE_EVENTS)[0]}', async (context) => {
    // Hook implementation
    const { data } = context;
    // Process data
    return { success: true, processed: data };
}, { 
    priority: 50,
    description: 'Process incoming data before execution'
});`,
            execution: `
// Execute plugin with proper error handling
try {
    const result = await plugin.execute({
        action: 'process',
        data: {
            // Context specific to your plugin type
        }
    });
    console.log('Execution successful:', result);
} catch (error) {
    console.error('Execution failed:', error.message);
    // Access detailed error information
    console.error('Error details:', error.details);
}`,
            stateManagement: `
// Manage plugin state
plugin.setState('processingConfig', {
    maxRetries: 3,
    timeout: 5000
});

// Retrieve state
const config = plugin.getState('processingConfig');
`,
            hookRemoval: `
// Remove a specific hook
const hookId = await plugin.registerHook('preExecute', async () => {
    // Temporary hook
});
plugin.removeHook('preExecute', hookId);
`
        };
    }

    listErrorCodes() {
        return {
            'PLUGIN_ERROR': 'Generic plugin error',
            'INVALID_HOOK_EVENT': 'Attempted to register a hook with an invalid event name',
            'INVALID_HOOK_HANDLER': 'Hook handler must be a function',
            'HOOK_EXECUTION_ERROR': 'Error occurred during hook execution',
            'CONFIG_VALIDATION_ERROR': 'Plugin configuration validation failed',
            'INVALID_CONTEXT': 'Invalid context provided to plugin method'
        };
    }

    generateErrorRecoveryGuide() {
        return {
            general: [
                'Ensure plugin configuration is valid and complete',
                'Check all required dependencies are installed and accessible',
                'Verify environment variables and configurations are properly set',
                'Review hook implementations for potential errors'
            ],
            specific: {
                'INVALID_HOOK_EVENT': [
                    'Check the event name against available LIFECYCLE_EVENTS',
                    'Ensure the event is properly imported from the base plugin',
                    'Verify the event spelling and case sensitivity'
                ],
                'HOOK_EXECUTION_ERROR': [
                    'Review the hook implementation for potential async/await issues',
                    'Check for proper error handling within the hook',
                    'Verify the hook context structure matches expectations',
                    'Ensure all required dependencies are available to the hook'
                ],
                'CONFIG_VALIDATION_ERROR': [
                    'Validate plugin configuration against the schema',
                    'Check for required fields and proper types',
                    'Ensure version numbers follow semantic versioning',
                    'Verify capability flags are properly set'
                ]
            },
            debugging: {
                steps: [
                    'Enable debug mode by setting DEBUG environment variable',
                    'Review plugin state using getState() method',
                    'Check hook execution history with getHookStats()',
                    'Analyze error history using getErrorHistory()'
                ],
                tools: [
                    'Plugin documentation generator',
                    'Hook execution tracker',
                    'State inspector',
                    'Configuration validator'
                ]
            }
        };
    }

    generateTestExamples() {
        return {
            unit: [
                {
                    description: 'Test plugin initialization',
                    code: `
describe('${this.config.name}', () => {
    let plugin;
    
    beforeEach(() => {
        plugin = new ${this.constructor.name}({
            name: 'test-plugin',
            version: '1.0.0',
            type: '${this.config.type}',
            capabilities: ${JSON.stringify(this.getCapabilities())}
        });
    });

    test('initializes correctly', async () => {
        await plugin.initialize();
        expect(plugin.isInitialized()).toBe(true);
    });

    test('handles hooks properly', async () => {
        const hookId = await plugin.registerHook('${Object.values(LIFECYCLE_EVENTS)[0]}', 
            async () => ({ success: true }));
        expect(hookId).toBeDefined();
    });
});`
                }
            ],
            integration: [
                {
                    description: 'Test plugin execution flow',
                    code: `
describe('Plugin Integration', () => {
    test('executes with proper context', async () => {
        const result = await plugin.execute({
            action: 'test',
            data: { /* test data */ }
        });
        expect(result).toBeDefined();
    });
});`
                }
            ],
            mocking: [
                {
                    description: 'Mock plugin dependencies',
                    code: `
// Mock external dependencies
jest.mock('external-dependency', () => ({
    someMethod: jest.fn().mockResolvedValue({ success: true })
}));`
                }
            ]
        };
    }

    getTestCoverage() {
        // This would typically be populated by actual test runs
        return {
            statements: 0,
            branches: 0,
            functions: 0,
            lines: 0,
            uncovered: {
                functions: [],
                statements: []
            }
        };
    }

    listPublicAPIs() {
        return {
            methods: [
                {
                    name: 'initialize',
                    description: 'Initialize the plugin and its resources',
                    parameters: ['context?: object'],
                    returns: 'Promise<void>'
                },
                {
                    name: 'execute',
                    description: 'Execute the plugin with given context',
                    parameters: ['context: object'],
                    returns: 'Promise<any>'
                }
                // Add other public methods
            ],
            properties: [
                {
                    name: 'config',
                    type: 'object',
                    description: 'Plugin configuration'
                },
                {
                    name: 'capabilities',
                    type: 'object',
                    description: 'Plugin capabilities'
                }
            ]
        };
    }

    listHookAPIs() {
        return {
            registration: {
                method: 'registerHook',
                parameters: [
                    'event: LIFECYCLE_EVENTS',
                    'handler: (context: any) => Promise<any>',
                    'options?: { priority?: number, description?: string }'
                ],
                returns: 'Promise<string>'
            },
            removal: {
                method: 'removeHook',
                parameters: ['event: string', 'hookId: string'],
                returns: 'boolean'
            },
            execution: {
                method: 'executeHooks',
                parameters: ['event: string', 'context?: object'],
                returns: 'Promise<Array<any>>'
            }
        };
    }

    listEventAPIs() {
        return {
            lifecycle: Object.values(LIFECYCLE_EVENTS).map(event => ({
                name: event,
                description: this.getEventDescription(event),
                context: this.getEventContextSchema(event)
            }))
        };
    }

    getEventDescription(event) {
        const descriptions = {
            [LIFECYCLE_EVENTS.PRE_INIT]: 'Called before plugin initialization',
            [LIFECYCLE_EVENTS.POST_INIT]: 'Called after successful initialization',
            [LIFECYCLE_EVENTS.PRE_EXECUTE]: 'Called before plugin execution',
            [LIFECYCLE_EVENTS.POST_EXECUTE]: 'Called after successful execution',
            [LIFECYCLE_EVENTS.ERROR]: 'Called when an error occurs',
            [LIFECYCLE_EVENTS.CLEANUP]: 'Called during plugin cleanup'
        };
        return descriptions[event] || 'Custom event';
    }

    getEventContextSchema(event) {
        // This could be enhanced to provide actual Zod schemas per event
        const schemas = {
            [LIFECYCLE_EVENTS.ERROR]: {
                error: 'Error object',
                context: 'Original context that caused the error'
            },
            [LIFECYCLE_EVENTS.PRE_EXECUTE]: {
                action: 'string',
                data: 'any'
            }
        };
        return schemas[event] || { context: 'any' };
    }

    // Enhanced configuration validation
    async validateConfiguration(config) {
        try {
            const validatedConfig = await basePluginSchema.parseAsync(config);
            
            // Additional custom validations
            if (validatedConfig.dependencies) {
                for (const dep of validatedConfig.dependencies) {
                    await this.validateDependencyVersion(dep);
                }
            }

            return validatedConfig;
        } catch (error) {
            const enhancedError = await this.createError(
                'Plugin configuration validation failed',
                'CONFIG_VALIDATION_ERROR',
                { originalError: error.message }
            );
            await this.trackError(enhancedError);
            throw enhancedError;
        }
    }

    isInitialized() {
        return this.initialized;
    }

    getCapabilities() {
        return this.config.capabilities || {};
    }

    hasCapability(capability) {
        return this.getCapabilities()[capability] === true;
    }

    getDependencies() {
        return this.config.dependencies || [];
    }

    getMetadata() {
        return this.config.metadata || {};
    }

    async validateDependencyVersion(dependency) {
        const semver = require('semver');
        if (!semver.valid(dependency.version) && !semver.validRange(dependency.version)) {
            throw new Error(`Invalid version format for dependency ${dependency.name}: ${dependency.version}`);
        }
        return true;
    }

    async createError(message, code = 'PLUGIN_ERROR', details = {}) {
        const error = new Error(message);
        error.code = code;
        error.details = details;
        error.pluginName = this.config.name;
        error.pluginVersion = this.config.version;
        return error;
    }

    debug(message, ...args) {
        if (process.env.DEBUG) {
            console.debug(`[${this.config.name}@${this.config.version}] ${message}`, ...args);
        }
    }

    getHooksByEvent(event) {
        return (this.hooks.get(event) || []).sort((a, b) => a.priority - b.priority);
    }

    async validateContext(context, schema) {
        try {
            return schema.parse(context);
        } catch (error) {
            throw await this.createError(`Context validation failed: ${error.message}`, 'INVALID_CONTEXT');
        }
    }
}

module.exports = {
    Plugin,
    basePluginSchema,
    LIFECYCLE_EVENTS
};
