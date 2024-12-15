const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const os = require('os');
const { URL } = require('url');
const { minimatch } = require('minimatch');

class RemoteTemplateManager {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), '.nodeforge-templates');
    }

    async detectAndCheckoutDefaultBranch(repoPath) {
        try {
            // Initialize git in the repo path if not already initialized
            try {
                execSync('git init', { cwd: repoPath, stdio: 'pipe' });
            } catch (initError) {
                logger.warn(`Git init failed: ${initError.message}`);
            }

            // Try to get the default branch name from remote
            try {
                execSync('git remote add origin "' + this.currentUrl + '"', {
                    cwd: repoPath,
                    stdio: 'pipe'
                });
                
                execSync('git fetch origin', {
                    cwd: repoPath,
                    stdio: 'pipe'
                });

                const branches = execSync('git branch -r', {
                    cwd: repoPath,
                    encoding: 'utf8',
                    stdio: 'pipe'
                });

                const defaultBranch = branches.split('\n')
                    .find(b => b.includes('HEAD ->'))?.split('->')[1]?.trim() || 'main';

                // Checkout the default branch
                execSync(`git checkout -b ${defaultBranch}`, {
                    cwd: repoPath,
                    stdio: 'pipe'
                });

                return defaultBranch;
            } catch (error) {
                logger.warn(`Branch detection failed, using default: ${error.message}`);
                return 'main';
            }
        } catch (error) {
            logger.warn(`Failed to setup git: ${error.message}`);
            return 'main'; // Fallback to main if everything fails
        }
    }

    async validateTemplateStructure(templatePath) {
        try {
            const issues = [];
            const warnings = [];
            
            // Check if directory exists and is accessible
            try {
                await fs.access(templatePath);
            } catch {
                issues.push('Template directory is not accessible');
                return { isValid: false, issues, warnings };
            }
            
            // Initialize validation result
            const validationResult = {
                isValid: false,
                issues,
                warnings,
                details: {
                    hasPackageJson: false,
                    sourceFileCount: 0,
                    warningCount: 0,
                    issueCount: 0,
                    configStatus: 'missing'
                }
            };
            
            // Check package.json
            const packageJsonPath = path.join(templatePath, 'package.json');
            try {
                const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
                const packageJson = JSON.parse(packageJsonContent);
                validationResult.details.hasPackageJson = true;
                
                // Validate minimum package.json requirements
                const requiredFields = ['name', 'version'];
                for (const field of requiredFields) {
                    if (!packageJson[field]) {
                        warnings.push(`package.json missing required field: ${field}`);
                    }
                }
                
                // Check dependencies
                if (!packageJson.dependencies && !packageJson.devDependencies) {
                    warnings.push('No dependencies defined in package.json');
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    warnings.push('package.json not found, will use defaults');
                } else {
                    issues.push(`Invalid package.json: ${error.message}`);
                }
            }
            
            // Scan for source files
            try {
                const files = await fs.readdir(templatePath, { recursive: true, withFileTypes: true });
                const sourceFiles = files.filter(file => {
                    if (!file.isFile()) return false;
                    const filePath = path.join(file.path || '', file.name);
                    const relativePath = path.relative(templatePath, filePath);
                    return !relativePath.includes('node_modules') &&
                           !relativePath.startsWith('.git') &&
                           !relativePath.includes('test') &&
                           (file.name.endsWith('.js') || 
                            file.name.endsWith('.ts') ||
                            file.name.endsWith('.jsx') ||
                            file.name.endsWith('.tsx'));
                });
                
                validationResult.details.sourceFileCount = sourceFiles.length;
                if (sourceFiles.length === 0) {
                    warnings.push('No JavaScript/TypeScript source files found');
                }
            } catch (error) {
                issues.push(`Failed to scan source files: ${error.message}`);
            }
            
            // Validate template configuration
            try {
                const configPath = path.join(templatePath, 'nodeforge.json');
                const configContent = await fs.readFile(configPath, 'utf-8');
                const config = JSON.parse(configContent);
                
                validationResult.details.configStatus = 'found';
                if (!config.template) {
                    warnings.push('nodeforge.json missing template configuration');
                } else {
                    const requiredConfigFields = ['name', 'version', 'description'];
                    const missingFields = requiredConfigFields.filter(field => !config.template[field]);
                    if (missingFields.length > 0) {
                        warnings.push(`Missing required template fields: ${missingFields.join(', ')}`);
                    }
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    issues.push(`Invalid nodeforge.json: ${error.message}`);
                }
                validationResult.details.configStatus = error.code === 'ENOENT' ? 'missing' : 'invalid';
            }
            
            // Update validation result
            validationResult.isValid = issues.length === 0;
            validationResult.details.warningCount = warnings.length;
            validationResult.details.issueCount = issues.length;
            
            return validationResult;
        } catch (error) {
            logger.error(`Template validation failed: ${error.message}`);
            throw new Error(`Template validation failed: ${error.message}`);
        }
    }

    async fetchTemplate(url, retries = 3) {
        logger.info(`Fetching remote template from: ${url}`);
        this.currentUrl = url;  // Store the URL for later use
        let targetDir = '';
        let attempt = 0;
        const maxDelay = 30000; // Maximum delay between retries (30 seconds)

        const createTempDir = async () => {
            await fs.mkdir(this.tempDir, { recursive: true });
            return path.join(this.tempDir, `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        };

        const prepareGitUrl = (originalUrl) => {
            try {
                if (!originalUrl.startsWith('https://github.com/')) {
                    return originalUrl;
                }

                const tokenUrl = new URL(originalUrl);
                if (process.env.GITHUB_TOKEN) {
                    // Use token in the URL for authentication
                    tokenUrl.username = process.env.GITHUB_TOKEN;
                    logger.debug('Using authenticated GitHub URL');
                    return tokenUrl.toString();
                }

                // For public repositories
                logger.warn('No GitHub token found, using public access');
                return originalUrl;
            } catch (error) {
                logger.warn(`Invalid URL format: ${error.message}, using original URL`);
                return originalUrl;
            }
        };

        const cleanupDirectory = async (dir) => {
            if (!dir) return;
            try {
                await fs.rm(dir, { recursive: true, force: true });
                logger.debug(`Cleaned up directory: ${dir}`);
            } catch (error) {
                logger.warn(`Failed to clean up directory ${dir}: ${error.message}`);
            }
        };

        while (attempt < retries) {
            try {
                targetDir = await createTempDir();
                const gitUrl = prepareGitUrl(url);
                
                logger.info(`Cloning repository (attempt ${attempt + 1}/${retries})...`);
                
                // Enhanced git clone with better error handling
                const cloneProcess = execSync(
                    `git clone --depth 1 --single-branch "${gitUrl}" "${targetDir}"`,
                    { 
                        stdio: 'pipe',
                        timeout: 120000, // 2 minutes timeout
                        env: {
                            ...process.env,
                            GIT_TERMINAL_PROMPT: '0',
                            GIT_SSL_NO_VERIFY: '0',
                            GIT_ASKPASS: 'echo', // Prevent credential prompt
                            GIT_CONFIG_NOSYSTEM: '1', // Ignore system git config
                            GIT_CONFIG_GLOBAL: '/dev/null' // Ignore global git config
                        },
                        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
                    }
                );

                // Verify repository contents
                if (!await fs.access(path.join(targetDir, '.git'))
                    .then(() => true)
                    .catch(() => false)) {
                    throw new Error('Git repository was not cloned correctly');
                }

                // Check for express-generator specific files
                const isExpressGenerator = await fs.access(path.join(targetDir, 'bin', 'express-cli.js'))
                    .then(() => true)
                    .catch(() => false);

                if (isExpressGenerator) {
                    logger.info('Detected Express Generator template');
                    // For Express generator, we'll skip git operations
                    return {
                        url,
                        path: targetDir,
                        packageJson: {
                            name: 'express-app',
                            version: '0.0.0',
                            private: true,
                            scripts: {
                                start: 'node ./bin/www'
                            },
                            dependencies: {
                                'cookie-parser': '~1.4.4',
                                'debug': '~2.6.9',
                                'express': '~4.16.1',
                                'morgan': '~1.9.1'
                            }
                        },
                        defaultBranch: 'master',
                        isExpressGenerator: true
                    };
                }

                logger.info('Processing as standard template');
                // Detect and checkout default branch
                const defaultBranch = await this.detectAndCheckoutDefaultBranch(targetDir);
                logger.info(`Using default branch: ${defaultBranch}`);

                // Clean git-related files
                const filesToClean = [
                    path.join(targetDir, '.git'),
                    path.join(targetDir, '.gitignore'),
                    path.join(targetDir, '.gitattributes'),
                    path.join(targetDir, '.github'),
                    path.join(targetDir, '.gitlab-ci.yml')
                ];

                await Promise.all(
                    filesToClean.map(file => 
                        fs.rm(file, { recursive: true, force: true }).catch(() => null)
                    )
                );

                // Read package.json with fallback
                const packageJson = await fs.readFile(path.join(targetDir, 'package.json'), 'utf-8')
                    .then(content => JSON.parse(content))
                    .catch(() => ({
                        name: path.basename(targetDir),
                        version: '0.0.1',
                        description: isExpressGenerator ? 'Express application generator' : 'Remote template'
                    }));

                logger.success('Template fetched and processed successfully');
                return {
                    url,
                    path: targetDir,
                    packageJson,
                    defaultBranch,
                    isExpressGenerator
                };

            } catch (error) {
                attempt++;
                await cleanupDirectory(targetDir);
                
                if (attempt === retries) {
                    throw new Error(`Failed to fetch template after ${retries} attempts: ${error.message}`);
                }

                // Exponential backoff with jitter
                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 2000, maxDelay);
                logger.warn(`Retry ${attempt}/${retries} in ${Math.round(delay/1000)}s: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
            logger.info('Cleaned up temporary files');
        } catch (error) {
            logger.warn(`Cleanup failed: ${error.message}`);
        }
    }

    async loadTemplateFiles(template) {
        try {
            const { path: templatePath } = template;
            logger.info(`Loading template files from: ${templatePath}`);
            
            // Special handling for express-generator structure
            const isExpressGenerator = await fs.access(path.join(templatePath, 'bin', 'express-cli.js'))
                .then(() => true)
                .catch(() => false);

            let templateConfig = {
                template: {
                    name: path.basename(templatePath),
                    version: '1.0.0',
                    description: 'Express application generator',
                    variables: [
                        { name: 'view', type: 'string', default: 'jade' },
                        { name: 'css', type: 'string', default: 'plain' },
                        { name: 'gitignore', type: 'boolean', default: true }
                    ]
                }
            };

            // Load package.json for metadata
            let packageJson = {};
            try {
                const packageJsonPath = path.join(templatePath, 'package.json');
                const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
                packageJson = JSON.parse(packageJsonContent);
                logger.debug('Found package.json metadata');
            } catch {
                packageJson = {
                    name: path.basename(templatePath),
                    version: '1.0.0',
                    description: templateConfig.template.description
                };
            }

            // For express-generator, use a different approach
            const templateFiles = [];
            if (isExpressGenerator) {
                logger.info('Processing Express Generator template...');
                    
                // Create basic Express app structure
                templateFiles.push({
                    path: 'app.js',
                    content: `const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const app = express();
const port = process.env.PORT || 3000;

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.json({ message: 'Express server is running' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(\`Server listening at http://0.0.0.0:\${port}\`);
});

module.exports = app;`.trim()
                });

                // Create routes
                templateFiles.push({
                    path: 'routes/index.js',
                    content: `
const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
  res.send('Express server is running');
});

module.exports = router;
`.trim()
                });

                templateFiles.push({
                    path: 'routes/users.js',
                    content: `
const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

module.exports = router;
`.trim()
                });

                // Create bin/www
                templateFiles.push({
                    path: 'bin/www',
                    content: `#!/usr/bin/env node

const app = require('../app');
const debug = require('debug')('express-app:server');
const http = require('http');

const port = process.env.PORT || '3000';
app.set('port', port);

const server = http.createServer(app);
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }
  switch (error.code) {
    case 'EACCES':
      console.error('Port ' + port + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error('Port ' + port + ' is already in use');
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
`.trim()
                });

                // Create package.json specifically for Express
                templateFiles.push({
                    path: 'package.json',
                    content: JSON.stringify({
                        name: 'express-app',
                        version: '0.0.0',
                        private: true,
                        scripts: {
                            start: 'node ./bin/www'
                        },
                        dependencies: {
                            'cookie-parser': '~1.4.4',
                            'debug': '~2.6.9',
                            'express': '~4.16.1',
                            'morgan': '~1.9.1'
                        }
                    }, null, 2)
                });

                logger.success('Express Generator template processed successfully');
            } else {
                // Standard template processing
                const ignorePatterns = [
                    '**/node_modules/**',
                    '**/.git/**',
                    '**/.github/**',
                    '**/test/**',
                    '**/__tests__/**',
                    '**/coverage/**',
                    '**/.env',
                    '**/*.test.*',
                    '**/*.spec.*'
                ];

                const processDirectory = async (dirPath) => {
                    const entries = await fs.readdir(dirPath, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dirPath, entry.name);
                        const relativePath = path.relative(templatePath, fullPath);
                        
                        if (ignorePatterns.some(pattern => minimatch(relativePath, pattern, { dot: true }))) {
                            continue;
                        }

                        if (entry.isDirectory()) {
                            await processDirectory(fullPath);
                        } else if (entry.isFile()) {
                            try {
                                const content = await fs.readFile(fullPath, 'utf-8');
                                templateFiles.push({
                                    path: relativePath,
                                    content
                                });
                            } catch (error) {
                                logger.warn(`Skipping file ${relativePath}: ${error.message}`);
                            }
                        }
                    }
                };
                await processDirectory(templatePath);
            }

            if (templateFiles.length === 0) {
                throw new Error('No valid template files found');
            }

            const files = Object.fromEntries(
                templateFiles.map(file => [file.path, file.content])
            );

            logger.success(`Loaded ${templateFiles.length} template files successfully`);

            return {
                ...template,
                files,
                config: templateConfig,
                packageJson,
                valid: true
            };
        } catch (error) {
            logger.error(`Failed to load template files: ${error.message}`);
            throw error;
        }
    }

}

module.exports = new RemoteTemplateManager();