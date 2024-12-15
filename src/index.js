const { createProject } = require('./commands/init');
const { loadConfig, saveConfig } = require('./commands/config');
const { PluginManager } = require('./plugins/manager');

class NodeSmith {
    constructor() {
        this.pluginManager = new PluginManager();
        this.registerCorePlugins();
    }

    async registerCorePlugins() {
        try {
            // Register built-in plugins
            const environmentSync = require('./plugins/implementations/environment-sync');
            const prismaDatabase = require('./plugins/implementations/prisma-database');

            // Register core plugins with proper dependency order
            await this.pluginManager.register('environment', environmentSync);
            await this.pluginManager.register('database', prismaDatabase);

            // Discover and load additional plugins from the plugins directory
            const path = require('path');
            const pluginsPath = path.join(__dirname, 'plugins', 'implementations');
            await this.pluginManager.discoverPlugins(pluginsPath);

            // Resolve dependencies for all registered plugins
            const plugins = this.pluginManager.listPlugins();
            for (const category in plugins) {
                for (const pluginName of plugins[category]) {
                    await this.pluginManager.resolvePluginDependencies(pluginName);
                }
            }
        } catch (error) {
            console.error('Failed to register core plugins:', error);
            throw error;
        }
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

    // Database Management
    async manageDatabase(options = {}) {
        const action = options.migrate ? 'migrate' :
                      options.seed ? 'seed' :
                      options.backup ? 'backup' :
                      options.restore ? 'restore' :
                      null;

        if (!action) {
            throw new Error('No valid database action specified');
        }

        return this.pluginManager.applyPlugins('database', {
            action,
            context: {
                projectPath: process.cwd(),
                backupPath: options.backup === true ? undefined : options.backup,
                restorePath: options.restore
            }
        });
    }
}

module.exports = new NodeSmith();
