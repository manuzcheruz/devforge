const { createProject } = require('./commands/init');
const { loadConfig, saveConfig } = require('./commands/config');
const { PluginManager } = require('./plugins/manager');

class NodeForge {
    constructor() {
        this.pluginManager = new PluginManager();
    }

    async createProject(options) {
        return createProject(options, this.pluginManager);
    }

    async loadConfig(path) {
        return loadConfig(path);
    }

    async saveConfig(config, path) {
        return saveConfig(config, path);
    }

    registerPlugin(plugin) {
        this.pluginManager.register(plugin);
    }
}

module.exports = new NodeForge();
