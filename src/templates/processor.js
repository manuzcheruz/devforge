const { logger } = require('../utils/logger');
const { validateConfig } = require('../utils/validator');
const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

class TemplateProcessor {
    constructor() {
        this.version = '1.0.0';
        this.variables = new Map();
        this.baseTemplates = new Map();
        this.mixins = new Map();
        this.registerTemplateHelpers();
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

        // Variable helpers
        Handlebars.registerHelper('getVar', (name, defaultValue) => {
            return this.variables.get(name) || defaultValue;
        });

        Handlebars.registerHelper('hasVar', (name, options) => {
            return this.variables.has(name) ? options.fn(this) : options.inverse(this);
        });
    }

    async validateVariables(variables, schema = null) {
        try {
            // If no schema provided, perform basic type validation
            if (!schema) {
                return Object.entries(variables).reduce((acc, [key, value]) => {
                    // Coerce boolean strings
                    if (value === 'true' || value === 'false') {
                        acc[key] = value === 'true';
                    }
                    // Coerce numeric strings
                    else if (!isNaN(value) && value.trim() !== '') {
                        acc[key] = Number(value);
                    }
                    // Keep strings as is
                    else {
                        acc[key] = value;
                    }
                    return acc;
                }, {});
            }

            // Use provided schema for validation
            return schema.parse(variables);
        } catch (error) {
            logger.error(`Variable validation failed: ${error.message}`);
            throw error;
        }
    }

    setVariable(key, value) {
        this.variables.set(key, value);
        return true;
    }

    async processTemplate(templateContent, context = {}) {
        try {
            // Validate and process variables
            if (context.variables) {
                const validatedVars = await this.validateVariables(
                    context.variables,
                    context.variableSchema
                );
                Object.entries(validatedVars).forEach(([key, value]) => {
                    this.setVariable(key, value);
                });
            }

            if (!templateContent) {
                throw new Error('Template content is null or undefined');
            }

            // Compile template with enhanced error handling
            const template = Handlebars.compile(templateContent, { 
                strict: true,
                noEscape: context.noEscape || false
            });
            
            // Prepare context with enhanced features
            const templateData = {
                ...Object.fromEntries(this.variables),
                ...context,
                env: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                templateVersion: this.version
            };

            return template(templateData);

        } catch (error) {
            logger.error(`Template processing failed: ${error.message}`);
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
                        const content = await fs.readFile(sourceFilePath, 'utf-8');
                        const processedContent = await this.processTemplate(content, context);
                        await fs.writeFile(targetFilePath, processedContent);
                        processedFiles.push({ 
                            path: targetFilePath, 
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
}

module.exports = { TemplateProcessor };