const { z } = require('zod');
const axios = require('axios');
const { logger } = require('../utils/logger');

// Marketplace Template Schema
const templateMetadataSchema = z.object({
    name: z.string()
        .min(1, "Template name is required")
        .regex(/^[a-z0-9-]+$/, "Template name must contain only lowercase letters, numbers, and hyphens"),
    version: z.string()
        .regex(/^\d+\.\d+\.\d+$/, "Version must follow semantic versioning (x.y.z)"),
    description: z.string()
        .min(10, "Description must be at least 10 characters"),
    author: z.string().min(1, "Author name is required"),
    tags: z.array(z.string()).optional(),
    repository: z.string().url("Repository URL must be valid").optional(),
    dependencies: z.record(z.string()).optional(),
    type: z.enum(['project', 'plugin', 'component']),
    compatibility: z.object({
        nodeVersion: z.string(),
        devforgeVersion: z.string()
    }),
    rating: z.number().min(0).max(5).optional(),
    downloads: z.number().min(0).optional()
});

class MarketplaceManager {
    constructor() {
        this.registryUrl = process.env.DEVFORGE_REGISTRY_URL || 'https://registry.devforge.dev';
        this.templates = new Map();
        this.cache = new Map();
        this.cacheTimeout = 1000 * 60 * 15; // 15 minutes
    }

    async publishTemplate(metadata, templatePath) {
        try {
            // Validate template metadata
            const validMetadata = await templateMetadataSchema.parseAsync(metadata);

            // Check if template already exists
            const existing = await this.getTemplate(validMetadata.name);
            if (existing) {
                throw new Error(`Template ${validMetadata.name} already exists`);
            }

            // Prepare template package
            const templatePackage = await this.prepareTemplatePackage(validMetadata, templatePath);

            // Upload to registry
            const response = await axios.post(`${this.registryUrl}/templates`, templatePackage, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DEVFORGE_REGISTRY_TOKEN}`
                }
            });

            logger.info(`Template ${validMetadata.name} published successfully`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to publish template: ${error.message}`);
            throw error;
        }
    }

    async searchTemplates(query = '', options = {}) {
        try {
            const cacheKey = `search:${query}:${JSON.stringify(options)}`;
            
            // Check cache first
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            // Fetch from registry
            const response = await axios.get(`${this.registryUrl}/templates/search`, {
                params: {
                    q: query,
                    type: options.type,
                    tags: options.tags,
                    sort: options.sort || 'downloads',
                    limit: options.limit || 20,
                    offset: options.offset || 0
                }
            });

            const templates = response.data;
            
            // Update cache
            this.setCache(cacheKey, templates);
            
            return templates;
        } catch (error) {
            logger.error(`Template search failed: ${error.message}`);
            throw error;
        }
    }

    async getTemplate(name, version = 'latest') {
        try {
            const cacheKey = `template:${name}:${version}`;
            
            // Check cache first
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            // Fetch from registry
            const response = await axios.get(`${this.registryUrl}/templates/${name}/${version}`);
            
            // Handle case where template doesn't exist
            if (!response || !response.data) {
                return null;
            }
            
            const template = response.data;
            
            // Update cache
            this.setCache(cacheKey, template);
            
            return template;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            logger.error(`Failed to fetch template ${name}@${version}: ${error.message}`);
            throw error;
        }
    }

    async downloadTemplate(name, version = 'latest', targetPath) {
        try {
            // Get template metadata
            const template = await this.getTemplate(name, version);
            
            // Download template content
            const response = await axios.get(`${this.registryUrl}/templates/${name}/${version}/download`, {
                responseType: 'stream'
            });

            // Write to target path
            await this.extractTemplate(response.data, targetPath);
            
            logger.info(`Template ${name}@${version} downloaded successfully`);
            return template;
        } catch (error) {
            logger.error(`Template download failed: ${error.message}`);
            throw error;
        }
    }

    // Cache management methods
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }

    // Helper methods
    async prepareTemplatePackage(metadata, templatePath) {
        // Implementation for packaging template contents
        // This would include reading the template directory and preparing it for upload
        return {
            metadata,
            content: {} // Template content would be added here
        };
    }

    async extractTemplate(stream, targetPath) {
        // Implementation for extracting downloaded template to target path
        // This would handle unzipping and file writing operations
    }
}

module.exports = {
    MarketplaceManager,
    templateMetadataSchema
};
