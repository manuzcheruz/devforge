const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const { defaultConfig } = require('../config/defaults');

class RemoteTemplateManager {
    constructor() {
        this.tempDir = path.join(process.cwd(), '.nodeforge', 'templates');
    }

    async fetchTemplate(repositoryUrl) {
        try {
            logger.info(`Fetching template from ${repositoryUrl}`);
            const repoName = this.getRepoName(repositoryUrl);
            const targetDir = path.join(this.tempDir, repoName);

            // Ensure temp directory exists
            await fs.mkdir(this.tempDir, { recursive: true });

            // Clone repository
            const startTime = logger.startOperation('Cloning template repository');
            await this.cloneRepository(repositoryUrl, targetDir);
            logger.endOperation(startTime, 'Template repository cloned');

            // Validate template structure
            const template = await this.validateTemplate(targetDir);
            return template;
        } catch (error) {
            logger.error(`Failed to fetch template: ${error.message}`);
            throw error;
        }
    }

    getRepoName(repositoryUrl) {
        const urlParts = repositoryUrl.split('/');
        const repoName = urlParts[urlParts.length - 1].replace('.git', '');
        return repoName;
    }

    async cloneRepository(repositoryUrl, targetDir) {
        try {
            // Remove existing directory if it exists
            await fs.rm(targetDir, { recursive: true, force: true });
            
            // Parse repository URL
            const isGitHubUrl = /github\.com/.test(repositoryUrl);
            const gitToken = process.env.GITHUB_TOKEN;
            
            let cloneUrl = repositoryUrl;
            if (isGitHubUrl && gitToken) {
                const urlParts = repositoryUrl.split('://');
                cloneUrl = `https://${gitToken}@${urlParts[1]}`;
                logger.info('Using authenticated GitHub URL');
            }

            // Try shallow clone first (faster)
            logger.info('Attempting shallow clone...');
            try {
                execSync(`git clone --depth 1 ${cloneUrl} ${targetDir}`, {
                    stdio: 'inherit',
                    timeout: 60000 // 60s timeout for initial attempt
                });
                logger.success('Repository cloned successfully (shallow)');
                return;
            } catch (error) {
                logger.warn('Shallow clone failed, falling back to full clone...');
                await fs.rm(targetDir, { recursive: true, force: true });
            }

            // Full clone with retry mechanism
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const timeout = attempt * 60000; // Increase timeout with each attempt
                    logger.info(`Clone attempt ${attempt}/${maxRetries} (timeout: ${timeout/1000}s)...`);
                    
                    execSync(`git clone ${cloneUrl} ${targetDir}`, {
                        stdio: 'inherit',
                        timeout
                    });
                    
                    logger.success('Repository cloned successfully');
                    return;
                } catch (error) {
                    if (attempt === maxRetries) {
                        throw error;
                    }
                    logger.warn(`Attempt ${attempt} failed, retrying...`);
                    await fs.rm(targetDir, { recursive: true, force: true });
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
                }
            }
        } catch (error) {
            if (error.message.includes('Authentication failed')) {
                throw new Error('Authentication failed. For private repositories, please set GITHUB_TOKEN environment variable');
            }
            if (error.message.includes('timeout')) {
                throw new Error('Repository clone timed out. The repository might be too large or the connection is slow');
            }
            throw new Error(`Failed to clone repository: ${error.message}`);
        }
    }

    async validateTemplate(templateDir) {
        try {
            // Try to load nodeforge.json if it exists
            const configPath = path.join(templateDir, 'nodeforge.json');
            let templateConfig;
            
            try {
                const configContent = await fs.readFile(configPath, 'utf-8');
                templateConfig = JSON.parse(configContent);
                logger.info('Found nodeforge.json configuration');
            } catch (error) {
                // If nodeforge.json doesn't exist, try to auto-detect project structure
                logger.info('No nodeforge.json found, auto-detecting project structure...');
                templateConfig = await this.detectProjectStructure(templateDir);
            }

            // Ensure minimum required configuration
            templateConfig = {
                name: path.basename(templateDir),
                version: '1.0.0',
                ...templateConfig,
                files: templateConfig.files || {},
                dependencies: templateConfig.dependencies || {},
                devDependencies: templateConfig.devDependencies || {}
            };

            // Validate the template structure
            const validation = await this.validateProjectStructure(templateDir, templateConfig);
            if (!validation.valid) {
                throw new Error(`Invalid template structure: ${validation.errors.join(', ')}`);
            }

            logger.success('Template validation successful');
            return {
                ...templateConfig,
                path: templateDir
            };
        } catch (error) {
            throw new Error(`Template validation failed: ${error.message}`);
        }
    }

    async detectProjectStructure(templateDir) {
        const config = {
            files: {},
            dependencies: {},
            devDependencies: {}
        };

        try {
            // Check for package.json
            const packageJsonPath = path.join(templateDir, 'package.json');
            try {
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
                config.dependencies = packageJson.dependencies || {};
                config.devDependencies = packageJson.devDependencies || {};
                logger.info('Detected Node.js project structure');
            } catch {
                logger.warn('No package.json found');
            }

            // Scan for common project files
            const commonFiles = [
                'src/**/*.{js,ts,jsx,tsx}',
                'public/**/*',
                'templates/**/*',
                '*.json',
                '*.js',
                '*.ts',
                '.env.example',
                '.gitignore'
            ];

            // Use glob to find files
            const { glob } = require('glob');
            for (const pattern of commonFiles) {
                const files = await glob(pattern, { cwd: templateDir, dot: true });
                for (const file of files) {
                    const fullPath = path.join(templateDir, file);
                    const stats = await fs.stat(fullPath);
                    if (stats.isFile()) {
                        config.files[file] = true;
                    }
                }
            }

            return config;
        } catch (error) {
            logger.error(`Project structure detection failed: ${error.message}`);
            throw error;
        }
    }

    async validateProjectStructure(templateDir, config) {
        const errors = [];
        
        // Check if there are any files detected
        if (Object.keys(config.files).length === 0) {
            errors.push('No valid template files found');
        }

        // Check for critical project files
        const criticalFiles = ['package.json'];
        for (const file of criticalFiles) {
            const fullPath = path.join(templateDir, file);
            try {
                await fs.access(fullPath);
            } catch {
                errors.push(`Missing critical file: ${file}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    async loadTemplateFiles(template) {
        const files = {};
        
        for (const [filePath] of Object.entries(template.files)) {
            const fullPath = path.join(template.path, filePath);
            const content = await fs.readFile(fullPath, 'utf-8');
            files[filePath] = content;
        }

        return {
            ...template,
            files
        };
    }

    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
        } catch (error) {
            logger.warn(`Failed to cleanup temporary files: ${error.message}`);
        }
    }
}

module.exports = new RemoteTemplateManager();
