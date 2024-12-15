const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const os = require('os');
const { URL } = require('url');
const { minimatch } = require('minimatch');
const crypto = require('crypto');

class RemoteTemplateManager {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), '.nodeforge-templates');
        this.cacheDir = path.join(os.homedir(), '.nodeforge', 'template-cache');
        this.cacheMetadataFile = path.join(this.cacheDir, 'metadata.json');
        this.currentUrl = null;
        this.init();
    }

    async init() {
        await fs.mkdir(this.tempDir, { recursive: true });
        await fs.mkdir(this.cacheDir, { recursive: true });
        await this.initializeCache();
    }

    detectTemplateSource(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            
            if (hostname === 'github.com') return 'github';
            if (hostname === 'gitlab.com') return 'gitlab';
            if (hostname === 'bitbucket.org') return 'bitbucket';
            if (hostname.includes('azure.com')) return 'azure-devops';
            
            return 'generic-git';
        } catch (error) {
            logger.warn(`Failed to detect template source: ${error.message}`);
            return 'unknown';
        }
    }

    async initializeCache() {
        try {
            const exists = await fs.access(this.cacheMetadataFile)
                .then(() => true)
                .catch(() => false);
            
            if (!exists) {
                await fs.writeFile(
                    this.cacheMetadataFile,
                    JSON.stringify({
                        version: '1.0.0',
                        templates: {},
                        lastCleanup: Date.now()
                    }, null, 2)
                );
            }
        } catch (error) {
            logger.warn(`Failed to initialize cache: ${error.message}`);
        }
    }

    async getCacheKey(url, version = 'latest') {
        const hash = crypto.createHash('sha256')
            .update(`${url}#${version}`)
            .digest('hex');
        return hash.substring(0, 12);
    }

    async getCachedTemplate(url, version = 'latest') {
        try {
            const metadata = await this.getCacheMetadata();
            const cacheKey = await this.getCacheKey(url, version);
            const cachedTemplate = metadata.templates[cacheKey];

            if (!cachedTemplate) {
                return null;
            }

            // Check if cache is still valid (24 hours)
            const cacheAge = Date.now() - cachedTemplate.timestamp;
            if (cacheAge > 24 * 60 * 60 * 1000) {
                delete metadata.templates[cacheKey];
                await this.saveCacheMetadata(metadata);
                return null;
            }

            const templatePath = path.join(this.cacheDir, cacheKey);
            const exists = await fs.access(templatePath)
                .then(() => true)
                .catch(() => false);

            if (!exists) {
                delete metadata.templates[cacheKey];
                await this.saveCacheMetadata(metadata);
                return null;
            }

            logger.info(`Using cached template: ${url}@${version}`);
            return {
                path: templatePath,
                ...cachedTemplate
            };
        } catch (error) {
            logger.warn(`Cache lookup failed: ${error.message}`);
            return null;
        }
    }

    async getCacheMetadata() {
        try {
            const content = await fs.readFile(this.cacheMetadataFile, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            return { version: '1.0.0', templates: {}, lastCleanup: Date.now() };
        }
    }

    async saveCacheMetadata(metadata) {
        await fs.writeFile(
            this.cacheMetadataFile,
            JSON.stringify(metadata, null, 2)
        );
    }

    async cleanCache() {
        try {
            const metadata = await this.getCacheMetadata();
            const now = Date.now();
            let cleaned = 0;

            // Clean up old entries (older than 7 days)
            for (const [key, template] of Object.entries(metadata.templates)) {
                if (now - template.timestamp > 7 * 24 * 60 * 60 * 1000) {
                    const cachePath = path.join(this.cacheDir, key);
                    await fs.rm(cachePath, { recursive: true, force: true });
                    delete metadata.templates[key];
                    cleaned++;
                }
            }

            metadata.lastCleanup = now;
            await this.saveCacheMetadata(metadata);
            
            if (cleaned > 0) {
                logger.info(`Cleaned ${cleaned} cached templates`);
            }
        } catch (error) {
            logger.warn(`Cache cleanup failed: ${error.message}`);
        }
    }

    async detectAndCheckoutDefaultBranch(repoPath, version = 'latest') {
        try {
            // First, try to checkout the specific version if provided
            if (version && version !== 'latest') {
                try {
                    logger.info(`Attempting to checkout version: ${version}`);
                    
                    // Fetch all tags and refs with depth 1 to speed up the process
                    logger.info('Fetching repository tags and refs...');
                    execSync('git fetch --tags --force --depth=1 origin', {
                        cwd: repoPath,
                        stdio: 'pipe',
                        timeout: 30000
                    });

                    // Get all available tags and parse them
                    const tags = execSync('git tag', { cwd: repoPath, encoding: 'utf8' })
                        .split('\n')
                        .filter(Boolean)
                        .map(tag => ({
                            original: tag,
                            normalized: tag.replace(/^v/, '').replace(/\.0$/, '')
                        }))
                        .sort((a, b) => {
                            // Sort tags in descending order (newer versions first)
                            return b.normalized.localeCompare(a.normalized, undefined, { numeric: true, sensitivity: 'base' });
                        });

                    logger.info(`Found ${tags.length} version tags`);

                    // Try exact match first
                    const normalizedVersion = version.replace(/^v/, '');
                    const exactMatch = tags.find(tag => 
                        tag.normalized === normalizedVersion || 
                        tag.original === version ||
                        tag.original === `v${version}`
                    );

                    if (exactMatch) {
                        logger.info(`Found exact matching version: ${exactMatch.original}`);
                        execSync(`git checkout ${exactMatch.original}`, {
                            cwd: repoPath,
                            stdio: 'pipe'
                        });
                        logger.success(`Successfully checked out version: ${exactMatch.original}`);
                        return exactMatch.original;
                    }

                    // Try to find closest match based on semver
                    const baseVersion = normalizedVersion.split('.')[0];
                    const matchingTags = tags.filter(tag => 
                        tag.normalized.startsWith(baseVersion + '.')
                    );

                    if (matchingTags.length > 0) {
                        const closestMatch = matchingTags[0];
                        logger.info(`Found closest matching version: ${closestMatch.original}`);
                        execSync(`git checkout ${closestMatch.original}`, {
                            cwd: repoPath,
                            stdio: 'pipe'
                        });
                        logger.success(`Checked out closest matching version: ${closestMatch.original}`);
                        return closestMatch.original;
                    }

                    logger.warn(`Version ${version} not found, falling back to default branch`);
                } catch (versionError) {
                    logger.warn(`Failed to checkout version ${version}: ${versionError.message}`);
                }
            }

            // Fallback to default branch detection
            const remoteRefs = execSync('git ls-remote --symref origin HEAD', {
                cwd: repoPath,
                encoding: 'utf8',
                stdio: 'pipe'
            });

            let defaultBranch = 'master'; // Default fallback
            const refMatch = remoteRefs.match(/ref: refs\/heads\/([^\t\n]+)/);
            if (refMatch) {
                defaultBranch = refMatch[1];
            }

            // Try to checkout the detected default branch
            execSync(`git checkout -b ${defaultBranch} origin/${defaultBranch}`, {
                cwd: repoPath,
                stdio: 'pipe'
            });

            logger.success(`Successfully checked out branch: ${defaultBranch}`);
            return defaultBranch;

        } catch (error) {
            logger.warn(`Branch detection and fetch failed: ${error.message}`);
            return 'master';
        }
    }

    async fetchTemplate(url, retries = 3, options = {}) {
        const startTime = Date.now();
        logger.info(`Fetching remote template from: ${url}`);
        this.currentUrl = url;
        
        const { version = 'latest' } = options;
        logger.info(`Requested template version: ${version}`);
        
        // Generate cache key for this template and version
        const cacheKey = await this.getCacheKey(url, version);
        
        // Check cache first
        logger.info('Checking template cache...');
        const cachedTemplate = await this.getCachedTemplate(url, version);
        if (cachedTemplate) {
            logger.success(`Using cached template (version: ${version})`);
            return cachedTemplate;
        }
        logger.info('No cached version found, fetching from remote...');
        
        // Detect template source
        const templateSource = this.detectTemplateSource(url);
        logger.info(`Detected template source: ${templateSource}`);
        
        let targetDir = '';
        let attempt = 0;
        const maxDelay = 30000; // Maximum delay between retries (30 seconds)

        const createTempDir = async () => {
            await fs.mkdir(this.tempDir, { recursive: true });
            const tempDir = path.join(this.tempDir, `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
            await fs.rm(tempDir, { recursive: true, force: true }).catch(() => null);
            await fs.mkdir(tempDir, { recursive: true });
            return tempDir;
        };

        while (attempt < retries) {
            try {
                targetDir = await createTempDir();
                
                logger.info(`Cloning repository (attempt ${attempt + 1}/${retries})...`);
                
                execSync(
                    `git clone --depth 1 --single-branch "${url}" "${targetDir}"`,
                    { 
                        stdio: 'pipe',
                        timeout: 120000,
                        env: {
                            ...process.env,
                            GIT_TERMINAL_PROMPT: '0',
                            GIT_SSL_NO_VERIFY: '0',
                            GIT_ASKPASS: 'echo'
                        }
                    }
                );

                // Check for express-specific files
                const isExpressRepo = url.includes('expressjs/express.git');
                const hasExpressGenerator = await fs.access(path.join(targetDir, 'bin', 'express-cli.js'))
                    .then(() => true)
                    .catch(() => false);
                
                if (isExpressRepo || hasExpressGenerator) {
                    logger.info('Detected Express.js project template');
                    
                    // For Express main repo, use hello-world example
                    if (isExpressRepo) {
                        logger.info('Using hello-world example as template');
                        const exampleDir = path.join(targetDir, 'examples', 'hello-world');
                        targetDir = exampleDir;
                    }
                }

                // Select specific version if provided
                const selectedVersion = await this.detectAndCheckoutDefaultBranch(targetDir, version);
                logger.info(`Using template version: ${selectedVersion}`);
                
                // Update template metadata
                template.version = selectedVersion;
                template.originalVersion = version;
                
                // Clean git files
                await fs.rm(path.join(targetDir, '.git'), { recursive: true, force: true }).catch(() => null);
                
                const template = {
                    url,
                    path: targetDir,
                    defaultBranch: selectedVersion,
                    isExpressGenerator: hasExpressGenerator,
                    packageJson: await this.readPackageJson(targetDir)
                };

                // Cache the template
                await this.cacheTemplate(template, url, version);
                
                logger.success(`Template fetched and processed successfully`);
                return template;

            } catch (error) {
                attempt++;
                await fs.rm(targetDir, { recursive: true, force: true }).catch(() => null);
                
                if (attempt === retries) {
                    throw new Error(`Failed to fetch template after ${retries} attempts: ${error.message}`);
                }

                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 2000, maxDelay);
                logger.warn(`Retry ${attempt}/${retries} in ${Math.round(delay/1000)}s: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async readPackageJson(templatePath) {
        try {
            const content = await fs.readFile(path.join(templatePath, 'package.json'), 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            logger.warn('No package.json found or invalid format');
            return null;
        }
    }

    async cacheTemplate(template, url, version) {
        try {
            const cacheKey = await this.getCacheKey(url, version);
            const cachePath = path.join(this.cacheDir, cacheKey);
            const metadata = await this.getCacheMetadata();
            
            // Ensure cache directory exists
            await fs.mkdir(cachePath, { recursive: true });
            
            // Copy all template files recursively
            const copyFiles = async (srcDir, destDir) => {
                const entries = await fs.readdir(srcDir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const srcPath = path.join(srcDir, entry.name);
                    const destPath = path.join(destDir, entry.name);
                    
                    if (entry.isDirectory()) {
                        if (entry.name !== 'node_modules' && entry.name !== '.git') {
                            await fs.mkdir(destPath, { recursive: true });
                            await copyFiles(srcPath, destPath);
                        }
                    } else {
                        await fs.copyFile(srcPath, destPath);
                    }
                }
            };
            
            await copyFiles(template.path, cachePath);
            
            // Save template metadata
            const templateMetadata = {
                name: template.packageJson?.name || path.basename(url, '.git'),
                version: template.version || version,
                originalVersion: version,
                url,
                timestamp: Date.now(),
                packageJson: template.packageJson,
                isExpressGenerator: template.isExpressGenerator || false,
                defaultBranch: template.defaultBranch || 'master'
            };
            
            metadata.templates[cacheKey] = templateMetadata;
            await this.saveCacheMetadata(metadata);
            
            await fs.writeFile(
                path.join(cachePath, 'metadata.json'),
                JSON.stringify(templateMetadata, null, 2)
            );
            
            logger.success(`Template cached successfully: ${templateMetadata.name} (${version})`);
            return cachePath;
        } catch (error) {
            logger.error(`Failed to cache template: ${error.message}`);
            throw error;
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
            
            const files = {};
            const entries = await fs.readdir(templatePath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && !entry.name.startsWith('.')) {
                    const filePath = path.join(templatePath, entry.name);
                    const content = await fs.readFile(filePath, 'utf-8');
                    files[entry.name] = content;
                }
            }
            
            logger.success(`Loaded ${Object.keys(files).length} template files successfully`);
            return files;
        } catch (error) {
            logger.error(`Failed to load template files: ${error.message}`);
            throw error;
        }
    }

    async validateTemplateStructure(templatePath) {
        try {
            const issues = [];
            const warnings = [];
            const startTime = Date.now();
            
            logger.info(`Validating template structure at: ${templatePath}`);
            
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
                    templateType: 'unknown',
                    warningCount: 0,
                    issueCount: 0,
                    configStatus: 'missing',
                    validationTime: 0
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
                    issues.push(`Invalid nodesmith.json: ${error.message}`);
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
}

module.exports = new RemoteTemplateManager();