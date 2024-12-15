const { exec } = require('child_process');
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

    async fetchTemplate(url) {
        try {
            logger.info(`Starting template fetch process from ${url}`);
            logger.info('Validating repository URL and preparing environment...');
            
            // Create temp directory if it doesn't exist
            await fs.mkdir(this.tempDir, { recursive: true });
            
            logger.info('Initiating repository clone...');
            
            // Clone repository with authentication
            const cloneDir = path.join(this.tempDir, 'repo-' + Date.now());
            const githubToken = process.env.GITHUB_TOKEN;
            
            if (!githubToken) {
                throw new Error('GitHub token not found in environment variables');
            }
            
            // Extract owner and repo from URL
            const urlMatch = url.match(/github\.com[\/:]([^\/]+)\/([^\/]+?)(\.git)?$/);
            if (!urlMatch) {
                throw new Error('Invalid GitHub repository URL format');
            }
            
            const [, owner, repo] = urlMatch;
            const authenticatedUrl = `https://${githubToken}@github.com/${owner}/${repo}.git`;
            
            logger.info(`Cloning repository ${owner}/${repo}...`);
            await exec(`git clone ${authenticatedUrl} ${cloneDir}`, { 
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
            });
            
            logger.info('Repository cloned successfully');
            
            // Process repository contents
            const template = await this.processRepository(cloneDir);
            return template;
        } catch (error) {
            logger.error(`Failed to fetch template: ${error.message}`);
            await this.cleanup(); // Clean up on error
            throw error;
        }
    }

    isValidGitUrl(url) {
        const gitUrlPattern = /^(https?:\/\/)?([\w.-]+)\/([^\/]+)\/([^\/]+)(\.git)?$/;
        return gitUrlPattern.test(url);
    }

    async getAuthenticatedUrl(repositoryUrl) {
        const isGitHubUrl = /github\.com/.test(repositoryUrl);
        const gitToken = process.env.GITHUB_TOKEN;
        
        // For GitHub URLs
        if (isGitHubUrl) {
            logger.info('Processing GitHub repository URL...');
            try {
                const repoPath = repositoryUrl.split('github.com/')[1].replace('.git', '');
                const apiUrl = `https://api.github.com/repos/${repoPath}`;
                
                // Use native https module for better control
                const https = require('https');
                const headers = gitToken ? { 'Authorization': `token ${gitToken}` } : {};
                
                const repoInfo = await new Promise((resolve, reject) => {
                    const req = https.get(apiUrl, { headers }, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch (e) {
                                reject(new Error(`Invalid API response: ${e.message}`));
                            }
                        });
                    });
                    
                    req.on('error', reject);
                    req.end();
                });
                
                if (repoInfo.message === 'Not Found') {
                    throw new Error('Repository not found. Please check the URL.');
                }
                
                if (!repoInfo.private) {
                    logger.info('Public repository detected');
                    return {
                        cloneUrl: `https://github.com/${repoPath}.git`,
                        authType: 'public',
                        defaultBranch: repoInfo.default_branch,
                        description: repoInfo.description
                    };
                }
                
                logger.info('Private repository detected');
            } catch (error) {
                logger.warn(`Repository check failed: ${error.message}`);
            }
            
            // Handle private repositories or API failures
            if (gitToken) {
                logger.info('Using authenticated access');
                const urlParts = repositoryUrl.split('://');
                return {
                    cloneUrl: `https://${gitToken}@${urlParts[1]}`,
                    authType: 'token'
                };
            } else {
                logger.warn('No GitHub token found for private repository');
            }
        }
        
        logger.info('Using anonymous access');
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
            const { cloneUrl, authType, defaultBranch, description } = await this.getAuthenticatedUrl(repositoryUrl);
            logger.info(`Using ${authType} authentication`);
            if (description) {
                logger.info(`Repository description: ${description}`);
            }
            
            // Create parent directory
            await fs.mkdir(path.dirname(targetDir), { recursive: true });
            
            // Progress tracking with more detailed information
            const startTime = Date.now();
            const reportProgress = (phase, details = '') => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const memory = process.memoryUsage();
                const memoryMB = (memory.heapUsed / 1024 / 1024).toFixed(1);
                logger.info(`[${phase}] ${details}`);
                logger.info(`Time: ${elapsed}s, Memory: ${memoryMB}MB`);
            };
            
            // Network check before clone
            try {
                const dns = require('dns');
                await new Promise((resolve, reject) => {
                    dns.resolve('github.com', (err) => {
                        if (err) reject(new Error('Network connectivity issues'));
                        resolve();
                    });
                });
            } catch (error) {
                throw new Error(`Network check failed: ${error.message}`);
            }
            
            if (authType === 'public') {
                try {
                    reportProgress('Clone', 'Starting public repository clone');
                    
                    // Try shallow clone first for faster download
                    const cloneOptions = [
                        '--depth', '1',
                        '--single-branch'
                    ];
                    
                    if (defaultBranch) {
                        cloneOptions.push('--branch', defaultBranch);
                    }
                    
                    const output = execSync(
                        `git clone ${cloneOptions.join(' ')} ${cloneUrl} "${targetDir}"`,
                        {
                            stdio: ['pipe', 'pipe', 'pipe'],
                            encoding: 'utf8',
                            timeout: 30000 // 30s timeout for shallow clone
                        }
                    );
                    
                    reportProgress('Clone', 'Shallow clone successful');
                    logger.success('Repository cloned successfully (shallow)');
                    return;
                } catch (error) {
                    const errorMessage = error.stderr ? error.stderr.toString() : error.message;
                    reportProgress('Retry', 'Shallow clone failed, attempting full clone');
                    logger.warn(`Shallow clone failed: ${errorMessage}`);
                }
            }
            
            // Try shallow clone as fallback or for private repos
            try {
                logger.info('Attempting shallow clone...');
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

            try {
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
            const path = require('path');
            const { glob } = require('glob');
            
            // Ensure template directory exists
            if (!await fsExtra.pathExists(templateDir)) {
                throw new Error('Template directory not found');
            }

            // Track validation progress and project characteristics
            const validation = {
                packageJsons: [],
                hasSourceFiles: false,
                hasTests: false,
                hasDocumentation: false,
                hasBuildConfig: false,
                totalFiles: 0,
                errors: [],
                warnings: []
            };

            // Find all package.json files recursively
            logger.info('Searching for package.json files...');
            try {
                const packageJsonPaths = await glob('**/package.json', {
                    cwd: templateDir,
                    ignore: ['**/node_modules/**'],
                    dot: true
                });

                for (const packageJsonPath of packageJsonPaths) {
                    const fullPath = path.join(templateDir, packageJsonPath);
                    try {
                        const content = await fsExtra.readFile(fullPath, 'utf-8');
                        const packageJson = JSON.parse(content);
                        validation.packageJsons.push({
                            path: packageJsonPath,
                            content: packageJson
                        });
                        logger.info(`Found valid package.json at: ${packageJsonPath}`);
                    } catch (error) {
                        logger.warn(`Invalid package.json at ${packageJsonPath}: ${error.message}`);
                    }
                }
            } catch (error) {
                logger.warn(`Error searching for package.json files: ${error.message}`);
            }

            // Validate found package.json files
            logger.info('Validating package.json files...');
            if (validation.packageJsons.length === 0) {
                validation.errors.push('No valid package.json files found in the repository');
            } else {
                // Find the most suitable package.json (prefer root or main package)
                const mainPackageJson = validation.packageJsons.find(pkg => 
                    pkg.path === 'package.json' || // root package.json
                    pkg.content.name === path.basename(templateDir) || // matches directory name
                    pkg.content.private === true // workspace root
                ) || validation.packageJsons[0]; // fallback to first found

                logger.info(`Using package.json from: ${mainPackageJson.path}`);

                // Validate the chosen package.json
                const packageJson = mainPackageJson.content;
                if (!packageJson.name) {
                    validation.warnings.push(`package.json at ${mainPackageJson.path} missing "name" field`);
                }
                if (!packageJson.version) {
                    validation.warnings.push(`package.json at ${mainPackageJson.path} missing "version" field`);
                }
                if (!packageJson.dependencies && !packageJson.devDependencies) {
                    validation.warnings.push(`package.json at ${mainPackageJson.path} has no dependencies defined`);
                }

                // Store the main package.json path for later use
                validation.mainPackageJson = mainPackageJson;
            }

            // Check for monorepo/workspace setup
            const hasWorkspaces = validation.packageJsons.some(pkg => 
                pkg.content.workspaces || 
                (pkg.content.private === true && pkg.content.packages)
            );
            
            if (hasWorkspaces) {
                logger.info('Detected monorepo/workspace structure');
                validation.isMonorepo = true;
            }

            // Initialize with default configuration
            let templateConfig = {
                name: path.basename(templateDir),
                version: '1.0.0',
                files: {},
                dependencies: {},
                devDependencies: {},
                variants: [{
                    name: 'default',
                    description: 'Default template configuration',
                    features: []
                }]
            };
            
            logger.info('Analyzing template structure...');
            
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
                    logger.info(`Added detected file: ${path}`);
                }
            }
            
            // Ensure package.json has required fields
            if (templateConfig.files['package.json']) {
                try {
                    const packageJson = JSON.parse(templateConfig.files['package.json']);
                    if (!packageJson.dependencies) packageJson.dependencies = {};
                    if (!packageJson.devDependencies) packageJson.devDependencies = {};
                    if (!packageJson.scripts) {
                        packageJson.scripts = {
                            "start": "node src/index.js",
                            "test": "jest",
                            "dev": "nodemon src/index.js"
                        };
                    }
                    templateConfig.files['package.json'] = JSON.stringify(packageJson, null, 2);
                    logger.info('Updated package.json with required fields');
                } catch (error) {
                    logger.warn(`Error processing package.json: ${error.message}`);
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
            const { glob } = require('glob');
            const path = require('path');

            // Initialize configuration
            const config = {
                files: {},
                dependencies: {},
                devDependencies: {}
            };

            // Ensure template directory exists
            if (!await fsExtra.pathExists(templateDir)) {
                throw new Error(`Template directory not found: ${templateDir}`);
            }

            // Special handling for Express.js generator
            const isExpressGenerator = await this.isExpressGenerator(templateDir);
            if (isExpressGenerator) {
                logger.info('Detected Express.js generator template');
                return await this.processExpressTemplate(templateDir);
            }

            // Find all package.json files recursively
            logger.info('Searching for package.json files recursively...');
            const packageJsonPaths = await glob('**/package.json', {
                cwd: templateDir,
                ignore: ['**/node_modules/**'],
                absolute: true
            });

            if (packageJsonPaths.length === 0) {
                logger.warn('No package.json files found in repository');
                // Create a default package.json if none found
                const defaultPackageJson = {
                    name: path.basename(templateDir),
                    version: '1.0.0',
                    description: 'Template generated from remote repository',
                    main: 'index.js',
                    scripts: {
                        start: 'node index.js'
                    },
                    dependencies: {},
                    devDependencies: {}
                };
                config.files['package.json'] = JSON.stringify(defaultPackageJson, null, 2);
                logger.info('Created default package.json');
            } else {
                logger.info(`Found ${packageJsonPaths.length} package.json file(s)`);
                
                // Process and validate each package.json
                const validPackages = [];
                for (const packageJsonPath of packageJsonPaths) {
                    try {
                        const packageJsonContent = await fsExtra.readFile(packageJsonPath, 'utf-8');
                        const packageJson = JSON.parse(packageJsonContent);
                        
                        // Enhanced validation criteria
                        const isValid = packageJson.name && 
                            typeof packageJson.name === 'string' &&
                            (!packageJson.private || packageJson.workspaces);  // Allow workspace roots
                        
                        if (isValid) {
                            validPackages.push({
                                path: packageJsonPath,
                                content: packageJson,
                                isWorkspace: !!packageJson.workspaces,
                                depth: packageJsonPath.split(path.sep).length
                            });
                            logger.info(`Valid package.json found at: ${path.relative(templateDir, packageJsonPath)}`);
                        } else {
                            logger.debug(`Invalid package.json at: ${path.relative(templateDir, packageJsonPath)}`);
                        }
                    } catch (err) {
                        logger.warn(`Error processing ${packageJsonPath}: ${err.message}`);
                        continue;
                    }
                }

                if (validPackages.length > 0) {
                    // Prioritize: 1. Root workspace, 2. Shallowest depth, 3. First found
                    const mainPackage = validPackages
                        .sort((a, b) => {
                            if (a.isWorkspace !== b.isWorkspace) return b.isWorkspace - a.isWorkspace;
                            return a.depth - b.depth;
                        })[0];

                    logger.info(`Selected main package.json: ${path.relative(templateDir, mainPackage.path)}`);
                    
                    // Update configuration
                    config.dependencies = mainPackage.content.dependencies || {};
                    config.devDependencies = mainPackage.content.devDependencies || {};
                    config.files['package.json'] = JSON.stringify(mainPackage.content, null, 2);
                    
                    // Update template directory to the selected package location
                    templateDir = path.dirname(mainPackage.path);
                    logger.info(`Using directory as template root: ${path.relative(process.cwd(), templateDir)}`);
                }
            }

            if (!config.files['package.json']) {
                throw new Error('No valid package.json found in the repository or its subdirectories');
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
    async isExpressGenerator(templateDir) {
        try {
            const path = require('path');
            const fs = require('fs').promises;
            
            // Check for express-generator specific files
            const binPath = path.join(templateDir, 'bin');
            const templatePath = path.join(templateDir, 'templates');
            
            try {
                await fs.access(binPath);
                await fs.access(templatePath);
                return true;
            } catch {
                return false;
            }
        } catch (error) {
            logger.warn(`Error checking for Express generator: ${error.message}`);
            return false;
        }
    }

    async processExpressTemplate(templateDir) {
        try {
            logger.info('Processing Express.js generator template...');
            const path = require('path');
            const fsExtra = require('fs-extra');
            
            // Initialize configuration with Express.js defaults
            const config = {
                files: {},
                dependencies: {
                    'express': '^4.18.2',
                    'cookie-parser': '~1.4.6',
                    'debug': '~4.3.4',
                    'morgan': '~1.10.0',
                    'http-errors': '~2.0.0'
                },
                devDependencies: {}
            };

            // Read template files from express-generator
            const templatesDir = path.join(templateDir, 'templates', 'js');
            if (await fsExtra.pathExists(templatesDir)) {
                const files = await fsExtra.readdir(templatesDir, { recursive: true });
                
                for (const file of files) {
                    if ((await fsExtra.stat(path.join(templatesDir, file))).isFile()) {
                        const content = await fsExtra.readFile(path.join(templatesDir, file), 'utf-8');
                        const normalizedPath = file.split(path.sep).join('/');
                        config.files[normalizedPath] = content;
                        logger.info(`Added template file: ${normalizedPath}`);
                    }
                }
            }

            // Add package.json
            const packageJson = {
                name: 'express-app',
                version: '0.0.0',
                private: true,
                scripts: {
                    start: 'node ./bin/www',
                    dev: 'nodemon ./bin/www'
                },
                dependencies: config.dependencies,
                devDependencies: {
                    'nodemon': '^3.0.2'
                }
            };
            
            config.files['package.json'] = JSON.stringify(packageJson, null, 2);
            logger.info('Created Express.js package.json');

            // Add basic Express.js application structure
            if (!config.files['app.js']) {
                config.files['app.js'] = `
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const indexRouter = require('./routes/index');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

module.exports = app;
`.trim();
                logger.info('Created app.js');
            }

            // Add www binary
            if (!config.files['bin/www']) {
                config.files['bin/www'] = `#!/usr/bin/env node
const app = require('../app');
const debug = require('debug')('express-app:server');
const http = require('http');

const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

const server = http.createServer(app);
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(val) {
    const port = parseInt(val, 10);
    if (isNaN(port)) return val;
    if (port >= 0) return port;
    return false;
}

function onError(error) {
    if (error.syscall !== 'listen') throw error;
    const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;
    
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

function onListening() {
    const addr = server.address();
    const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
    debug('Listening on ' + bind);
}
`.trim();
                logger.info('Created bin/www');
            }

            return config;
        } catch (error) {
            logger.error(`Failed to process Express.js template: ${error.message}`);
            throw error;
        }
    }
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
            '.vscode'
        ];
        
        const ejs = require('ejs');
        
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
                        const ext = path.extname(entry.name).toLowerCase();
                        
                        // Handle EJS templates specially
                        if (ext === '.ejs') {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            const targetPath = relativePath.replace('.ejs', '');
                            
                            // Process Express.js specific templates
                            if (entry.name === 'www.ejs') {
                                files['bin/www'] = ejs.render(content, {
                                    name: template.name || 'app',
                                    port: template.variables?.port || 3000
                                });
                            } else if (entry.name === 'app.js.ejs') {
                                files['app.js'] = ejs.render(content, {
                                    name: template.name || 'app',
                                    view: template.variables?.view || 'jade',
                                    uses: [
                                        'logger("dev")',
                                        'express.json()',
                                        'express.urlencoded({ extended: false })',
                                        'cookieParser()',
                                        'express.static(path.join(__dirname, "public"))'
                                    ],
                                    css: template.variables?.css || 'css',
                                    uses: [
                                        'logger("dev")',
                                        'express.json()',
                                        'express.urlencoded({ extended: false })',
                                        'cookieParser()',
                                        'express.static(path.join(__dirname, "public"))'
                                    ],
                                    modules: {
                                        'express': 'express',
                                        'path': 'path',
                                        'cookieParser': 'cookie-parser',
                                        'logger': 'morgan'
                                    },
                                    routes: {
                                        'indexRouter': './routes/index',
                                        'usersRouter': './routes/users'
                                    }
                                });
                                
                                // Generate route files
                                files['routes/index.js'] = `var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;`;

                                files['routes/users.js'] = `var express = require('express');
var router = express.Router();

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

module.exports = router;`;

                                // Generate view files
                                files['views/index.jade'] = `extends layout

block content
  h1= title
  p Welcome to #{title}`;

                                files['views/layout.jade'] = `doctype html
html
  head
    title= title
    link(rel='stylesheet', href='/stylesheets/style.css')
  body
    block content`;

                                files['public/stylesheets/style.css'] = `body {
  padding: 50px;
  font: 14px "Lucida Grande", Helvetica, Arial, sans-serif;
}

a {
  color: #00B7FF;
}`;
                            } else {
                                files[targetPath] = ejs.render(content, template.variables || {});
                            }
                        } else if (['.js', '.ts', '.json', '.md', '.yml', '.yaml', '.env', '.html', '.css'].includes(ext)) {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            
                            // Special handling for specific Express.js files
                            if (entry.name === 'gitignore') {
                                files['.gitignore'] = content;
                            } else if (relativePath.startsWith('templates/js/routes/')) {
                                // Move route files to routes directory
                                const routePath = 'routes/' + path.basename(relativePath);
                                files[routePath] = content;
                            } else if (relativePath.startsWith('templates/css/')) {
                                // Move CSS files to public/stylesheets
                                const cssPath = 'public/stylesheets/' + path.basename(relativePath);
                                files[cssPath] = content;
                            } else if (relativePath.startsWith('templates/js/')) {
                                // Move JavaScript files to appropriate directory
                                const jsPath = path.basename(relativePath);
                                files[jsPath] = content;
                            } else {
                                // Default file handling
                                files[relativePath] = content;
                            }
                        }
                    }
                }
            };
            
            await readDirRecursive(template.path);
            
            // Ensure essential Express.js directories exist
            files['public/javascripts/.gitkeep'] = '';
            files['public/images/.gitkeep'] = '';
            files['views/.gitkeep'] = '';
            
            logger.info(`Loaded ${Object.keys(files).length} template files`);
            return files;
        } catch (error) {
            logger.error(`Failed to load template files: ${error.message}`);
            throw new Error(`Failed to load template files: ${error.message}`);
        }
    }
    
    async processRepository(cloneDir) {
        try {
            logger.info('Processing cloned repository...');
            
            // Get default branch without checkout
            const defaultBranch = await this.getDefaultBranch(cloneDir);
            logger.info(`Detected default branch: ${defaultBranch}`);
            
            // Initialize repository if needed
            await exec('git init', { cwd: cloneDir });
            
            // Add remote and fetch
            await exec('git remote add origin ' + this.currentUrl, { cwd: cloneDir });
            await exec('git fetch origin', { cwd: cloneDir });
            
            // Checkout default branch
            try {
                await exec(`git checkout ${defaultBranch}`, { cwd: cloneDir });
            } catch (error) {
                // If branch doesn't exist, create it
                await exec(`git checkout -b ${defaultBranch}`, { cwd: cloneDir });
            }
            
            // Detect project structure
            logger.info('Analyzing repository structure...');
            
            // Search for package.json in the repository
            let packageJsonPath = await this.findFile(cloneDir, 'package.json');
            
            if (!packageJsonPath) {
                logger.info('No package.json found in root, checking subdirectories...');
                
                // Check if this is a templates or examples repository
                const dirs = await fs.readdir(cloneDir, { withFileTypes: true });
                const potentialTemplateDirectories = dirs.filter(dir => 
                    dir.isDirectory() && !['node_modules', '.git', 'dist'].includes(dir.name)
                );
                
                for (const dir of potentialTemplateDirectories) {
                    const subPath = path.join(cloneDir, dir.name);
                    logger.info(`Checking subdirectory: ${dir.name}`);
                    
                    try {
                        packageJsonPath = await this.findFile(subPath, 'package.json');
                        if (packageJsonPath) {
                            logger.info(`Found valid package.json in subdirectory: ${dir.name}`);
                            // Use the directory containing package.json as the template root
                            return this.processRepository(subPath);
                        }
                    } catch (error) {
                        logger.debug(`Error checking subdirectory ${dir.name}: ${error.message}`);
                        continue;
                    }
                }
                
                logger.error('No package.json found in repository or its subdirectories');
                throw new Error('No valid Node.js project structure found in the repository. Please ensure the repository contains a package.json file.');
            }

            // Read package.json to validate project structure
            try {
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
                logger.info(`Found valid package.json with name: ${packageJson.name}`);
            } catch (error) {
                throw new Error(`Invalid package.json: ${error.message}`);
            }
            
            // Template metadata
            const template = {
                name: path.basename(cloneDir),
                path: cloneDir,
                files: await this.loadTemplateFiles(cloneDir)
            };
            
            logger.info('Repository processed successfully');
            return template;
        } catch (error) {
            logger.error(`Failed to process repository: ${error.message}`);
            throw error;
        }
    }
    
    async getDefaultBranch(cloneDir) {
        try {
            const { stdout } = await exec('git remote show origin | grep "HEAD branch" | cut -d" " -f5', { cwd: cloneDir });
            return stdout.trim() || 'main';
        } catch (error) {
            return 'main';
        }
    }
    
    async findFile(dir, filename) {
        try {
            logger.info(`Searching for ${filename} in ${dir}...`);
            const files = await fs.readdir(dir, { withFileTypes: true });
            
            // First, check current directory for the file
            const directMatch = files.find(file => file.isFile() && file.name === filename);
            if (directMatch) {
                const fullPath = path.join(dir, directMatch.name);
                logger.info(`Found ${filename} directly at: ${fullPath}`);
                return fullPath;
            }
            
            // Then search subdirectories
            for (const file of files) {
                const fullPath = path.join(dir, file.name);
                
                // Skip common non-project directories
                if (file.isDirectory() && !['node_modules', '.git', 'dist', 'build', 'coverage'].includes(file.name)) {
                    try {
                        const found = await this.findFile(fullPath, filename);
                        if (found) {
                            return found;
                        }
                    } catch (error) {
                        logger.debug(`Error searching in subdirectory ${file.name}: ${error.message}`);
                        continue;
                    }
                }
            }
            
            logger.debug(`${filename} not found in ${dir}`);
            return null;
        } catch (error) {
            logger.warn(`Error accessing directory ${dir}: ${error.message}`);
            throw error;
        }
    }

    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
            logger.info('Cleaned up temporary files');
        } catch (error) {
            logger.warn(`Failed to clean up: ${error.message}`);
        }
    }
}

module.exports = new RemoteTemplateManager();