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
        this.baseTemplates = new Map();
        this.mixins = new Map();
        this.hooks = [];
    }

    setVariable(key, value) {
        this.variables.set(key, value);
    }

    validateTemplateVersion(templateVersion) {
        const parseVersion = (version) => {
            const [major, minor, patch] = version.split('.').map(Number);
            return { major, minor, patch };
        };

        if (this.supportedVersions.includes(templateVersion)) {
            return true;
        }

        const current = parseVersion(this.version);
        const template = parseVersion(templateVersion);

        if (template.major !== current.major) {
            return false;
        }

        if (template.minor > current.minor) {
            return false;
        }

        if (template.minor === current.minor && template.patch > current.patch) {
            return false;
        }

        return true;
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
        Handlebars.registerHelper('capitalize', str => {
            return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
        });

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

        // Feature condition helpers
        Handlebars.registerHelper('hasFeature', function(feature, options) {
            return this.features?.[feature]?.enabled ? options.fn(this) : options.inverse(this);
        });

        // Environment condition helpers
        Handlebars.registerHelper('inEnvironment', function(env, options) {
            return this.env === env ? options.fn(this) : options.inverse(this);
        });

        // Template inheritance helpers
        Handlebars.registerHelper('extends', function(base, options) {
            return `{{#extends "${base}"}}${options.fn(this)}{{/extends}}`;
        });

        Handlebars.registerHelper('block', function(name, options) {
            return `{{#block "${name}"}}${options.fn(this)}{{/block}}`;
        });

        // Mixin helpers
        Handlebars.registerHelper('includeMixin', function(name, options) {
            const mixin = this.mixins?.get(name);
            return mixin ? options.fn(mixin) : '';
        });
    }

    registerBaseTemplate(name, template) {
        if (!name || !template) {
            throw new Error('Base template name and content are required');
        }
        this.baseTemplates.set(name, template);
    }

    registerMixin(name, mixin) {
        if (!name || !mixin) {
            throw new Error('Mixin name and content are required');
        }
        this.mixins.set(name, mixin);
    }

    async extendTemplate(template, baseName) {
        const baseTemplate = this.baseTemplates.get(baseName);
        if (!baseTemplate) {
            throw new Error(`Base template '${baseName}' not found`);
        }

        return {
            ...baseTemplate,
            ...template,
            files: {
                ...baseTemplate.files,
                ...template.files
            },
            dependencies: {
                ...baseTemplate.dependencies,
                ...template.dependencies
            },
            devDependencies: {
                ...baseTemplate.devDependencies,
                ...template.devDependencies
            },
            hooks: [
                ...(baseTemplate.hooks || []),
                ...(template.hooks || [])
            ],
            features: {
                ...baseTemplate.features,
                ...template.features
            }
        };
    }

    async applyMixins(template, mixinNames) {
        let result = { ...template };
        
        for (const mixinName of mixinNames) {
            const mixin = this.mixins.get(mixinName);
            if (!mixin) {
                throw new Error(`Mixin '${mixinName}' not found`);
            }

            result = {
                ...result,
                files: { ...result.files, ...mixin.files },
                dependencies: { ...result.dependencies, ...mixin.dependencies },
                devDependencies: { ...result.devDependencies, ...mixin.devDependencies },
                hooks: [...(result.hooks || []), ...(mixin.hooks || [])]
            };
        }

        return result;
    }

    async processTemplate(templateContent, context = {}) {
        try {
            this.registerTemplateHelpers();

            if (!templateContent) {
                throw new Error('Template content is null or undefined');
            }
            if (templateContent.trim().length === 0) {
                throw new Error('Template content is empty');
            }

            // Process template inheritance
            if (context.extends) {
                const baseTemplate = this.baseTemplates.get(context.extends);
                if (!baseTemplate) {
                    throw new Error(`Base template '${context.extends}' not found`);
                }
                templateContent = await this.processInheritance(baseTemplate, templateContent);
            }

            // Process mixins
            if (context.mixins) {
                templateContent = await this.processMixins(templateContent, context.mixins);
            }

            // Compile template with enhanced error handling
            const template = Handlebars.compile(templateContent, { 
                strict: true,
                noEscape: context.noEscape || false,
                knownHelpers: Object.keys(Handlebars.helpers),
                knownHelpersOnly: false
            });
            
            // Prepare context with enhanced features
            const templateData = {
                ...Object.fromEntries(this.variables),
                ...context,
                env: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                templateVersion: this.version,
                projectName: context.projectName || 'unnamed-project',
                features: context.features || {},
                meta: {
                    generatedAt: new Date().toISOString(),
                    templateProcessor: this.version,
                    template: context.template || 'custom',
                    inheritance: context.extends ? [context.extends] : [],
                    mixins: context.mixins || []
                }
            };

            // Process conditional sections
            const processedContent = template(templateData);

            if (!processedContent || processedContent.trim().length === 0) {
                throw new Error('Template processing resulted in empty content');
            }

            return processedContent;

        } catch (error) {
            logger.error(`Template processing failed: ${error.message}`);
            throw error;
        }
    }

    async processDirectoryWithInheritance(sourcePath, targetPath, context = {}) {
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
                        if (!file.name.endsWith('.tmpl') && !file.name.endsWith('.hbs')) {
                            await fs.copyFile(sourceFilePath, targetFilePath);
                            processedFiles.push({ 
                                path: targetFilePath, 
                                type: 'static',
                                original: sourceFilePath 
                            });
                            continue;
                        }

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
            throw error;
        }
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
        
        // Required fields validation
        const requiredFields = ['name', 'type', 'execute'];
        const missingFields = requiredFields.filter(field => !hook[field]);
        if (missingFields.length > 0) {
            throw new Error(`Invalid hook: Missing required fields: ${missingFields.join(', ')}`);
        }

        if (typeof hook.execute !== 'function') {
            throw new Error(`Invalid hook ${hook.name}: Missing execute function`);
        }

        // Type validation
        const validTypes = ['pre-process', 'post-process', 'pre-install', 'post-install'];
        if (!validTypes.includes(hook.type)) {
            throw new Error(`Invalid hook ${hook.name}: Type must be one of ${validTypes.join(', ')}`);
        }

        // Optional fields validation
        if (hook.priority !== undefined) {
            if (typeof hook.priority !== 'number' || hook.priority < 0) {
                throw new Error(`Invalid hook ${hook.name}: Priority must be a non-negative number`);
            }
        }

        if (hook.critical !== undefined && typeof hook.critical !== 'boolean') {
            throw new Error(`Invalid hook ${hook.name}: Critical flag must be a boolean`);
        }

        // Validate conditions if present
        if (hook.condition) {
            if (typeof hook.condition !== 'function') {
                throw new Error(`Invalid hook ${hook.name}: Condition must be a function`);
            }
        }

        // Validate timeout if present
        if (hook.timeout !== undefined) {
            if (typeof hook.timeout !== 'number' || hook.timeout <= 0) {
                throw new Error(`Invalid hook ${hook.name}: Timeout must be a positive number`);
            }
        }

        // Validate dependencies if present
        if (hook.dependencies) {
            if (!Array.isArray(hook.dependencies)) {
                throw new Error(`Invalid hook ${hook.name}: Dependencies must be an array`);
            }
            hook.dependencies.forEach(dep => {
                if (typeof dep !== 'string') {
                    throw new Error(`Invalid hook ${hook.name}: Each dependency must be a string`);
                }
            });
        }
    }

    async runPostInstallHooks(hooks, projectPath, context = {}) {
        if (!Array.isArray(hooks)) {
            logger.warn('No hooks provided or invalid hooks array');
            return [];
        }

        const results = [];
        const validatedHooks = [];
        const hooksByName = new Map();

        // Validate all hooks first
        for (const hook of hooks) {
            try {
                await this.validateHook(hook);
                validatedHooks.push(hook);
                hooksByName.set(hook.name, hook);
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

        // Check dependencies
        for (const hook of validatedHooks) {
            if (hook.dependencies) {
                for (const depName of hook.dependencies) {
                    if (!hooksByName.has(depName)) {
                        throw new Error(`Hook ${hook.name} depends on missing hook: ${depName}`);
                    }
                }
            }
        }

        // Sort hooks by priority and dependencies
        const sortedHooks = this.sortHooksByDependencies(validatedHooks);
        
        // Execute hooks in order
        for (const hook of sortedHooks) {
            logger.info(`Processing hook: ${hook.name} (priority: ${hook.priority || 0})`);
            
            // Check conditions
            if (hook.condition) {
                try {
                    const shouldRun = await Promise.resolve(hook.condition(context));
                    if (!shouldRun) {
                        logger.info(`Skipping hook ${hook.name}: condition not met`);
                        continue;
                    }
                } catch (error) {
                    logger.error(`Hook ${hook.name} condition evaluation failed: ${error.message}`);
                    if (hook.critical) throw error;
                    continue;
                }
            }

            const hookContext = {
                ...context,
                results: [...results],
                timestamp: new Date().toISOString(),
                projectPath,
                hookName: hook.name
            };

            try {
                // Execute with timeout if specified
                const startTime = Date.now();
                const executePromise = hook.execute(projectPath, hookContext);
                
                const result = hook.timeout
                    ? await Promise.race([
                        executePromise,
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error(`Hook execution timed out after ${hook.timeout}ms`)), 
                            hook.timeout)
                        )
                    ])
                    : await executePromise;

                const duration = Date.now() - startTime;

                results.push({
                    hook: hook.name,
                    success: true,
                    result,
                    duration,
                    timestamp: new Date().toISOString(),
                    condition: hook.condition ? 'met' : 'none'
                });

                logger.info(`Hook ${hook.name} completed successfully (${duration}ms)`);
            } catch (error) {
                const errorResult = {
                    hook: hook.name,
                    success: false,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString(),
                    stage: 'execution',
                    condition: hook.condition ? 'met' : 'none'
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

    sortHooksByDependencies(hooks) {
        const graph = new Map();
        const visited = new Set();
        const temp = new Set();
        const order = [];

        // Build dependency graph
        hooks.forEach(hook => {
            graph.set(hook.name, {
                hook,
                deps: hook.dependencies || []
            });
        });

        // Topological sort with cycle detection
        function visit(hookName) {
            if (temp.has(hookName)) {
                throw new Error(`Circular dependency detected: ${hookName}`);
            }
            if (visited.has(hookName)) return;

            temp.add(hookName);
            const node = graph.get(hookName);
            node.deps.forEach(dep => visit(dep));
            temp.delete(hookName);
            visited.add(hookName);
            order.unshift(node.hook);
        }

        hooks.forEach(hook => {
            if (!visited.has(hook.name)) {
                visit(hook.name);
            }
        });

        // Sort hooks with same dependencies by priority
        return order.sort((a, b) => {
            const aDeps = a.dependencies || [];
            const bDeps = b.dependencies || [];
            if (aDeps.includes(b.name)) return 1;
            if (bDeps.includes(a.name)) return -1;
            return (a.priority || 0) - (b.priority || 0);
        });
    }
    async processConditionalSections(template, context) {
        const processedFiles = {};

        for (const [path, content] of Object.entries(template.files)) {
            // Process conditional sections in content
            const processedContent = await this.processTemplate(content, {
                ...context,
                features: template.features,
                env: process.env.NODE_ENV || 'development'
            });

            if (processedContent.trim()) {
                processedFiles[path] = processedContent;
            }
        }

        return {
            ...template,
            files: processedFiles
        };
    }
}

module.exports = { TemplateProcessor };