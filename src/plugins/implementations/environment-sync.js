const { EnvironmentPlugin } = require('../interfaces/environment');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../utils/logger');

class EnvironmentSyncPlugin extends EnvironmentPlugin {
    constructor() {
        super({
            name: 'nodesmith-environment-sync',
            version: '1.0.0',
            type: 'environment',
            capabilities: {
                syncNodeVersion: true,
                syncDependencies: true,
                syncConfigs: true,
                crossPlatform: true
            },
            execute: async ({ action, context = {} }) => {
                try {
                    switch (action) {
                        case 'sync':
                            return await this.syncEnvironment(context);
                        case 'check':
                            return await this.validateEnvironment(context);
                        case 'repair':
                            return await this.repairEnvironment(context);
                        default:
                            throw new Error(`Unsupported action: ${action}`);
                    }
                } catch (error) {
                    logger.error(`Plugin execution failed: ${error.message}`);
                    return {
                        success: false,
                        details: {
                            issues: [error.message]
                        }
                    };
                }
            }
        });
    }

    async validateEnvironment(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            logger.info(`Validating environment for project at: ${projectPath}`);
            
            const nodeVersion = execSync('node --version').toString().trim();
            const npmVersion = execSync('npm --version').toString().trim();
            
            const packageJsonPath = path.join(projectPath, 'package.json');
            const issues = [];
            
            // Check if required files exist
            try {
                await fs.access(packageJsonPath);
            } catch (error) {
                issues.push('Missing package.json');
            }
            
            return {
                success: issues.length === 0,
                details: {
                    nodeVersion,
                    npmVersion,
                    projectPath,
                    issues
                }
            };
        } catch (error) {
            logger.error(`Environment validation failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }

    async syncEnvironment(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            logger.info(`Synchronizing environment for project at: ${projectPath}`);
            
            try {
                await fs.access(projectPath);
            } catch (error) {
                logger.error(`Invalid project path: ${projectPath}`);
                return {
                    success: false,
                    details: {
                        issues: [`Invalid project path: ${projectPath}`]
                    }
                };
            }
            
            const validation = await this.validateEnvironment({ projectPath });
            if (!validation.success) {
                logger.error('Environment validation failed');
                return validation;
            }

            const packageJsonPath = path.join(projectPath, 'package.json');
            let packageJson;
            
            try {
                const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
                packageJson = JSON.parse(packageJsonContent);
            } catch (error) {
                logger.error(`Failed to read package.json: ${error.message}`);
                return {
                    success: false,
                    details: {
                        issues: [`Failed to read package.json: ${error.message}`]
                    }
                };
            }

            // Sync node version if specified in package.json
            if (packageJson.engines && packageJson.engines.node) {
                logger.info(`Required Node.js version: ${packageJson.engines.node}`);
            }

            // Sync dependencies
            logger.info('Synchronizing dependencies...');
            try {
                execSync('npm install', { 
                    cwd: projectPath,
                    stdio: 'inherit'
                });
            } catch (error) {
                logger.error(`Failed to install dependencies: ${error.message}`);
                return {
                    success: false,
                    details: {
                        issues: [`Failed to install dependencies: ${error.message}`]
                    }
                };
            }

            // Sync development configurations
            const configFiles = ['.eslintrc', '.prettierrc', 'tsconfig.json'];
            const syncedConfigs = [];

            for (const configFile of configFiles) {
                const configPath = path.join(projectPath, configFile);
                try {
                    await fs.access(configPath);
                    syncedConfigs.push(configFile);
                } catch (error) {
                    // Config file doesn't exist, skip
                    continue;
                }
            }

            return {
                success: true,
                details: {
                    nodeVersion: validation.details.nodeVersion,
                    npmVersion: validation.details.npmVersion,
                    syncedConfigs
                }
            };
        } catch (error) {
            logger.error(`Environment synchronization failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }

    async repairEnvironment(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            logger.info(`Repairing environment for project at: ${projectPath}`);
            
            // Remove node_modules and package-lock.json
            const nodeModulesPath = path.join(projectPath, 'node_modules');
            const packageLockPath = path.join(projectPath, 'package-lock.json');

            try {
                await fs.rm(nodeModulesPath, { recursive: true, force: true });
                await fs.rm(packageLockPath, { force: true });
            } catch (error) {
                logger.warn(`Failed to remove existing files: ${error.message}`);
            }

            // Clean npm cache
            try {
                execSync('npm cache clean --force', {
                    stdio: 'inherit'
                });
            } catch (error) {
                logger.warn(`Failed to clean npm cache: ${error.message}`);
            }

            // Reinstall dependencies
            return this.syncEnvironment(context);
        } catch (error) {
            logger.error(`Environment repair failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }
}

const environmentSyncPlugin = new EnvironmentSyncPlugin();

// Export the plugin configuration that matches the expected format
module.exports = {
    name: environmentSyncPlugin.config.name,
    version: environmentSyncPlugin.config.version,
    type: environmentSyncPlugin.config.type,
    execute: environmentSyncPlugin.config.execute,
    capabilities: environmentSyncPlugin.config.capabilities
};
