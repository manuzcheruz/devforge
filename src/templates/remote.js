const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const { defaultConfig } = require('../config/defaults');

class RemoteTemplateManager {
    constructor() {
        // Use absolute path for temp directory
        this.tempDir = path.resolve(process.cwd(), '.nodeforge', 'templates');
        // Ensure temp directory exists on initialization
        this.initTempDir().catch(error => {
            logger.error(`Failed to initialize temp directory: ${error.message}`);
        });
    }

    async initTempDir() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            logger.info(`Initialized temp directory at: ${this.tempDir}`);
        } catch (error) {
            throw new Error(`Failed to create temp directory: ${error.message}`);
        }
    }

    async fetchTemplate(repositoryUrl) {
        try {
            logger.info(`Fetching template from ${repositoryUrl}`);
            const repoName = this.getRepoName(repositoryUrl);
            const targetDir = path.join(this.tempDir, repoName);

            // Ensure temp directory exists
            await fs.mkdir(this.tempDir, { recursive: true });

            // Clone repository
            const startTime = logger.startOperation('Cloning template repository');
            await this.cloneRepository(repositoryUrl, targetDir);
            logger.endOperation(startTime, 'Template repository cloned');

            // Detect branch and default branch if needed
            try {
                await this.detectAndCheckoutDefaultBranch(targetDir);
            } catch (branchError) {
                logger.warn(`Branch detection failed: ${branchError.message}`);
            }

            // Validate template structure
            logger.info('Validating template structure...');
            const template = await this.validateTemplate(targetDir);
            
            // Additional validation for required files
            const requiredFiles = ['package.json'];
            for (const file of requiredFiles) {
                const filePath = path.join(targetDir, file);
                try {
                    await fs.access(filePath);
                } catch {
                    throw new Error(`Required file '${file}' not found in template`);
                }
            }

            logger.success('Template validation successful');
            return template;
        } catch (error) {
            logger.error(`Failed to fetch template: ${error.message}`);
            await this.cleanup().catch(() => {});
            throw error;
        }
    }

    isValidGitUrl(url) {
        const gitUrlPattern = /^(https?:\/\/)?([\w.-]+)\/([^\/]+)\/([^\/]+)(\.git)?$/;
        return gitUrlPattern.test(url);
    }

    getAuthenticatedUrl(repositoryUrl) {
        const isGitHubUrl = /github\.com/.test(repositoryUrl);
        const gitToken = process.env.GITHUB_TOKEN;
        
        // For GitHub URLs
        if (isGitHubUrl) {
            // Try to validate if it's a public repository first
            try {
                const repoPath = repositoryUrl.split('github.com/')[1].replace('.git', '');
                const apiUrl = `https://api.github.com/repos/${repoPath}`;
                const { execSync } = require('child_process');
                
                // Check repository visibility using GitHub API
                const result = execSync(`curl -s ${apiUrl}`);
                const repoInfo = JSON.parse(result);
                
                if (!repoInfo.private) {
                    return {
                        cloneUrl: `https://github.com/${repoPath}.git`,
                        authType: 'public'
                    };
                }
            } catch (error) {
                logger.warn('Failed to check repository visibility, assuming private');
            }
            
            // If we reach here, either the repo is private or we couldn't determine its visibility
            if (gitToken) {
                const urlParts = repositoryUrl.split('://');
                return {
                    cloneUrl: `https://${gitToken}@${urlParts[1]}`,
                    authType: 'token'
                };
            }
        }
        
        return {
            cloneUrl: repositoryUrl,
            authType: 'anonymous'
        };
    }

    getRepoName(repositoryUrl) {
        const urlParts = repositoryUrl.split('/');
        const repoName = urlParts[urlParts.length - 1].replace('.git', '');
        return repoName;
    }

    async cloneRepository(repositoryUrl, targetDir) {
        try {
            logger.info(`Starting repository clone process for ${repositoryUrl}`);
            
            // Remove existing directory if it exists
            await fs.rm(targetDir, { recursive: true, force: true });
            
            // Parse repository URL and ensure it's a valid Git URL
            if (!this.isValidGitUrl(repositoryUrl)) {
                throw new Error('Invalid Git repository URL');
            }
            
            // Setup authentication and determine repository visibility
            const { cloneUrl, authType } = await this.getAuthenticatedUrl(repositoryUrl);
            logger.info(`Using ${authType} authentication`);
            
            // Create parent directory
            await fs.mkdir(path.dirname(targetDir), { recursive: true });
            
            if (authType === 'public') {
                // For public repositories, try direct HTTPS clone
                try {
                    const output = execSync(`git clone ${cloneUrl} "${targetDir}"`, {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        encoding: 'utf8',
                        timeout: 60000 // 60s timeout for public repos
                    });
                    logger.info(`Clone output: ${output}`);
                    logger.success('Repository cloned successfully');
                    return;
                } catch (error) {
                    logger.warn(`Public clone failed: ${error.message}`);
                    if (error.stderr) logger.warn(`Error details: ${error.stderr}`);
                    // Don't throw here, try shallow clone as fallback
                }
            }
            
            // Try shallow clone as fallback or for private repos
            logger.info('Attempting shallow clone...');
            try {
                const output = execSync(`git clone --depth 1 ${cloneUrl} "${targetDir}"`, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    encoding: 'utf8',
                    timeout: 30000 // 30s timeout for initial attempt
                });
                logger.info(`Clone output: ${output}`);
                logger.success('Repository cloned successfully (shallow)');
                return;
            } catch (error) {
                logger.warn(`Shallow clone failed: ${error.message}`);
                if (error.stderr) logger.warn(`Error details: ${error.stderr}`);
                await fs.rm(targetDir, { recursive: true, force: true });
            }

            // Full clone with retry mechanism
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const timeout = attempt * 45000; // 45s timeout, increases with each attempt
                    logger.info(`Full clone attempt ${attempt}/${maxRetries} (timeout: ${timeout/1000}s)...`);
                    
                    const output = execSync(`git clone ${cloneUrl} "${targetDir}"`, {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        encoding: 'utf8',
                        timeout
                    });
                    logger.info(`Clone output: ${output}`);
                    
                    // Verify the clone was successful by checking if the directory contains files
                    const files = await fs.readdir(targetDir);
                    if (files.length === 0) {
                        throw new Error('Repository appears to be empty');
                    }
                    
                    logger.success('Repository cloned successfully (full)');
                    return;
                } catch (error) {
                    const errorMsg = error.message.toLowerCase();
                    if (error.stderr) logger.warn(`Error details: ${error.stderr}`);
                    
                    if (errorMsg.includes('authentication') || errorMsg.includes('403')) {
                        throw new Error('Authentication failed. Please check your credentials.');
                    }
                    
                    if (attempt === maxRetries) {
                        throw error;
                    }
                    
                    logger.warn(`Attempt ${attempt} failed: ${error.message}`);
                    await fs.rm(targetDir, { recursive: true, force: true });
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
                }
            }
        } catch (error) {
            if (error.message.includes('Authentication failed')) {
                throw new Error('Authentication failed. For private repositories, please set GITHUB_TOKEN environment variable');
            }
            if (error.message.includes('timeout')) {
                throw new Error('Repository clone timed out. The repository might be too large or the connection is slow');
            }
            throw new Error(`Failed to clone repository: ${error.message}`);
        }
    }

    async validateTemplate(templateDir) {
        try {
            logger.info('Starting template validation...');
            const fsExtra = require('fs-extra');
            
            // Ensure template directory exists
            if (!await fsExtra.pathExists(templateDir)) {
                throw new Error('Template directory not found');
            }

            // Initialize with default configuration
            let templateConfig = {
                name: path.basename(templateDir),
                version: '1.0.0',
                files: {},
                dependencies: {},
                devDependencies: {}
            };
            
            // Try to load nodeforge.json configuration
            const configPath = path.join(templateDir, 'nodeforge.json');
            if (await fsExtra.pathExists(configPath)) {
                try {
                    const configContent = await fsExtra.readFile(configPath, 'utf-8');
                    const parsedConfig = JSON.parse(configContent);
                    logger.info('Found and parsed nodeforge.json configuration');
                    templateConfig = {
                        ...templateConfig,
                        ...parsedConfig
                    };
                } catch (error) {
                    logger.warn(`Error reading nodeforge.json: ${error.message}`);
                }
            }

            // Detect project structure
            logger.info('Detecting project structure...');
            let detectedConfig;
            try {
                detectedConfig = await this.detectProjectStructure(templateDir);
            } catch (error) {
                logger.warn(`Project structure detection failed: ${error.message}`);
                // Provide fallback configuration if detection fails
                detectedConfig = {
                    files: {},
                    dependencies: {},
                    devDependencies: {}
                };
            }
            
            // Merge configurations
            templateConfig = {
                ...templateConfig,
                dependencies: { ...templateConfig.dependencies, ...(detectedConfig.dependencies || {}) },
                devDependencies: { ...templateConfig.devDependencies, ...(detectedConfig.devDependencies || {}) },
                files: { ...templateConfig.files, ...(detectedConfig.files || {}) }
            };

            // Add detected files, but don't overwrite existing ones
            for (const [path, content] of Object.entries(detectedConfig.files)) {
                if (!templateConfig.files[path]) {
                    templateConfig.files[path] = content;
                }
            }

            // Validate core files exist
            const requiredFiles = ['package.json'];
            const missingFiles = [];
            for (const file of requiredFiles) {
                if (!templateConfig.files[file] && !await fsExtra.pathExists(path.join(templateDir, file))) {
                    missingFiles.push(file);
                }
            }

            if (missingFiles.length > 0) {
                logger.warn(`Missing required files: ${missingFiles.join(', ')}`);
                // Add default package.json if missing
                if (missingFiles.includes('package.json')) {
                    templateConfig.files['package.json'] = JSON.stringify({
                        name: templateConfig.name,
                        version: templateConfig.version,
                        main: 'src/index.js',
                        scripts: {
                            start: 'node src/index.js'
                        }
                    }, null, 2);
                }
            }

            // Ensure minimum project structure
            if (Object.keys(templateConfig.files).length === 0) {
                logger.warn('No files detected, adding minimal project structure');
                templateConfig.files['src/index.js'] = '// Generated template file\nconsole.log("Hello from the template");\n';
                if (!templateConfig.files['package.json']) {
                    templateConfig.files['package.json'] = JSON.stringify({
                        name: templateConfig.name,
                        version: templateConfig.version,
                        main: 'src/index.js',
                        scripts: {
                            start: 'node src/index.js'
                        }
                    }, null, 2);
                }
            }

            logger.success(`Template validated successfully with ${Object.keys(templateConfig.files).length} files`);
            return {
                ...templateConfig,
                path: templateDir
            };
        } catch (error) {
            logger.error(`Template validation error: ${error.message}`);
            throw error;
        }
    }

    async detectProjectStructure(templateDir) {
        try {
            logger.info('Detecting project structure...');
            const fsExtra = require('fs-extra');
            const { promisify } = require('util');
            const { glob } = require('glob');

            const config = {
                files: {},
                dependencies: {},
                devDependencies: {}
            };

            // Ensure template directory exists
            if (!await fsExtra.pathExists(templateDir)) {
                throw new Error(`Template directory not found: ${templateDir}`);
            }

            // Read package.json first if it exists
            const packageJsonPath = path.join(templateDir, 'package.json');
            if (await fsExtra.pathExists(packageJsonPath)) {
                try {
                    const packageJsonContent = await fsExtra.readFile(packageJsonPath, 'utf-8');
                    const packageJson = JSON.parse(packageJsonContent);
                    config.dependencies = packageJson.dependencies || {};
                    config.devDependencies = packageJson.devDependencies || {};
                    config.files['package.json'] = packageJsonContent;
                    logger.info('Found package.json and loaded dependencies');
                } catch (err) {
                    logger.warn(`Error parsing package.json: ${err.message}`);
                }
            }

            // Define file patterns to include
            const patterns = [
                'src/**/*.{js,ts,jsx,tsx}',
                'public/**/*',
                'templates/**/*',
                '*.{json,js,ts,md}',
                '.env.example',
                '.gitignore',
                'README.md'
            ];

            // Process all patterns
            let foundFiles = [];
            for (const pattern of patterns) {
                try {
                    const matches = await glob(pattern, {
                        cwd: templateDir,
                        dot: true,
                        nodir: true,
                        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
                    });
                    if (Array.isArray(matches)) {
                        foundFiles = [...foundFiles, ...matches];
                    } else {
                        logger.warn(`No matches found for pattern: ${pattern}`);
                    }
                } catch (error) {
                    logger.warn(`Error processing pattern ${pattern}: ${error.message}`);
                    continue;
                }
            }

            // Remove duplicates
            foundFiles = [...new Set(foundFiles)];

            // Read all found files
            for (const file of foundFiles) {
                try {
                    const fullPath = path.join(templateDir, file);
                    if (await fsExtra.pathExists(fullPath)) {
                        const content = await fsExtra.readFile(fullPath, 'utf-8');
                        const normalizedPath = file.split(path.sep).join('/');
                        config.files[normalizedPath] = content;
                        logger.info(`Loaded file: ${normalizedPath}`);
                    }
                } catch (error) {
                    logger.warn(`Error reading file ${file}: ${error.message}`);
                }
            }

            // Add default files if none found
            if (Object.keys(config.files).length === 0) {
                logger.warn('No files detected, adding default structure');
                config.files['src/index.js'] = '// Generated template file\nconsole.log("Hello from the template");\n';
                if (!config.files['package.json']) {
                    config.files['package.json'] = JSON.stringify({
                        name: path.basename(templateDir),
                        version: '1.0.0',
                        main: 'src/index.js',
                        scripts: {
                            start: 'node src/index.js'
                        }
                    }, null, 2);
                }
            }

            logger.info(`Detected ${Object.keys(config.files).length} files in template`);
            return config;
        } catch (error) {
            logger.error(`Project structure detection failed: ${error.message}`);
            throw new Error(`Failed to detect project structure: ${error.message}`);
        }
    }

    async validateProjectStructure(templateDir, config) {
        const errors = [];
        
        // Check if there are any files detected
        if (Object.keys(config.files).length === 0) {
            errors.push('No valid template files found');
        }

        // Check for critical project files
        const criticalFiles = ['package.json'];
        for (const file of criticalFiles) {
            const fullPath = path.join(templateDir, file);
            try {
                await fs.access(fullPath);
            } catch {
                errors.push(`Missing critical file: ${file}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    async detectAndCheckoutDefaultBranch(targetDir) {
        const { execSync } = require('child_process');
        try {
            // Get the default branch name
            const defaultBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD | sed "s@^refs/remotes/origin/@@"', {
                cwd: targetDir,
                encoding: 'utf8'
            }).trim();

            // Checkout the default branch
            execSync(`git checkout ${defaultBranch}`, {
                cwd: targetDir,
                encoding: 'utf8'
            });

            logger.info(`Checked out default branch: ${defaultBranch}`);
        } catch (error) {
            logger.warn(`Failed to detect/checkout default branch: ${error.message}`);
            // Continue with current branch
        }
    }
    async loadTemplateFiles(template) {
        const files = {};
        const ignoredPatterns = [
            'node_modules',
            '.git',
            'coverage',
            'dist',
            'build',
            '.github',
            '.idea',
            '.vscode',
            'test',
            'tests',
            '__tests__'
        ];
        
        try {
            const readDirRecursive = async (dir, baseDir = '') => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativePath = path.join(baseDir, entry.name);
                    
                    // Skip ignored directories and files
                    if (ignoredPatterns.some(pattern => entry.name.includes(pattern))) {
                        continue;
                    }
                    
                    if (entry.isDirectory()) {
                        await readDirRecursive(fullPath, relativePath);
                    } else {
                        // Only include relevant file types
                        const ext = path.extname(entry.name).toLowerCase();
                        if (['.js', '.ts', '.json', '.md', '.yml', '.yaml', '.env', '.html', '.css'].includes(ext)) {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            files[relativePath] = content;
                        }
                    }
                }
            };
            
            await readDirRecursive(template.path);
            
            return {
                ...template,
                files
            };
        } catch (error) {
            throw new Error(`Failed to load template files: ${error.message}`);
        }
    }

    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
        } catch (error) {
            logger.warn(`Failed to cleanup temporary files: ${error.message}`);
        }
    }
}

module.exports = new RemoteTemplateManager();
