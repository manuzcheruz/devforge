function validateProjectName(name) {
    const validNameRegex = /^[a-zA-Z0-9-_]+$/;
    return validNameRegex.test(name);
}

function validateConfig(config) {
    const requiredFields = ['version', 'templates'];
    return requiredFields.every(field => field in config);
}

module.exports = {
    validateProjectName,
    validateConfig
};
