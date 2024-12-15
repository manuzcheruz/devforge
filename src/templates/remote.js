const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const os = require('os');
const registry = require('./registry');

class RemoteTemplateManager {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), '.nodeforge-remote-templates');
    }

    async fetchTemplate(url, metadata = {}) {
        logger.info(`Fetching remote template from: ${url}`);
        
        try {
            // Initialize registry if not already initialized
            await registry.initialize();
            
            // Add template to registry if not exists
            const templateId = registry.generateTemplateId(url);
            let template = registry.getTemplate(templateId);
            
            if (!template) {
                template = await registry.addTemplate(url, metadata);
                logger.info('Template added to registry');
            } else if (!template.verified) {
                // Verify template if it exists but not verified
                const verified = await registry.verifyTemplate(template);
                if (!verified) {
                    throw new Error('Template verification failed');
                }
            }
            
            // Create temp directory for template
            await fs.mkdir(this.tempDir, { recursive: true });
            const targetDir = path.join(this.tempDir, `template-${Date.now()}`);
            
            // Clone verified template using authentication if available
            logger.info('Cloning template repository...');
            
            // Format GitHub URL with token authentication
            let gitUrl = url;
            if (url.startsWith('https://github.com/')) {
                const token = process.env.GITHUB_TOKEN;
                if (!token) {
                    throw new Error('GitHub token is required for accessing GitHub repositories. Please set GITHUB_TOKEN environment variable.');
                }
                // Format URL with token, ensuring proper encoding
                const encodedToken = encodeURIComponent(token);
                gitUrl = url.replace('https://github.com/', `https://${encodedToken}@github.com/`);
                logger.debug('Using authenticated GitHub URL');
            }
            
            try {
                logger.debug('Attempting to clone repository...');
                // Enhanced git clone with better error handling and auth configuration
                execSync(`git clone --depth 1 "${gitUrl}" "${targetDir}"`, { 
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: { 
                        ...process.env, 
                        GIT_TERMINAL_PROMPT: '0',
                        GIT_ASKPASS: 'echo',
                        GIT_SSL_NO_VERIFY: '1',
                        GIT_CONFIG_PARAMETERS: "'credential.helper='"
                    }
                });
                logger.success('Repository cloned successfully');
            } catch (error) {
                logger.error(`Failed to clone repository: ${error.message}`);
                if (error.message.toLowerCase().includes('authentication failed')) {
                    throw new Error('GitHub authentication failed. Please verify your GITHUB_TOKEN is valid and has sufficient permissions.');
                } else if (error.message.toLowerCase().includes('not found')) {
                    throw new Error('Repository not found. Please verify the URL is correct and the repository exists.');
                } else if (error.message.toLowerCase().includes('ssl')) {
                    throw new Error('SSL verification failed. Please check your network connection and SSL certificates.');
                }
                throw new Error(`Failed to clone repository: ${error.message}`);
            }
            
            // Load template files from the correct directory
            const templatePath = template.metadata.templatePath || '';
            const templateDir = path.join(targetDir, templatePath);
            const templateFiles = await this.loadTemplateFiles(templateDir);
            
            return {
                ...template,
                files: templateFiles
            };
        } catch (error) {
            logger.error(`Failed to fetch template: ${error.message}`);
            throw error;
        }
    }

    async validateTemplate(templateDir) {
        try {
            // Check for package.json
            await fs.access(path.join(templateDir, 'package.json'));
            return true;
        } catch {
            return false;
        }
    }

    async loadTemplate(templateDir) {
        try {
            logger.info('Loading template configuration...');
            
            // Read package.json
            const packageJsonPath = path.join(templateDir, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
            
            // Basic template metadata
            const template = {
                name: packageJson.name,
                version: packageJson.version,
                description: packageJson.description,
                dependencies: packageJson.dependencies || {},
                devDependencies: packageJson.devDependencies || {},
                files: await this.loadTemplateFiles(templateDir)
            };
            
            return template;
        } catch (error) {
            logger.error(`Failed to load template: ${error.message}`);
            throw error;
        }
    }

    async loadTemplateFiles(templateDir) {
        const files = {};
        const ignoredPatterns = [
            'node_modules',
            '.git',
            'coverage',
            'dist',
            'build'
        ];
        
        try {
            const readDirRecursive = async (dir, baseDir = '') => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativePath = path.join(baseDir, entry.name);
                    
                    // Skip ignored directories and files
                    if (ignoredPatterns.some(pattern => entry.name.includes(pattern))) {
                        continue;
                    }
                    
                    if (entry.isDirectory()) {
                        await readDirRecursive(fullPath, relativePath);
                    } else {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        files[relativePath] = content;
                    }
                }
            };
            
            await readDirRecursive(templateDir);
            logger.info(`Loaded ${Object.keys(files).length} template files`);
            return files;
        } catch (error) {
            logger.error(`Failed to load template files: ${error.message}`);
            throw error;
        }
    }

    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
            logger.info('Cleaned up temporary files');
        } catch (error) {
            logger.warn(`Failed to clean up: ${error.message}`);
        }
    }
}

module.exports = new RemoteTemplateManager();