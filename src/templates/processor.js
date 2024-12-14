const { logger } = require('../utils/logger');
const { validateConfig } = require('../utils/validator');
const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

class TemplateProcessor {
    constructor() {
        this.variables = new Map();
        this.version = '1.0.0';
        this.supportedVersions = ['1.0.0'];
    }
    async migrateTemplate(template) {
        if (!template.version) {
            throw new Error('Template version is required');
        }

        // Don't migrate if versions match
        if (template.version === this.version) {
            return template;
        }

        // Check if migration is possible
        if (!this.validateTemplateVersion(template.version)) {
            throw new Error(`Cannot migrate template from version ${template.version} to ${this.version}`);
        }

        // Apply version-specific migrations
        const migrations = {
            '1.0.0': (tmpl) => {
                // Add new required fields for version 1.0.0
                return {
                    ...tmpl,
                    features: tmpl.features || {},
                    hooks: tmpl.hooks || []
                };
            }
        };

        let migratedTemplate = { ...template };
        for (const version of this.supportedVersions) {
            if (migrations[version]) {
                migratedTemplate = migrations[version](migratedTemplate);
            }
        }

        migratedTemplate.version = this.version;
        return migratedTemplate;
    }


    setVariable(key, value) {
        this.variables.set(key, value);
    }

    validateTemplateVersion(templateVersion) {
        // Parse version numbers for comparison
        const parseVersion = (version) => {
            const [major, minor, patch] = version.split('.').map(Number);
            return { major, minor, patch };
        };

        // Check if version is in supported versions list
        if (this.supportedVersions.includes(templateVersion)) {
            return true;
        }

        // Compare version numbers
        const current = parseVersion(this.version);
        const template = parseVersion(templateVersion);

        // Major version must match
        if (template.major !== current.major) {
            return false;
        }

        // Minor version must be less than or equal
        if (template.minor > current.minor) {
            return false;
        }

        // If minor versions match, patch must be less than or equal
        if (template.minor === current.minor && template.patch > current.patch) {
            return false;
        }

        return true;
    }

    async validateTemplate(template) {
        try {
            if (!template || typeof template !== 'object') {
                throw new Error('Template must be a valid object');
            }

            // Check version compatibility
            if (!template.version || !this.validateTemplateVersion(template.version)) {
                throw new Error(`Unsupported template version: ${template.version || 'unknown'}`);
            }

            // Validate files structure
            if (!template.files || typeof template.files !== 'object') {
                throw new Error('Template must include a valid files object');
            }

            // Check for invalid file paths
            for (const filePath of Object.keys(template.files)) {
                if (!/^[a-zA-Z0-9\-_/.]+$/.test(filePath)) {
                    throw new Error(`Invalid file path in template: ${filePath}`);
                }
                if (typeof template.files[filePath] !== 'string') {
                    throw new Error(`File content must be a string: ${filePath}`);
                }
            }

            // Validate required fields
            const requiredFields = ['name', 'description', 'dependencies'];
            const missingFields = requiredFields.filter(field => !(field in template));
            if (missingFields.length > 0) {
                throw new Error(`Template missing required fields: ${missingFields.join(', ')}`);
            }

            // Validate template name
            if (!/^[a-zA-Z0-9-]+$/.test(template.name)) {
                throw new Error(`Invalid template name: ${template.name}`);
            }

            // Validate dependencies
            if (typeof template.dependencies !== 'object') {
                throw new Error('Dependencies must be an object');
            }

            for (const [dep, version] of Object.entries(template.dependencies)) {
                if (typeof version !== 'string') {
                    throw new Error(`Invalid version for dependency ${dep}: ${version}`);
                }
                if (!/^(\^|~)?(\d+\.\d+\.\d+|latest|\*)$/.test(version)) {
                    throw new Error(`Invalid version format for dependency ${dep}: ${version}`);
                }
            }

            return true;
        } catch (error) {
            logger.error(`Template validation failed: ${error.message}`);
            error.details = template; // Attach template details for debugging
            throw error;
        }
    }

