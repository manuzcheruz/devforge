const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const { defaultConfig } = require('../config/defaults');

class RemoteTemplateManager {
    constructor() {
        // Use absolute path for temp directory
        this.tempDir = path.resolve(process.cwd(), '.nodeforge', 'templates');
        // Ensure temp directory exists on initialization
        this.initTempDir().catch(error => {
            logger.error(`Failed to initialize temp directory: ${error.message}`);
        });
    }

    async initTempDir() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            logger.info(`Initialized temp directory at: ${this.tempDir}`);
        } catch (error) {
            throw new Error(`Failed to create temp directory: ${error.message}`);
        }
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

    isValidGitUrl(url) {
        const gitUrlPattern = /^(https?:\/\/)?([\w.-]+)\/([^\/]+)\/([^\/]+)(\.git)?$/;
        return gitUrlPattern.test(url);
    }

    getAuthenticatedUrl(repositoryUrl) {
        const isGitHubUrl = /github\.com/.test(repositoryUrl);
        const gitToken = process.env.GITHUB_TOKEN;
        
        if (isGitHubUrl && gitToken) {
            const urlParts = repositoryUrl.split('://');
            return {
                cloneUrl: `https://${gitToken}@${urlParts[1]}`,
                authType: 'token'
            };
        }
        
        return {
            cloneUrl: repositoryUrl,
            authType: 'anonymous'
        };
    }

    getRepoName(repositoryUrl) {
        const urlParts = repositoryUrl.split('/');
        const repoName = urlParts[urlParts.length - 1].replace('.git', '');
        return repoName;
    }

    async cloneRepository(repositoryUrl, targetDir) {
        try {
            logger.info(`Starting repository clone process for ${repositoryUrl}`);
            
            // Remove existing directory if it exists
            await fs.rm(targetDir, { recursive: true, force: true });
            
            // Parse repository URL and ensure it's a valid Git URL
            if (!this.isValidGitUrl(repositoryUrl)) {
                throw new Error('Invalid Git repository URL');
            }
            
            // Setup authentication if needed
            const { cloneUrl, authType } = this.getAuthenticatedUrl(repositoryUrl);
            logger.info(`Using ${authType} authentication`);
            
            // Create parent directory
            await fs.mkdir(path.dirname(targetDir), { recursive: true });
            
            // Try shallow clone first (faster)
            logger.info('Attempting shallow clone...');
            try {
                const output = execSync(`git clone --depth 1 ${cloneUrl} "${targetDir}"`, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    encoding: 'utf8',
                    timeout: 30000 // 30s timeout for initial attempt
                });
                logger.info(`Clone output: ${output}`);
                logger.success('Repository cloned successfully (shallow)');
                return;
            } catch (error) {
                logger.warn(`Shallow clone failed: ${error.message}`);
                if (error.stderr) logger.warn(`Error details: ${error.stderr}`);
                await fs.rm(targetDir, { recursive: true, force: true });
            }

            // Full clone with retry mechanism
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const timeout = attempt * 45000; // 45s timeout, increases with each attempt
                    logger.info(`Full clone attempt ${attempt}/${maxRetries} (timeout: ${timeout/1000}s)...`);
                    
                    const output = execSync(`git clone ${cloneUrl} "${targetDir}"`, {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        encoding: 'utf8',
                        timeout
                    });
                    logger.info(`Clone output: ${output}`);
                    
                    // Verify the clone was successful by checking if the directory contains files
                    const files = await fs.readdir(targetDir);
                    if (files.length === 0) {
                        throw new Error('Repository appears to be empty');
                    }
                    
                    logger.success('Repository cloned successfully (full)');
                    return;
                } catch (error) {
                    const errorMsg = error.message.toLowerCase();
                    if (error.stderr) logger.warn(`Error details: ${error.stderr}`);
                    
                    if (errorMsg.includes('authentication') || errorMsg.includes('403')) {
                        throw new Error('Authentication failed. Please check your credentials.');
                    }
                    
                    if (attempt === maxRetries) {
                        throw error;
                    }
                    
                    logger.warn(`Attempt ${attempt} failed: ${error.message}`);
                    await fs.rm(targetDir, { recursive: true, force: true });
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
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
