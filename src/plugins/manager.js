const { z } = require('zod');
const { LIFECYCLE_EVENTS } = require('./interfaces/base');
const { logger } = require('../utils/logger');

class PluginManager {
    constructor() {
        // Core plugin categories
        this.plugins = {
            environment: new Map(),
            api: new Map(),
            microservices: new Map(),
            performance: new Map(),
            security: new Map(),
            database: new Map()
        };
        
        // Plugin system metadata
        this.supportedCategories = new Set([
            'environment',
            'api',
            'microservices',
            'performance',
            'security',
            'database'
        ]);
        
        // Plugin management structures
        this.dependencies = new Map(); // Track plugin dependencies
        this.lifecycleHooks = new Map(); // Store plugin lifecycle hooks
        this.pluginRegistry = new Map(); // Store plugin metadata
        this.versionCache = new Map(); // Cache resolved versions
        
        // Initialize global hooks
        this.globalHooks = Object.values(LIFECYCLE_EVENTS).reduce((acc, event) => {
            acc.set(event, []);
            return acc;
        }, new Map());
    }

    async register(category, plugin) {
        try {
            logger.info(`Registering plugin ${plugin.name} in category ${category}`);
            
            // Enhanced plugin validation
            this.validatePlugin(plugin);
            
            // Category validation with detailed error
            if (!this.supportedCategories.has(category)) {
                throw new Error(`Invalid category: ${category}. Supported categories are: ${Array.from(this.supportedCategories).join(', ')}`);
            }

            // Ensure category exists
            if (!this.plugins[category]) {
                this.plugins[category] = new Map();
            }

            // Version validation
            if (!this.validateVersion(plugin.version)) {
                throw new Error(`Invalid version format for plugin ${plugin.name}: ${plugin.version}`);
            }

            // Check for existing plugin
            if (this.plugins[category].has(plugin.name)) {
                throw new Error(`Plugin ${plugin.name} is already registered in category ${category}`);
            }

            // Register plugin metadata
            this.pluginRegistry.set(plugin.name, {
                category,
                version: plugin.version,
                capabilities: plugin.capabilities || {},
                lastUpdated: new Date(),
                status: 'active'
            });

            // Handle dependencies
            if (plugin.dependencies) {
                await this.validateDependencies(plugin);
                this.dependencies.set(plugin.name, plugin.dependencies);
            }

            // Register lifecycle hooks
            if (plugin.hooks) {
                await this.registerPluginHooks(plugin);
            }

            // Initialize plugin if it has initialize method
            if (typeof plugin.initialize === 'function') {
                await plugin.initialize();
            }

            // Register the plugin instance
            this.plugins[category].set(plugin.name, plugin);

            logger.info(`Successfully registered plugin ${plugin.name}`);
            return true;
        } catch (error) {
            logger.error(`Failed to register plugin ${plugin.name}:`, error);
            throw error;
        }
    }

    // Enhanced plugin validation with Zod schema
    validatePlugin(plugin) {
        const pluginSchema = z.object({
            name: z.string().min(1).refine(val => /^[a-z0-9-]+$/.test(val), {
                message: "Plugin name must contain only lowercase letters, numbers, and hyphens"
            }),
            version: z.string().regex(/^\d+\.\d+\.\d+$/, {
                message: "Version must follow semantic versioning (e.g., 1.0.0)"
            }),
            type: z.enum(['api', 'database', 'environment', 'security']),
            description: z.string().min(10).optional(),
            author: z.string().min(1).optional(),
            capabilities: z.record(z.boolean()),
            dependencies: z.array(z.object({
                name: z.string(),
                version: z.string().regex(/^(\d+\.\d+\.\d+|>=?\d+\.\d+\.\d+|<=?\d+\.\d+\.\d+|\^?\d+\.\d+\.\d+|\~\d+\.\d+\.\d+)$/, {
                    message: "Invalid version format. Use semantic versioning with optional ^, ~, >, <, >= or <= prefix"
                })
            })).optional(),
            hooks: z.array(z.object({
                event: z.enum(Object.values(LIFECYCLE_EVENTS)),
                handler: z.function(),
                global: z.boolean().optional()
            })).optional(),
            initialize: z.function().optional(),
            execute: z.function(),
            cleanup: z.function().optional(),
            config: z.record(z.unknown()).optional()
        });

        try {
            const validationResult = pluginSchema.safeParse(plugin);
            if (!validationResult.success) {
                const errors = validationResult.error.errors.map(err => 
                    `${err.path.join('.')}: ${err.message}`
                ).join('\n');
                throw new Error(`Invalid plugin configuration:\n${errors}`);
            }

            // Additional validation for capabilities based on plugin type
            this.validatePluginCapabilities(plugin);

            return true;
        } catch (error) {
            throw new Error(`Plugin validation failed: ${error.message}`);
        }
    }