    async processTemplate(templateContent, context = {}, hooks = []) {
        try {
            // Register essential helpers
            this.registerTemplateHelpers();

            // Pre-process validation with detailed error message
            if (!templateContent) {
                throw new Error('Template content is null or undefined');
            }
            if (templateContent.trim().length === 0) {
                throw new Error('Template content is empty');
            }

            let currentContent = templateContent;
            let hookResults = new Map();

            // Execute pre-process hooks with better error handling
            const preProcessHooks = hooks.filter(h => h.type === 'pre-process')
                .sort((a, b) => (a.priority || 0) - (b.priority || 0));

            for (const hook of preProcessHooks) {
                try {
                    logger.info(`Executing pre-process hook: ${hook.name}`);
                    const startTime = Date.now();
                    
                    const hookContent = await hook.execute(currentContent, context);
                    const executionTime = Date.now() - startTime;
                    
                    if (!hookContent) {
                        throw new Error('Hook returned empty content');
                    }
                    
                    currentContent = hookContent;
                    hookResults.set(hook.name, { 
                        success: true, 
                        executionTime,
                        contentLength: hookContent.length 
                    });
                } catch (hookError) {
                    logger.error(`Pre-process hook ${hook.name} failed: ${hookError.message}`);
                    hookResults.set(hook.name, { 
                        success: false, 
                        error: hookError.message 
                    });
                    
                    if (hook.critical) {
                        const error = new Error(`Critical pre-process hook ${hook.name} failed: ${hookError.message}`);
                        error.hookResults = Object.fromEntries(hookResults);
                        throw error;
                    }
                }
            }

            // Compile and process template with enhanced error handling
            try {
                logger.info('Compiling template...');
                const template = Handlebars.compile(currentContent, { 
                    strict: true,
                    noEscape: context.noEscape || false,
                    knownHelpers: Object.keys(Handlebars.helpers),
                    knownHelpersOnly: false
                });
                
                const templateData = {
                    ...Object.fromEntries(this.variables),
                    ...context,
                    env: process.env.NODE_ENV || 'development',
                    timestamp: new Date().toISOString(),
                    version: process.env.npm_package_version || '1.0.0',
                    templateVersion: this.version,
                    projectName: context.projectName || 'unnamed-project',
                    meta: {
                        generatedAt: new Date().toISOString(),
                        templateProcessor: this.version
                    }
                };

                logger.info('Processing template with data...');
                const processedContent = template(templateData);

                if (!processedContent || processedContent.trim().length === 0) {
                    throw new Error('Template processing resulted in empty content');
                }

                // Execute post-process hooks with enhanced error handling
                const postProcessHooks = hooks.filter(h => h.type === 'post-process')
                    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

                let finalContent = processedContent;
                
                for (const hook of postProcessHooks) {
                    try {
                        logger.info(`Executing post-process hook: ${hook.name}`);
                        const startTime = Date.now();
                        
                        const hookResult = await hook.execute(finalContent, context);
                        const executionTime = Date.now() - startTime;
                        
                        if (hookResult) {
                            finalContent = hookResult;
                        }
                        
                        hookResults.set(hook.name, { 
                            success: true, 
                            executionTime,
                            contentLength: finalContent.length 
                        });
                    } catch (hookError) {
                        logger.error(`Post-process hook ${hook.name} failed: ${hookError.message}`);
                        hookResults.set(hook.name, { 
                            success: false, 
                            error: hookError.message 
                        });
                        
                        if (hook.critical) {
                            const error = new Error(`Critical post-process hook ${hook.name} failed: ${hookError.message}`);
                            error.hookResults = Object.fromEntries(hookResults);
                            throw error;
                        }
                    }
                }

                logger.info('Template processing completed successfully');
                return finalContent;
            } catch (templateError) {
                const error = new Error(`Template compilation failed: ${templateError.message}`);
                error.hookResults = Object.fromEntries(hookResults);
                error.template = {
                    length: currentContent.length,
                    preview: currentContent.substring(0, 100) + '...'
                };
                throw error;
            }
        } catch (error) {
            logger.error(`Template processing failed: ${error.message}`);
            if (error.hookResults) {
                logger.error('Hook execution results:', error.hookResults);
            }
            throw error;
        }
    }

