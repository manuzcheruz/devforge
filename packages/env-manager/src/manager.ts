import { exec } from 'child_process';
// NodeSmith Environment Manager
import { promises as fs } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { EnvironmentConfig, ValidationResult, SyncResult, RepairResult } from './types';
import { logger } from './utils/logger';

const execAsync = promisify(exec);

export class EnvironmentManager {
    async validate(projectPath: string): Promise<ValidationResult> {
        try {
            logger.info(`Validating environment for project at: ${projectPath}`);
            
            const { stdout: nodeVersion } = await execAsync('node --version');
            const { stdout: npmVersion } = await execAsync('npm --version');
            
            const packageJsonPath = join(projectPath, 'package.json');
            const issues: string[] = [];
            
            try {
                await fs.access(packageJsonPath);
            } catch (error) {
                issues.push('Missing package.json');
            }
            
            return {
                success: issues.length === 0,
                details: {
                    nodeVersion: nodeVersion.trim(),
                    npmVersion: npmVersion.trim(),
                    projectPath,
                    issues
                }
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Environment validation failed: ${message}`);
            return {
                success: false,
                details: {
                    issues: [message]
                }
            };
        }
    }

    async sync(projectPath: string, config?: EnvironmentConfig): Promise<SyncResult> {
        try {
            logger.info(`Synchronizing environment for project at: ${projectPath}`);
            
            try {
                await fs.access(projectPath);
            } catch (error) {
                throw new Error(`Invalid project path: ${projectPath}`);
            }
            
            const validation = await this.validate(projectPath);
            if (!validation.success) {
                return validation;
            }

            const packageJsonPath = join(projectPath, 'package.json');
            let packageJson: any;
            
            try {
                const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
                packageJson = JSON.parse(packageJsonContent);
            } catch (error) {
                throw new Error('Failed to read package.json');
            }

            // Sync dependencies
            logger.info('Synchronizing dependencies...');
            try {
                await execAsync('npm install', { cwd: projectPath });
            } catch (error) {
                throw new Error('Failed to install dependencies');
            }

            // Sync development configurations
            const configFiles = config?.configFiles ?? ['.eslintrc', '.prettierrc', 'tsconfig.json'];
            const syncedConfigs: string[] = [];

            for (const configFile of configFiles) {
                const configPath = join(projectPath, configFile);
                try {
                    await fs.access(configPath);
                    syncedConfigs.push(configFile);
                } catch {
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
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Environment synchronization failed: ${message}`);
            return {
                success: false,
                details: {
                    issues: [message]
                }
            };
        }
    }

    async repair(projectPath: string): Promise<RepairResult> {
        try {
            logger.info(`Repairing environment for project at: ${projectPath}`);
            const actions: string[] = [];
            
            // Remove node_modules and package-lock.json
            const nodeModulesPath = join(projectPath, 'node_modules');
            const packageLockPath = join(projectPath, 'package-lock.json');

            try {
                await fs.rm(nodeModulesPath, { recursive: true, force: true });
                await fs.rm(packageLockPath, { force: true });
                actions.push('Removed node_modules and package-lock.json');
            } catch (error) {
                logger.warn(`Failed to remove existing files: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            // Clean npm cache
            try {
                await execAsync('npm cache clean --force');
                actions.push('Cleaned npm cache');
            } catch (error) {
                logger.warn(`Failed to clean npm cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            // Reinstall dependencies
            const syncResult = await this.sync(projectPath);
            if (syncResult.success) {
                actions.push('Reinstalled dependencies');
            }

            return {
                success: syncResult.success,
                details: {
                    actions,
                    issues: syncResult.success ? undefined : syncResult.details.issues
                }
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Environment repair failed: ${message}`);
            return {
                success: false,
                details: {
                    actions: [],
                    issues: [message]
                }
            };
        }
    }
}
