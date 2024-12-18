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
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    type: z.string(),
    description: z.string().optional(),
    author: z.string().optional(),
    dependencies: z.array(z.object({
        name: z.string(),
        version: z.string()
    })).optional(),
    capabilities: z.record(z.boolean()).optional(),
    hooks: z.array(z.object({
        event: z.enum(Object.values(LIFECYCLE_EVENTS)),
        handler: z.function()
    })).optional(),
    config: z.record(z.unknown()).optional()
});

class Plugin {
    constructor(config) {
        this.validateConfig(config);
        this.config = config;
        this.hooks = new Map();
        this.state = new Map();
        this.initialized = false;
        
        // Register hooks if provided
        if (config.hooks) {
            for (const hook of config.hooks) {
                this.registerHook(hook.event, hook.handler);
            }
        }
    }

    validateConfig(config) {
        try {
            basePluginSchema.parse(config);
        } catch (error) {
            throw new Error(`Invalid plugin configuration: ${error.message}`);
        }
    }

    registerHook(event, handler) {
        if (!Object.values(LIFECYCLE_EVENTS).includes(event)) {
            throw new Error(`Invalid hook event: ${event}`);
        }
        
        if (!this.hooks.has(event)) {
            this.hooks.set(event, []);
        }
        this.hooks.get(event).push(handler);
    }

    async executeHooks(event, context = {}) {
        if (!this.hooks.has(event)) return;

        const handlers = this.hooks.get(event);
        for (const handler of handlers) {
            try {
                await handler(context);
            } catch (error) {
                console.error(`Hook execution failed for event ${event}:`, error);
                // Execute error hooks if available
                if (event !== LIFECYCLE_EVENTS.ERROR) {
                    await this.executeHooks(LIFECYCLE_EVENTS.ERROR, { error, event });
                }
            }
        }
    }

    async initialize(context = {}) {
        if (this.initialized) return;

        try {
            await this.executeHooks(LIFECYCLE_EVENTS.PRE_INIT, context);
            // Plugin-specific initialization logic should be implemented by child classes
            await this.onInitialize?.(context);
            await this.executeHooks(LIFECYCLE_EVENTS.POST_INIT, context);
            this.initialized = true;
        } catch (error) {
            await this.executeHooks(LIFECYCLE_EVENTS.ERROR, { error });
            throw error;
        }
    }

    async execute(context = {}) {
        if (!this.initialized) {
            await this.initialize(context);
        }

        try {
            await this.executeHooks(LIFECYCLE_EVENTS.PRE_EXECUTE, context);
            // Plugin-specific execution logic should be implemented by child classes
            const result = await this.onExecute?.(context);
            await this.executeHooks(LIFECYCLE_EVENTS.POST_EXECUTE, { ...context, result });
            return result;
        } catch (error) {
            await this.executeHooks(LIFECYCLE_EVENTS.ERROR, { error });
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
}

module.exports = {
    Plugin,
    basePluginSchema,
    LIFECYCLE_EVENTS
};
