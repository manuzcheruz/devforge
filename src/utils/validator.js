function validateProjectName(name) {
    const validNameRegex = /^[a-zA-Z0-9-_]+$/;
    return validNameRegex.test(name);
}

function validateConfig(config) {
    const requiredFields = ['version', 'templates'];
    const validVersion = /^\d+\.\d+\.\d+$/;
    
    // Check required fields
    if (!requiredFields.every(field => field in config)) {
        return false;
    }
    
    // Validate version format
    if (!validVersion.test(config.version)) {
        return false;
    }
    
    // Validate templates structure
    if (typeof config.templates !== 'object') {
        return false;
    }
    
    // Validate each template
    return Object.entries(config.templates).every(([name, template]) => {
        return (
            typeof name === 'string' &&
            typeof template === 'object' &&
            (!template.dependencies || typeof template.dependencies === 'object') &&
            (!template.devDependencies || typeof template.devDependencies === 'object') &&
            (!template.scripts || typeof template.scripts === 'object')
        );
    });
}

module.exports = {
    validateProjectName,
    validateConfig
};
