function validateProjectName(name) {
    const validNameRegex = /^[a-zA-Z0-9-_]+$/;
    const reservedNames = ['node_modules', 'src', 'dist', 'build', 'test'];
    
    if (!validNameRegex.test(name)) {
        throw new Error('Project name can only contain letters, numbers, hyphens, and underscores');
    }
    
    if (reservedNames.includes(name.toLowerCase())) {
        throw new Error(`'${name}' is a reserved name and cannot be used`);
    }
    
    if (name.length > 214) {
        throw new Error('Project name must be less than 214 characters');
    }
    
    return true;
}

function validateTemplateContent(content) {
    if (!content || typeof content !== 'string') {
        throw new Error('Template content must be a non-empty string');
    }

    // Check for potential security issues in template content
    const securityPatterns = [
        /eval\s*\(/,
        /new\s+Function\s*\(/,
        /__proto__/,
        /prototype\s*\[/
    ];

    for (const pattern of securityPatterns) {
        if (pattern.test(content)) {
            throw new Error('Template contains potentially unsafe content');
        }
    }

    return true;
}

function validateConfig(config) {
    const requiredFields = ['version', 'templates'];
    const validVersion = /^\d+\.\d+\.\d+$/;
    const validPackageVersion = /^(\^|~)?(\d+\.\d+\.\d+|latest|[*])$/;
    
    // Check required fields
    if (!requiredFields.every(field => field in config)) {
        throw new Error(`Missing required fields: ${requiredFields.filter(field => !(field in config)).join(', ')}`);
    }
    
    // Validate version format
    if (!validVersion.test(config.version)) {
        throw new Error(`Invalid version format: ${config.version}. Expected format: x.y.z`);
    }
    
    // Validate templates structure
    if (typeof config.templates !== 'object') {
        throw new Error('Templates must be an object');
    }
    
    // Validate each template
    for (const [name, template] of Object.entries(config.templates)) {
        if (typeof name !== 'string') {
            throw new Error(`Template name must be a string: ${name}`);
        }
        
        if (typeof template !== 'object') {
            throw new Error(`Template '${name}' must be an object`);
        }
        
        // Validate template metadata
        const requiredTemplateFields = ['dependencies', 'devDependencies'];
        const missingFields = requiredTemplateFields.filter(field => !(field in template));
        if (missingFields.length > 0) {
            throw new Error(`Template '${name}' is missing required fields: ${missingFields.join(', ')}`);
        }
        
        // Validate dependencies
        if (typeof template.dependencies !== 'object') {
            throw new Error(`Dependencies for template '${name}' must be an object`);
        }
        
        // Enhanced dependency version validation
        for (const [dep, version] of Object.entries(template.dependencies)) {
            if (!validPackageVersion.test(version)) {
                throw new Error(`Invalid dependency version format for '${dep}' in template '${name}': ${version}`);
            }
            
            // Check for security vulnerabilities in dependencies
            if (version === '*' || version === 'latest') {
                throw new Error(`Unsafe version '${version}' specified for dependency '${dep}' in template '${name}'. Please specify a fixed version or range.`);
            }
            
            // Validate peer dependencies
            if (template.peerDependencies && template.peerDependencies[dep]) {
                const peerVersion = template.peerDependencies[dep];
                if (!this.areVersionsCompatible(version, peerVersion)) {
                    throw new Error(`Dependency version conflict: ${dep}@${version} is incompatible with peer requirement ${dep}@${peerVersion}`);
                }
            }
        }
        
        // Validate devDependencies
        if (typeof template.devDependencies !== 'object') {
            throw new Error(`DevDependencies for template '${name}' must be an object`);
        }
        
        // Validate devDependency versions
        for (const [dep, version] of Object.entries(template.devDependencies)) {
            if (!validPackageVersion.test(version)) {
                throw new Error(`Invalid devDependency version format for '${dep}' in template '${name}': ${version}`);
            }
        }
        
        // Validate scripts
        if (template.scripts) {
            if (typeof template.scripts !== 'object') {
                throw new Error(`Scripts for template '${name}' must be an object`);
            }
            
            // Validate each script
            for (const [scriptName, script] of Object.entries(template.scripts)) {
                if (typeof script !== 'string') {
                    throw new Error(`Script '${scriptName}' in template '${name}' must be a string`);
                }
            }
        }
        
        // Validate scripts
        if (template.scripts) {
            if (typeof template.scripts !== 'object') {
                throw new Error(`Scripts for template '${name}' must be an object`);
            }
            
            for (const [scriptName, script] of Object.entries(template.scripts)) {
                if (typeof script !== 'string') {
                    throw new Error(`Script '${scriptName}' in template '${name}' must be a string`);
                }
            }
        }
        
        // Validate hooks
        if (template.hooks) {
            if (!Array.isArray(template.hooks)) {
                throw new Error(`Hooks for template '${name}' must be an array`);
            }
            
            const validHookTypes = ['pre-install', 'post-install', 'pre-process', 'post-process'];
            template.hooks.forEach((hook, index) => {
                if (!hook.name) {
                    throw new Error(`Hook at index ${index} in template '${name}' must have a name`);
                }
                
                if (!hook.type || !validHookTypes.includes(hook.type)) {
                    throw new Error(`Hook at index ${index} in template '${name}' has invalid type. Must be one of: ${validHookTypes.join(', ')}`);
                }
                
                if (typeof hook.execute !== 'function') {
                    throw new Error(`Hook at index ${index} in template '${name}' must have an execute function`);
                }
                
                if (hook.priority !== undefined && typeof hook.priority !== 'number') {
                    throw new Error(`Hook at index ${index} in template '${name}' has invalid priority. Must be a number`);
                }
                
                if (hook.critical !== undefined && typeof hook.critical !== 'boolean') {
                    throw new Error(`Hook at index ${index} in template '${name}' has invalid critical flag. Must be a boolean`);
                }
            });
        }

        // Validate features configuration
        if (template.features) {
            if (typeof template.features !== 'object') {
                throw new Error(`Features for template '${name}' must be an object`);
            }

            // Validate TypeScript configuration
            if (template.features.typescript) {
                const { typescript } = template.features;
                if (typeof typescript.enabled !== 'boolean') {
                    throw new Error(`TypeScript enabled flag in template '${name}' must be a boolean`);
                }
                if (typescript.enabled && !typescript.version) {
                    throw new Error(`TypeScript version is required when enabled in template '${name}'`);
                }
            }

            // Validate testing configuration
            if (template.features.testing) {
                const { testing } = template.features;
                if (!testing.framework) {
                    throw new Error(`Testing framework must be specified in template '${name}'`);
                }
            }
        }
        
        // Validate file paths and content types
        if (template.files) {
            for (const [filepath, content] of Object.entries(template.files)) {
                // Check for directory traversal
                if (filepath.includes('..') || filepath.startsWith('/')) {
                    throw new Error(`Invalid file path in template '${name}': ${filepath}`);
                }
                
                // Validate file extensions
                const ext = path.extname(filepath).toLowerCase();
                const allowedExtensions = ['.js', '.ts', '.json', '.md', '.yml', '.yaml', '.env'];
                if (!allowedExtensions.includes(ext)) {
                    throw new Error(`Unsupported file extension in template '${name}': ${ext}`);
                }
                
                // Validate content
                if (!validateTemplateContent(content)) {
                    throw new Error(`Invalid content in template file: ${filepath}`);
                }
            }
        }
    }
    
    return true;
}

module.exports = {
    validateProjectName,
    validateConfig
};