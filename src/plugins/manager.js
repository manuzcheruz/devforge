class PluginManager {
    constructor() {
        this.plugins = {
            environment: new Map(),
            api: new Map(),
            microservices: new Map(),
            performance: new Map(),
            security: new Map(),
            database: new Map()
        };
        this.supportedCategories = new Set([
            'environment',
            'api',
            'microservices',
            'performance',
            'security',
            'database'
        ]);
        this.dependencies = new Map(); // Track plugin dependencies
        this.lifecycleHooks = new Map(); // Store plugin lifecycle hooks
    }

    register(category, plugin) {
        // Validate plugin structure
        this.validatePlugin(plugin);
        
        // Check category
        if (!this.supportedCategories.has(category)) {
            throw new Error(`Invalid category: ${category}. Supported categories are: ${Array.from(this.supportedCategories).join(', ')}`);
        }

        // Initialize category if needed
        if (!this.plugins[category]) {
            this.plugins[category] = new Map();
        }

        // Store plugin dependencies
        if (plugin.dependencies) {
            this.dependencies.set(plugin.name, plugin.dependencies);
        }

        // Register lifecycle hooks if present
        if (plugin.hooks) {
            this.lifecycleHooks.set(plugin.name, plugin.hooks);
        }

        // Register the plugin
        this.plugins[category].set(plugin.name, plugin);
    }

    validatePlugin(plugin) {
        if (!plugin || typeof plugin !== 'object') {
            throw new Error('Plugin must be an object');
        }

        // Required fields
        const required = ['name', 'version', 'execute'];
        for (const field of required) {
            if (!plugin[field]) {
                throw new Error(`Plugin missing required field: ${field}`);
            }
        }

        // Type validations
        if (typeof plugin.name !== 'string') {
            throw new Error('Plugin name must be a string');
        }
        if (typeof plugin.version !== 'string') {
            throw new Error('Plugin version must be a string');
        }
        if (typeof plugin.execute !== 'function') {
            throw new Error('Plugin execute must be a function');
        }

        // Validate dependencies if present
        if (plugin.dependencies) {
            if (!Array.isArray(plugin.dependencies)) {
                throw new Error('Plugin dependencies must be an array');
            }
            for (const dep of plugin.dependencies) {
                if (!dep.name || !dep.version) {
                    throw new Error('Invalid dependency format. Must include name and version');
                }
            }
        }

        // Validate hooks if present
        if (plugin.hooks) {
            if (!Array.isArray(plugin.hooks)) {
                throw new Error('Plugin hooks must be an array');
            }
            for (const hook of plugin.hooks) {
                if (!hook.event || typeof hook.handler !== 'function') {
                    throw new Error('Invalid hook format. Must include event and handler function');
                }
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