    registerTemplateHelpers() {
        // Comparison helpers
        Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
            return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
        });
        
        Handlebars.registerHelper('ifNotEquals', function(arg1, arg2, options) {
            return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
        });

        // String manipulation helpers
        Handlebars.registerHelper('toLowerCase', str => str?.toLowerCase());
        Handlebars.registerHelper('toUpperCase', str => str?.toUpperCase());
        Handlebars.registerHelper('capitalize', str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '');

        // Version helpers
        Handlebars.registerHelper('templateVersion', () => this.version);
        Handlebars.registerHelper('requiresVersion', (version, options) => {
            return this.validateTemplateVersion(version) ? options.fn(this) : options.inverse(this);
        });

        // Array helpers
        Handlebars.registerHelper('join', (arr, separator) => arr?.join(separator || ', '));
        Handlebars.registerHelper('each_with_index', function(arr, options) {
            return arr?.map((item, index) => options.fn({ item, index })).join('') || '';
        });
    }

    async processDirectory(sourcePath, targetPath, context = {}) {
        try {
            const files = await fs.readdir(sourcePath, { withFileTypes: true });
            const processedFiles = [];
            const errors = [];
            
            for (const file of files) {
                const sourceFilePath = path.join(sourcePath, file.name);
                const targetFilePath = path.join(targetPath, file.name);
                
                try {
                    if (file.isDirectory()) {
                        await fs.mkdir(targetFilePath, { recursive: true });
                        const subDirResults = await this.processDirectory(sourceFilePath, targetFilePath, context);
                        processedFiles.push(...subDirResults.processedFiles);
                        errors.push(...subDirResults.errors);
                    } else {
                        // Skip non-template files
                        if (!file.name.endsWith('.tmpl') && !file.name.endsWith('.hbs')) {
                            await fs.copyFile(sourceFilePath, targetFilePath);
                            processedFiles.push({ 
                                path: targetFilePath, 
                                type: 'static',
                                original: sourceFilePath 
                            });
                            continue;
                        }

                        // Process template files
                        const content = await fs.readFile(sourceFilePath, 'utf-8');
                        const processedContent = await this.processTemplate(content, context);
                        const finalPath = targetFilePath.replace(/\.(tmpl|hbs)$/, '');
                        await fs.writeFile(finalPath, processedContent);
                        processedFiles.push({ 
                            path: finalPath, 
                            type: 'template',
                            original: sourceFilePath 
                        });
                    }
                } catch (fileError) {
                    logger.error(`Failed to process ${sourceFilePath}: ${fileError.message}`);
                    errors.push({
                        file: sourceFilePath,
                        error: fileError.message,
                        stack: fileError.stack
                    });
                }
            }
            
            return {
                processedFiles,
                errors,
                success: errors.length === 0
            };
        } catch (error) {
            logger.error(`Directory processing failed: ${error.message}`);
            throw new Error(`Failed to process directory ${sourcePath}: ${error.message}`);
        }
    }

    async validateHook(hook) {
        if (!hook || typeof hook !== 'object') {
            throw new Error('Invalid hook: Hook must be an object');
        }
        
        if (!hook.name) {
            throw new Error('Invalid hook: Hook must have a name');
        }
        
        if (typeof hook.execute !== 'function') {
            throw new Error(`Invalid hook ${hook.name}: Missing execute function`);
        }
        
        const validTypes = ['pre-process', 'post-process', 'pre-install', 'post-install'];
        if (!validTypes.includes(hook.type)) {
            throw new Error(`Invalid hook ${hook.name}: Type must be one of ${validTypes.join(', ')}`);
        }
        
        if (hook.priority !== undefined && typeof hook.priority !== 'number') {
            throw new Error(`Invalid hook ${hook.name}: Priority must be a number`);
        }
        
        if (hook.critical !== undefined && typeof hook.critical !== 'boolean') {
            throw new Error(`Invalid hook ${hook.name}: Critical flag must be a boolean`);
        }
    }

    async runPostInstallHooks(hooks, projectPath, context = {}) {
        if (!Array.isArray(hooks)) {
            logger.warn('No hooks provided or invalid hooks array');
            return [];
        }

        const results = [];
        const validatedHooks = [];

        // Validate all hooks first
        for (const hook of hooks) {
            try {
                await this.validateHook(hook);
                validatedHooks.push(hook);
            } catch (error) {
                logger.error(`Hook validation failed: ${error.message}`);
                results.push({
                    hook: hook.name || 'anonymous',
                    success: false,
                    error: error.message,
                    stage: 'validation'
                });
            }
        }

        // Sort hooks by priority
        const sortedHooks = validatedHooks.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        
        // Execute hooks in order
        for (const hook of sortedHooks) {
            logger.info(`Executing hook: ${hook.name} (priority: ${hook.priority || 0})`);
            
            const hookContext = {
                ...context,
                results: [...results],
                timestamp: new Date().toISOString(),
                projectPath,
                hookName: hook.name
            };

            try {
                const startTime = Date.now();
                const result = await hook.execute(projectPath, hookContext);
                const duration = Date.now() - startTime;

                results.push({
                    hook: hook.name,
                    success: true,
                    result,
                    duration,
                    timestamp: new Date().toISOString()
                });

                logger.info(`Hook ${hook.name} completed successfully (${duration}ms)`);
            } catch (error) {
                const errorResult = {
                    hook: hook.name,
                    success: false,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString(),
                    stage: 'execution'
                };
                
                results.push(errorResult);
                logger.error(`Hook ${hook.name} failed: ${error.message}`);

                if (hook.critical) {
                    throw new Error(`Critical hook ${hook.name} failed: ${error.message}`);
                }
            }
        }

        return results;
    }
}

module.exports = { TemplateProcessor };
