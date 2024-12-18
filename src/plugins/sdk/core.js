const { z } = require('zod');
const { logger } = require('../../utils/logger');
const { PluginEventEmitter, EVENTS } = require('./events');

// Base Plugin Configuration Schema
const pluginConfigSchema = z.object({
    name: z.string()
        .min(1, "Plugin name is required")
        .regex(/^[a-z0-9-]+$/, "Plugin name must contain only lowercase letters, numbers, and hyphens"),
    version: z.string()
        .regex(/^\d+\.\d+\.\d+$/, "Version must follow semantic versioning (x.y.z)"),
    type: z.enum(['api', 'database', 'environment', 'security'], {
        required_error: "Plugin type is required",
        invalid_type_error: "Invalid plugin type"
    }),
    description: z.string()
        .min(10, "Description must be at least 10 characters")
        .optional(),
    author: z.string()
        .min(1, "Author name is required")
        .optional(),
    capabilities: z.record(z.boolean())
        .refine(caps => Object.keys(caps).length > 0, {
            message: "At least one capability must be defined"
        }),
    subscriptions: z.array(
        z.object({
            event: z.string()
                .min(1, "Event name is required"),
            description: z.string()
                .min(10, "Subscription description must be at least 10 characters"),
            handler: z.function()
                .args(z.any())
                .returns(z.promise(z.any()))
        })
    ).optional()
});

class PluginCore {
    constructor() {
        this.plugins = new Map();
        this.eventEmitter = new PluginEventEmitter();
        
        // Register core event middlewares
        this.registerCoreMiddlewares();
    }

    /**
     * Register core event middlewares for plugin lifecycle management
     */
    registerCoreMiddlewares() {
        // Plugin registration middleware
        this.eventEmitter.use(EVENTS.PLUGIN.REGISTERED, async (event) => {
            logger.info(`Plugin registration event received: ${event.payload.name}`);
            return true;
        });

        // Error handling middleware
        this.eventEmitter.use(EVENTS.PLUGIN.ERROR, async (event) => {
            logger.error(`Plugin error occurred: ${event.payload.message}`);
            return true;
        });

        // Lifecycle event tracking
        Object.values(EVENTS.LIFECYCLE).forEach(eventName => {
            this.eventEmitter.use(eventName, async (event) => {
                logger.info(`Lifecycle event ${eventName} triggered for plugin ${event.payload.pluginName}`);
                return true;
            });
        });
    }

    /**
     * Register a new plugin with event-based lifecycle management
     * @param {Object} config Plugin configuration
     * @returns {Object} Registered plugin instance
     */
    async registerPlugin(config) {
        try {
            // Validate plugin configuration
            const validConfig = await pluginConfigSchema.parseAsync(config);
            
            // Check for existing plugin
            if (this.plugins.has(validConfig.name)) {
                throw new Error(`Plugin ${validConfig.name} is already registered`);
            }

            // Create plugin instance with event-driven architecture
            const plugin = {
                config: validConfig,
                state: new Map(),
                initialized: false,
                
                // Event-driven state management
                async setState(key, value) {
                    this.state.set(key, value);
                    await this.emitState(key, value);
                },
                
                async getState(key) {
                    return this.state.get(key);
                },
                
                async emitState(key, value) {
                    await this.eventEmitter.emitAsync(`plugin:state:${key}`, {
                        pluginName: this.config.name,
                        key,
                        value,
                        timestamp: new Date().toISOString()
                    });
                }
            };

            // Bind event emitter to plugin
            plugin.eventEmitter = this.eventEmitter;

            // Register plugin event subscriptions
            if (validConfig.subscriptions) {
                for (const subscription of validConfig.subscriptions) {
                    this.eventEmitter.on(subscription.event, async (payload) => {
                        try {
                            await subscription.handler.call(plugin, payload);
                        } catch (error) {
                            await this.eventEmitter.emitAsync(EVENTS.PLUGIN.ERROR, {
                                pluginName: plugin.config.name,
                                event: subscription.event,
                                error: error.message
                            });
                        }
                    });
                }
            }

            // Register plugin in core
            this.plugins.set(validConfig.name, plugin);

            // Emit registration event
            await this.eventEmitter.emitAsync(EVENTS.PLUGIN.REGISTERED, {
                name: validConfig.name,
                type: validConfig.type,
                version: validConfig.version,
                capabilities: validConfig.capabilities
            });

            logger.info(`Plugin ${validConfig.name} registered successfully`);
            return plugin;
        } catch (error) {
            logger.error(`Plugin registration failed: ${error.message}`);
            await this.eventEmitter.emitAsync(EVENTS.PLUGIN.ERROR, {
                error: error.message,
                phase: 'registration'
            });
            throw error;
        }
    }

