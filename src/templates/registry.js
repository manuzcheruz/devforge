const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

class TemplateRegistry {
    constructor() {
        this.templates = new Map();
        this.registryPath = path.join(process.cwd(), '.nodesmith', 'registry.json');
    }

    async initialize() {
        try {
            await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
            try {
                const data = await fs.readFile(this.registryPath, 'utf-8');
                const registry = JSON.parse(data);
                this.templates = new Map(Object.entries(registry));
                logger.info('Template registry initialized');
            } catch (error) {
                // Registry file doesn't exist or is invalid, start fresh
                logger.info('Creating new template registry');
                await this.saveRegistry();
            }
        } catch (error) {
            logger.error(`Registry initialization failed: ${error.message}`);
            throw error;
        }
    }

    async saveRegistry() {
        try {
            const registry = Object.fromEntries(this.templates);
            await fs.writeFile(this.registryPath, JSON.stringify(registry, null, 2));
            logger.debug('Registry saved successfully');
        } catch (error) {
            logger.error(`Failed to save registry: ${error.message}`);
            throw error;
        }
    }

    async addTemplate(url, template) {
        try {
            const templateId = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_');
            
            // Read template configuration if exists
            let templateConfig = {};
            try {
                const configPath = path.join(template.path, 'nodeforge.json');
                const configContent = await fs.readFile(configPath, 'utf-8');
                templateConfig = JSON.parse(configContent);
            } catch {
                logger.debug('No template configuration found, using defaults');
            }
            
            const templateData = {
                id: templateId,
                url,
                name: template.packageJson.name || 'unnamed-template',
                version: template.packageJson.version || '1.0.0',
                description: template.packageJson.description || '',
                branch: template.defaultBranch,
                config: templateConfig,
                addedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            this.templates.set(templateId, templateData);
            await this.saveRegistry();
            logger.success(`Template '${templateData.name}' added to registry`);
            return templateData;
        } catch (error) {
            logger.error(`Failed to add template: ${error.message}`);
            throw error;
        }
    }

    getTemplate(id) {
        return this.templates.get(id);
    }

    getAllTemplates() {
        return Array.from(this.templates.values());
    }

    async removeTemplate(id) {
        try {
            const removed = this.templates.delete(id);
            if (removed) {
                await this.saveRegistry();
                logger.info(`Template ${id} removed from registry`);
            }
            return removed;
        } catch (error) {
            logger.error(`Failed to remove template: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new TemplateRegistry();