    validatePluginCapabilities(plugin) {
        const requiredCapabilities = {
            api: ['design', 'mock', 'test', 'document', 'monitor'],
            database: ['migrations', 'seeding', 'backup', 'restore'],
            environment: ['syncNodeVersion', 'syncDependencies', 'syncConfigs', 'crossPlatform'],
            security: ['dependencyScan', 'codeScan', 'configScan', 'reportGeneration']
        };

        const required = requiredCapabilities[plugin.type];
        if (!required) return;

        const missing = required.filter(cap => 
            !plugin.capabilities || typeof plugin.capabilities[cap] !== 'boolean'
        );

        if (missing.length > 0) {
            throw new Error(
                `Missing required capabilities for ${plugin.type} plugin: ${missing.join(', ')}`
            );
        }
    }

    // Improved hook registration
    async registerPluginHooks(plugin) {
        if (!plugin.hooks || !Array.isArray(plugin.hooks)) {
            return;
        }

        const registeredHooks = [];
        for (const hook of plugin.hooks) {
            try {
                if (!Object.values(LIFECYCLE_EVENTS).includes(hook.event)) {
                    throw new Error(`Invalid hook event: ${hook.event}`);
                }

                // Store hook in plugin-specific hooks
                if (!this.lifecycleHooks.has(plugin.name)) {
                    this.lifecycleHooks.set(plugin.name, []);
                }
                this.lifecycleHooks.get(plugin.name).push(hook);

                // Add to global hooks if specified
                if (hook.global) {
                    this.globalHooks.get(hook.event).push({
                        pluginName: plugin.name,
                        handler: hook.handler
                    });
                }

                registeredHooks.push(hook.event);
            } catch (error) {
                logger.error(`Failed to register hook ${hook.event} for plugin ${plugin.name}:`, error);
                throw error;
            }
        }

        logger.info(`Registered hooks for plugin ${plugin.name}: ${registeredHooks.join(', ')}`);
    }

    // Enhanced dependency validation
    async validateDependencies(plugin) {
        if (!plugin.dependencies) return;

        for (const dep of plugin.dependencies) {
            const dependencyPlugin = this.findPluginByName(dep.name);
            
            if (!dependencyPlugin) {
                throw new Error(`Required dependency ${dep.name} not found`);
            }

            if (!this.isVersionCompatible(dependencyPlugin.version, dep.version)) {
                throw new Error(
                    `Version mismatch for dependency ${dep.name}: ` +
                    `requires ${dep.version}, found ${dependencyPlugin.version}`
                );
            }
        }
    }

