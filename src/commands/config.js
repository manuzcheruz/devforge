const fs = require('fs').promises;
const { logger } = require('../utils/logger');
const { validateConfig } = require('../utils/validator');
const { defaultConfig } = require('../config/defaults');

async function loadConfig(path) {
    try {
        const content = await fs.readFile(path, 'utf-8');
        const config = JSON.parse(content);
        
        if (!validateConfig(config)) {
            throw new Error('Invalid configuration format');
        }

        return { ...defaultConfig, ...config };
    } catch (error) {
        logger.error(`Failed to load configuration: ${error.message}`);
        throw error;
    }
}

async function saveConfig(config, path) {
    try {
        if (!validateConfig(config)) {
            throw new Error('Invalid configuration format');
        }

        await fs.writeFile(path, JSON.stringify(config, null, 2));
        logger.success('Configuration saved successfully');
        return true;
    } catch (error) {
        logger.error(`Failed to save configuration: ${error.message}`);
        throw error;
    }
}

module.exports = { loadConfig, saveConfig };
