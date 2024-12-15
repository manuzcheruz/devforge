const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { logger } = require('../utils/logger');

class TemplateRegistry {
    constructor() {
        this.templates = new Map();
        this.registryPath = path.join(process.cwd(), '.nodeforge', 'registry.json');
    }

    async initialize() {
        try {
            await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
            try {
                const data = await fs.readFile(this.registryPath, 'utf-8');
                const registry = JSON.parse(data);
                this.templates = new Map(Object.entries(registry));
            } catch (error) {
                // Registry file doesn't exist or is invalid, start fresh
                await this.saveRegistry();
            }
        } catch (error) {
            logger.error(`Failed to initialize registry: ${error.message}`);
            throw error;
        }
    }

    async saveRegistry() {
        try {
            const registry = Object.fromEntries(this.templates);
            await fs.writeFile(this.registryPath, JSON.stringify(registry, null, 2));
        } catch (error) {
            logger.error(`Failed to save registry: ${error.message}`);
            throw error;
        }
    }

    async addTemplate(url, metadata = {}) {
        try {
            const templateId = this.generateTemplateId(url);
            const validation = await this.validateTemplate(url);

            if (!validation.isValid) {
                throw new Error(validation.error);
            }

            const template = {
                id: templateId,
                url,
                metadata: {
                    ...validation.metadata,
                    ...metadata
                },
                verified: true,
                addedAt: new Date().toISOString()
            };

            this.templates.set(templateId, template);
            await this.saveRegistry();

            return template;
        } catch (error) {
            logger.error(`Failed to add template: ${error.message}`);
            throw error;
        }
    }

    async validateTemplate(url) {
        let tempDir = null;
        try {
            logger.info(`Validating template from URL: ${url}`);
            // Create temporary directory for validation
            tempDir = path.join(os.tmpdir(), `template-${Date.now()}`);
            await fs.mkdir(tempDir, { recursive: true });

            try {
                // Format GitHub URL with token authentication if needed
                let cloneUrl = url;
                if (url.startsWith('https://github.com/')) {
                    const token = process.env.GITHUB_TOKEN;
                    if (!token) {
                        throw new Error('GitHub token is required for accessing GitHub repositories');
                    }
                    // Format URL with token, ensuring proper encoding
                    const encodedToken = encodeURIComponent(token);
                    cloneUrl = url.replace('https://github.com/', `https://${encodedToken}@github.com/`);
                    logger.debug('Using authenticated GitHub URL for validation');
                }

                // Clone repository for validation with improved error handling
                logger.debug('Cloning repository for validation...');
                execSync(`git clone --depth 1 "${cloneUrl}" "${tempDir}"`, { 
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: { 
                        ...process.env, 
                        GIT_TERMINAL_PROMPT: '0',
                        GIT_ASKPASS: 'echo',
                        GIT_SSL_NO_VERIFY: '1',
                        GIT_CONFIG_PARAMETERS: "'credential.helper='"
                    }
                });
                logger.success('Repository cloned successfully for validation');

                // Look for template structure in root and common subdirectories
                const commonDirs = ['', 'template', 'templates', 'src'];
                const result = {
                    isValid: false,
                    error: null,
                    metadata: {}
                };

                const errors = [];
                
                for (const subDir of commonDirs) {
                    const checkDir = path.join(tempDir, subDir);
                    
                    try {
                        const files = await fs.readdir(checkDir, { withFileTypes: true });
                        const foundFiles = new Set(files.map(f => f.name));
                        
                        if (foundFiles.has('package.json')) {
                            const packageJson = JSON.parse(
                                await fs.readFile(path.join(checkDir, 'package.json'), 'utf-8')
                            );
                            
                            if (await this.validateTemplateFiles(checkDir)) {
                                result.isValid = true;
                                result.metadata = {
                                    name: packageJson.name,
                                    version: packageJson.version,
                                    description: packageJson.description,
                                    templatePath: subDir,
                                    type: this.detectTemplateType(checkDir, files),
                                    engineVersion: packageJson.engines?.node || '*'
                                };
                                logger.info(`Valid template structure found in: ${subDir || 'root'}`);
                                result.files = Array.from(foundFiles);
                                break;
                            } else {
                                errors.push(`Directory ${subDir || 'root'} has package.json but missing required template files`);
                            }
                        }
                    } catch (error) {
                        errors.push(`Failed to access ${subDir}: ${error.message}`);
                        continue;
                    }
                }

                if (!result.isValid) {
                    result.error = errors.length > 0 
                        ? `Template validation failed:\n${errors.join('\n')}`
                        : 'No valid template structure found';
                }

                return result;
            } finally {
                // Cleanup temporary directory
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        } catch (error) {
            return {
                isValid: false,
                error: error.message,
                metadata: {}
            };
        }
    }

    async validateTemplateFiles(templateDir) {
        try {
            // Check for essential template files
            const requiredFiles = ['package.json'];
            const optionalFiles = [
                'README.md',
                '.gitignore',
                'tsconfig.json',
                '.eslintrc',
                '.prettierrc'
            ];
            
            let hasRequiredFiles = true;
            for (const file of requiredFiles) {
                try {
                    await fs.access(path.join(templateDir, file));
                } catch (error) {
                    hasRequiredFiles = false;
                    break;
                }
            }
            
            // Check for source files
            const entries = await fs.readdir(templateDir, { withFileTypes: true });
            const hasSourceFiles = entries.some(entry => 
                entry.isDirectory() && ['src', 'lib', 'app'].includes(entry.name) ||
                entry.isFile() && entry.name.match(/\.(js|ts|jsx|tsx)$/)
            );
            
            return hasRequiredFiles && hasSourceFiles;
        } catch (error) {
            logger.error(`Template file validation failed: ${error.message}`);
            return false;
        }
    }

    detectTemplateType(templateDir, files) {
        // Detect template type based on files and dependencies
        const fileNames = files.map(f => f.name);
        
        if (fileNames.includes('express.js') || fileNames.includes('app.js')) {
            return 'express';
        } else if (fileNames.includes('next.config.js')) {
            return 'next';
        } else if (fileNames.includes('gatsby-config.js')) {
            return 'gatsby';
        } else if (fileNames.includes('vue.config.js')) {
            return 'vue';
        } else {
            return 'generic';
        }
    }

    generateTemplateId(url) {
        return Buffer.from(url).toString('base64').replace(/[/+=]/g, '_');
    }

    getTemplate(id) {
        return this.templates.get(id);
    }

    getAllTemplates() {
        return Array.from(this.templates.values());
    }

    async removeTemplate(id) {
        const removed = this.templates.delete(id);
        if (removed) {
            await this.saveRegistry();
        }
        return removed;
    }
}

module.exports = new TemplateRegistry();