    async applyPlugins(category, context) {
        if (!this.plugins[category]) {
            throw new Error(`Invalid category: ${category}`);
        }

        const results = [];
        const pluginsToExecute = Array.from(this.plugins[category].values());
        
        // Sort plugins based on dependencies
        pluginsToExecute.sort((a, b) => {
            const aDeps = this.dependencies.get(a.name) || [];
            return aDeps.some(dep => dep.name === b.name) ? 1 : -1;
        });

        for (const plugin of pluginsToExecute) {
            try {
                // Check dependencies before execution
                const deps = this.dependencies.get(plugin.name) || [];
                for (const dep of deps) {
                    const dependencyMet = pluginsToExecute.some(p => 
                        p.name === dep.name && this.compareVersions(p.version, dep.version) >= 0
                    );
                    if (!dependencyMet) {
                        throw new Error(`Unmet dependency: ${dep.name}@${dep.version}`);
                    }
                }

                // Execute lifecycle hooks: pre-execute
                await this.executeHooks(plugin.name, 'pre-execute', context);

                // Execute plugin
                const result = await plugin.execute(context);

                // Execute lifecycle hooks: post-execute
                await this.executeHooks(plugin.name, 'post-execute', { ...context, result });

                results.push({ 
                    plugin: plugin.name, 
                    success: true, 
                    result,
                    version: plugin.version
                });
            } catch (error) {
                // Execute lifecycle hooks: error
                await this.executeHooks(plugin.name, 'error', { ...context, error });

                results.push({ 
                    plugin: plugin.name, 
                    success: false, 
                    error: error.message,
                    version: plugin.version
                });
            }
        }
        return results;
    }
    // Plugin discovery and loading
    async discoverPlugins(pluginPath) {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            const files = await fs.readdir(pluginPath);
            
            for (const file of files) {
                if (file.endsWith('.js')) {
                    const fullPath = path.join(pluginPath, file);
                    try {
                        const plugin = require(fullPath);
                        
                        // Validate plugin structure
                        if (this.validatePlugin(plugin)) {
                            const category = this.detectPluginCategory(plugin);
                            if (category) {
                                await this.register(category, plugin); // Use await here
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to load plugin from ${fullPath}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Plugin discovery failed:', error);
            throw error;
        }
    }

    detectPluginCategory(plugin) {
        if (plugin.type && this.supportedCategories.has(plugin.type)) {
            return plugin.type;
        }
        // Fallback detection based on capabilities
        if (plugin.capabilities) {
            if (plugin.capabilities.syncNodeVersion) return 'environment';
            if (plugin.capabilities.design || plugin.capabilities.mock) return 'api';
            if (plugin.capabilities.migrations) return 'database';
        }
        return null;
    }

    validateVersion(version) {
        const semver = require('semver');
        return semver.valid(version) !== null;
    }

    async resolvePluginDependencies(pluginName) {
        const visited = new Set();
        const resolved = new Map();

        const resolve = async (name, requiredVersion) => {
            if (visited.has(name)) {
                return resolved.get(name);
            }

            visited.add(name);
            const plugin = this.findPluginByName(name);
            
            if (!plugin) {
                throw new Error(`Plugin ${name} not found`);
            }

            if (requiredVersion && !this.isVersionCompatible(plugin.version, requiredVersion)) {
                throw new Error(`Version mismatch for ${name}: requires ${requiredVersion}, found ${plugin.version}`);
            }

            const dependencies = this.dependencies.get(name) || [];
            for (const dep of dependencies) {
                await resolve(dep.name, dep.version);
            }

            resolved.set(name, plugin);
            return plugin;
        };

        return resolve(pluginName);
    }

    async isVersionCompatible(actual, required) {
        const semver = require('semver');
        
        // Handle version range specifiers
        if (required.startsWith('^') || required.startsWith('~') || 
            required.startsWith('>') || required.startsWith('<')) {
            return semver.satisfies(actual, required);
        }
        
        // For exact version matches
        if (semver.valid(required)) {
            return semver.eq(actual, required);
        }

        throw new Error(`Invalid version requirement: ${required}`);
    }

    findPluginByName(name) {
        // First check version cache
        if (this.versionCache.has(name)) {
            return this.versionCache.get(name);
        }

        // Search through all categories
        for (const category of Object.values(this.plugins)) {
            if (category.has(name)) {
                const plugin = category.get(name);
                // Cache the result
                this.versionCache.set(name, plugin);
                return plugin;
            }
        }
        return null;
    }

    async findCompatibleVersion(pluginName, requiredVersion) {
        const plugin = this.findPluginByName(pluginName);
        if (!plugin) {
            throw new Error(`Plugin ${pluginName} not found`);
        }

        const isCompatible = await this.isVersionCompatible(plugin.version, requiredVersion);
        if (!isCompatible) {
            throw new Error(
                `No compatible version found for ${pluginName}. ` +
                `Required: ${requiredVersion}, Found: ${plugin.version}`
            );
        }

        return plugin;
    }
    compareVersions(v1, v2) {
        const normalize = v => v.split('.').map(Number);
        const [a1, a2, a3] = normalize(v1);
        const [b1, b2, b3] = normalize(v2);
        
        if (a1 !== b1) return a1 - b1;
        if (a2 !== b2) return a2 - b2;
        return a3 - b3;
    }

    async executeHooks(pluginName, event, context) {
        const hooks = this.lifecycleHooks.get(pluginName) || [];
        for (const hook of hooks.filter(h => h.event === event)) {
            try {
                await hook.handler(context);
            } catch (error) {
                console.error(`Hook execution failed for plugin ${pluginName}, event ${event}:`, error);
            }
        }
    }

    getPlugin(category, name) {
        return this.plugins[category]?.get(name);
    }

    listPlugins(category) {
        if (!category) {
            return Object.entries(this.plugins).reduce((acc, [cat, plugins]) => {
                acc[cat] = Array.from(plugins.keys());
                return acc;
            }, {});
        }
        return Array.from(this.plugins[category]?.keys() || []);
    }

    async analyzeProject(projectPath) {
        const context = { projectPath };
        const analysis = {};
        
        for (const category of Object.keys(this.plugins)) {
            analysis[category] = await this.applyPlugins(category, context);
        }
        
        return analysis;
    }
}

module.exports = { PluginManager };