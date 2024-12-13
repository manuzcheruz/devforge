class PluginManager {
    constructor() {
        this.plugins = new Map();
    }

    register(plugin) {
        if (!plugin.name || typeof plugin.execute !== 'function') {
            throw new Error('Invalid plugin format');
        }
        this.plugins.set(plugin.name, plugin);
    }

    async applyPlugins(template) {
        for (const plugin of this.plugins.values()) {
            await plugin.execute(template);
        }
        return template;
    }

    getPlugin(name) {
        return this.plugins.get(name);
    }
}

module.exports = { PluginManager };
