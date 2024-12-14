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
    }

    register(category, plugin) {
        if (!plugin.name || typeof plugin.execute !== 'function') {
            throw new Error('Invalid plugin format');
        }
        if (!this.supportedCategories.has(category)) {
            throw new Error(`Invalid category: ${category}. Supported categories are: ${Array.from(this.supportedCategories).join(', ')}`);
        }
        if (!this.plugins[category]) {
            this.plugins[category] = new Map();
        }
        this.plugins[category].set(plugin.name, plugin);
    }

    async applyPlugins(category, context) {
        if (!this.plugins[category]) {
            throw new Error(`Invalid category: ${category}`);
        }
        
        const results = [];
        for (const plugin of this.plugins[category].values()) {
            try {
                const result = await plugin.execute(context);
                results.push({ plugin: plugin.name, success: true, result });
            } catch (error) {
                results.push({ plugin: plugin.name, success: false, error: error.message });
            }
        }
        return results;
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
