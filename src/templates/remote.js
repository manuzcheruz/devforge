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
        const startTime = Date.now();
        try {
            logger.info(`Starting template fetch process from ${repositoryUrl}`);
            const repoName = this.getRepoName(repositoryUrl);
            const targetDir = path.join(this.tempDir, repoName);

            // Enhanced initialization and validation
            logger.info('Validating repository URL and preparing environment...');
            if (!this.isValidGitUrl(repositoryUrl)) {
                throw new Error('Invalid Git repository URL format');
            }

            // Ensure clean temp directory exists
            await fs.rm(targetDir, { recursive: true, force: true });
            await fs.mkdir(this.tempDir, { recursive: true });
            
            // Enhanced clone process with progress tracking
            const cloneStartTime = Date.now();
            logger.info('Initiating repository clone...');
            await this.cloneRepository(repositoryUrl, targetDir);
            const cloneTime = ((Date.now() - cloneStartTime) / 1000).toFixed(1);
            logger.info(`Repository cloned successfully in ${cloneTime}s`);

            // Enhanced branch detection and checkout
            try {
                logger.info('Detecting and checking out default branch...');
                await this.detectAndCheckoutDefaultBranch(targetDir);
            } catch (branchError) {
                // Non-critical error, continue with current branch
                logger.warn(`Branch detection failed: ${branchError.message}. Continuing with current branch.`);
            }

            // Enhanced template validation with detailed feedback
            logger.info('Beginning comprehensive template validation...');
            const validationStartTime = Date.now();
            
            // Validate core template structure
            const template = await this.validateTemplate(targetDir);
            
            // Enhanced validation with detailed file and structure checks
            const requiredFiles = ['package.json'];
            const recommendedFiles = ['README.md', '.gitignore', 'src/index.js'];
            const optionalFiles = ['.npmignore', 'LICENSE', 'CONTRIBUTING.md'];
            const criticalErrors = [];
            const warnings = [];
            const suggestions = [];

            // Comprehensive file validation with content checks
            for (const file of requiredFiles) {
                const filePath = path.join(targetDir, file);
                try {
                    await fs.access(filePath);
                    const content = await fs.readFile(filePath, 'utf-8');
                    
                    // Additional validation for package.json
                    if (file === 'package.json') {
                        try {
                            const pkg = JSON.parse(content);
                            if (!pkg.name) warnings.push('package.json missing name field');
                            if (!pkg.version) warnings.push('package.json missing version field');
                            if (!pkg.scripts) warnings.push('package.json missing scripts section');
                            logger.info('package.json validated successfully');
                        } catch (e) {
                            criticalErrors.push(`Invalid JSON in ${file}: ${e.message}`);
                        }
                    }
                    logger.info(`Validated required file: ${file}`);
                } catch (error) {
                    criticalErrors.push(`Required file '${file}' validation failed: ${error.message}`);
                }
            }

            // Check recommended files with specific validations
            for (const file of recommendedFiles) {
                const filePath = path.join(targetDir, file);
                try {
                    await fs.access(filePath);
                    if (file === 'README.md') {
                        const content = await fs.readFile(filePath, 'utf-8');
                        if (content.length < 100) {
                            suggestions.push('README.md seems too brief. Consider adding more documentation.');
                        }
                    }
                    logger.info(`Found recommended file: ${file}`);
                } catch {
                    warnings.push(`Recommended file '${file}' not found in template`);
                }
            }

            // Check optional files
            for (const file of optionalFiles) {
                const filePath = path.join(targetDir, file);
                try {
                    await fs.access(filePath);
                    logger.info(`Found optional file: ${file}`);
                } catch {
                    suggestions.push(`Consider adding ${file} to improve template completeness`);
                }
            }

            // Handle validation results
            if (criticalErrors.length > 0) {
                const errorMessage = criticalErrors.join('\n');
                logger.error(`Template validation failed:\n${errorMessage}`);
                throw new Error(errorMessage);
            }

            if (warnings.length > 0) {
                warnings.forEach(warning => logger.warn(warning));
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
            
            // Ensure template directory exists
            if (!await fsExtra.pathExists(templateDir)) {
                throw new Error('Template directory not found');
            }

            // Track validation progress and project characteristics
            const validation = {
                hasPackageJson: false,
                hasSourceFiles: false,
                hasTests: false,
                hasDocumentation: false,
                hasBuildConfig: false,
                totalFiles: 0,
                errors: [],
                warnings: []
            };

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

            // Initialize metrics for structure detection
            let fileCount = 0;
            let directoryCount = 0;
            const fileTypes = new Set();
            const detectedFeatures = new Set();

            // Track project characteristics
            let hasTypeScript = false;
            let hasTests = false;
            let hasDocumentation = false;
            let hasBuildConfig = false;

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
                                    name: template.name,
                                    port: template.variables?.port || 3000,
                                    modules: {},
                                    localModules: {}
                                });
                            } else if (entry.name === 'app.js.ejs') {
                                files['app.js'] = ejs.render(content, {
                                    view: template.variables?.view || 'jade',
                                    css: template.variables?.css || 'css',
                                    modules: {
                                        'logger': 'morgan',
                                        'bodyParser': 'body-parser',
                                        'path': 'path',
                                        'cookieParser': 'cookie-parser',
                                        'debug': 'debug'
                                    },
                                    localModules: {
                                        'indexRouter': './routes/index',
                                        'usersRouter': './routes/users'
                                    }
                                });
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
                                files[`routes/${path.basename(relativePath)}`] = content;
                            } else if (relativePath.startsWith('templates/css/')) {
                                // Move CSS files to public/stylesheets
                                files[`public/stylesheets/${path.basename(relativePath)}`] = content;
                            } else if (relativePath.startsWith('templates/js/')) {
                                // Process other JS files
                                files[path.basename(relativePath)] = content;
                            } else {
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