    /**
     * Register a hook for a plugin
     * @param {string} pluginName Plugin name
     * @param {string} event Event name
     * @param {Function} handler Hook handler
     */
    /**
     * Register a hook with validation and metadata
     * @param {string} pluginName Plugin name
     * @param {string} event Event name
     * @param {Function} handler Hook handler
     */
    async registerHook(pluginName, event, handler) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            throw new Error(`Plugin ${pluginName} not found`);
        }

        // Validate event name
        if (!event || typeof event !== 'string') {
            throw new Error('Event name must be a non-empty string');
        }

        // Create hook metadata
        const hookMetadata = {
            registeredAt: new Date().toISOString(),
            lastExecuted: null,
            executionCount: 0,
            successCount: 0,
            failureCount: 0,
            averageExecutionTime: 0
        };

        // Wrap handler with metadata tracking
        const wrappedHandler = async (context) => {
            const startTime = process.hrtime();
            try {
                const result = await handler(context);
                const [seconds, nanoseconds] = process.hrtime(startTime);
                const executionTime = seconds + nanoseconds / 1e9;

                // Update hook metadata
                hookMetadata.lastExecuted = new Date().toISOString();
                hookMetadata.executionCount++;
                hookMetadata.successCount++;
                hookMetadata.averageExecutionTime = 
                    (hookMetadata.averageExecutionTime * (hookMetadata.executionCount - 1) + executionTime) 
                    / hookMetadata.executionCount;

                return result;
            } catch (error) {
                hookMetadata.failureCount++;
                throw error;
            }
        };

        // Store hook with metadata
        if (!plugin.hooks.has(event)) {
            plugin.hooks.set(event, new Map());
        }
        plugin.hooks.get(event).set(handler, {
            metadata: hookMetadata,
            handler: wrappedHandler
        });

        logger.info(`Hook registered for plugin ${pluginName} on event ${event}`);
    }

    /**
     * Execute hooks for a given event with enhanced error handling and metrics
     * @param {string} event Event name
     * @param {Object} context Event context
     */
    async executeHooks(event, context = {}) {
        const results = [];
        for (const [pluginName, plugin] of this.plugins) {
            const hookMap = plugin.hooks.get(event);
            if (hookMap) {
                for (const [_, { handler }] of hookMap) {
                    try {
                        const result = await handler(context);
                        results.push({
                            plugin: pluginName,
                            success: true,
                            result
                        });
                    } catch (error) {
                        logger.error(`Hook execution failed for plugin ${pluginName}: ${error.message}`);
                        results.push({
                            plugin: pluginName,
                            success: false,
                            error: error.message
                        });
                    }
                }
            }
        }
        return results;
    }

    /**
     * Get plugin state
     * @param {string} pluginName Plugin name
     * @param {string} key State key
     */
    getPluginState(pluginName, key) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            throw new Error(`Plugin ${pluginName} not found`);
        }
        return plugin.state.get(key);
    }

    /**
     * Set plugin state
     * @param {string} pluginName Plugin name
     * @param {string} key State key
     * @param {any} value State value
     */
    setPluginState(pluginName, key, value) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            throw new Error(`Plugin ${pluginName} not found`);
        }
        plugin.state.set(key, value);
    }
}

module.exports = {
    PluginCore,
    pluginConfigSchema
};
