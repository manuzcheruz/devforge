const { createProject } = require('./commands/init');
const { loadConfig, saveConfig } = require('./commands/config');
const { PluginManager } = require('./plugins/manager');

class NodeForge {
    constructor() {
        this.pluginManager = new PluginManager();
        this.registerCorePlugins();
    }

    registerCorePlugins() {
        // Register environment sync plugin
        const environmentSync = require('./plugins/implementations/environment-sync');
        this.pluginManager.register('environment', environmentSync);

        // Register API lifecycle plugin
        const apiLifecycle = require('./plugins/implementations/api-lifecycle');
        this.pluginManager.register('api', apiLifecycle);
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

    registerPlugin(category, plugin) {
        this.pluginManager.register(category, plugin);
    }

    // Environment Synchronization
    async syncEnvironment(options = {}) {
        return this.pluginManager.applyPlugins('environment', {
            ...options,
            action: 'sync'
        });
    }

    // API Development Lifecycle
    async manageAPI(options = {}) {
        return this.pluginManager.applyPlugins('api', {
            ...options,
            action: 'manage'
        });
    }

    // Microservices Development
    async manageMicroservices(options = {}) {
        return this.pluginManager.applyPlugins('microservices', {
            ...options,
            action: 'manage'
        });
    }

    // Performance Optimization
    async optimizePerformance(options = {}) {
        return this.pluginManager.applyPlugins('performance', {
            ...options,
            action: 'optimize'
        });
    }

    // Security and Compliance
    async analyzeSecurity(options = {}) {
        return this.pluginManager.applyPlugins('security', {
            ...options,
            action: 'analyze'
        });
    }

    // Project Analysis
    async analyzeProject(projectPath) {
        return this.pluginManager.analyzeProject(projectPath);
    }
}

module.exports = new NodeForge();
