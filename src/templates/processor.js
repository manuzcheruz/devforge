const { logger } = require('../utils/logger');
const { validateConfig } = require('../utils/validator');
const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

class TemplateProcessor {
    constructor() {
        this.variables = new Map();
    }

    setVariable(key, value) {
        this.variables.set(key, value);
    }

    async processTemplate(templateContent, context) {
        try {
            const template = Handlebars.compile(templateContent);
            return template({
                ...Object.fromEntries(this.variables),
                ...context
            });
        } catch (error) {
            logger.error(`Template processing failed: ${error.message}`);
            throw error;
        }
    }

    async processDirectory(sourcePath, targetPath, context = {}) {
        try {
            const files = await fs.readdir(sourcePath, { withFileTypes: true });
            
            for (const file of files) {
                const sourceFilePath = path.join(sourcePath, file.name);
                const targetFilePath = path.join(targetPath, file.name);
                
                if (file.isDirectory()) {
                    await fs.mkdir(targetFilePath, { recursive: true });
                    await this.processDirectory(sourceFilePath, targetFilePath, context);
                } else {
                    const content = await fs.readFile(sourceFilePath, 'utf-8');
                    const processedContent = await this.processTemplate(content, context);
                    await fs.writeFile(targetFilePath, processedContent);
                }
            }
        } catch (error) {
            logger.error(`Directory processing failed: ${error.message}`);
            throw error;
        }
    }

    async runPostInstallHooks(hooks, projectPath) {
        if (!Array.isArray(hooks)) {
            return;
        }

        for (const hook of hooks) {
            if (typeof hook === 'function') {
                try {
                    await hook(projectPath);
                } catch (error) {
                    logger.warn(`Post-install hook failed: ${error.message}`);
                }
            }
        }
    }
}

module.exports = { TemplateProcessor };
