const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const os = require('os');
const { URL } = require('url');

class RemoteTemplateManager {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), '.nodeforge-templates');
    }

    async detectAndCheckoutDefaultBranch(repoPath) {
        try {
            // Get the default branch name
            const defaultBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
                cwd: repoPath,
                encoding: 'utf8'
            }).trim().replace('refs/remotes/origin/', '');

            // Checkout the default branch
            execSync(`git checkout ${defaultBranch}`, {
                cwd: repoPath,
                stdio: 'pipe'
            });

            return defaultBranch;
        } catch (error) {
            logger.warn(`Failed to detect/checkout default branch: ${error.message}`);
            return 'main'; // Fallback to main if detection fails
        }
    }

    async validateTemplateStructure(templatePath) {
        const issues = [];
        const templateInfo = {
            hasPackageJson: false,
            hasNodeforgeConfig: false,
            templateFiles: [],
            config: {}
        };

        try {
            // Check for package.json
            const packageJsonPath = path.join(templatePath, 'package.json');
            try {
                await fs.access(packageJsonPath);
                templateInfo.hasPackageJson = true;
            } catch {
                logger.warn('No package.json found in template');
            }

            // Scan for potential template files
            const files = await fs.readdir(templatePath, { recursive: true });
            templateInfo.templateFiles = files.filter(file => 
                !file.includes('node_modules') && 
                !file.startsWith('.git') &&
                !file.startsWith('.')
            );

            if (templateInfo.templateFiles.length === 0) {
                issues.push('No template files found in repository');
            }

            // Check for nodeforge.json configuration
            const configPath = path.join(templatePath, 'nodeforge.json');
            try {
                const configContent = await fs.readFile(configPath, 'utf-8');
                const config = JSON.parse(configContent);
                templateInfo.hasNodeforgeConfig = true;
                templateInfo.config = config;
            } catch {
                logger.info('No nodeforge.json found, will use default configuration');
                templateInfo.config = {
                    template: {
                        name: path.basename(templatePath),
                        version: '1.0.0',
                        description: 'Remote template'
                    }
                };
            }

            // Validate minimum requirements
            if (!templateInfo.hasPackageJson && !templateInfo.templateFiles.some(f => f.endsWith('.js') || f.endsWith('.ts'))) {
                issues.push('No JavaScript/TypeScript files found in template');
            }

            return {
                isValid: issues.length === 0,
                issues,
                templateInfo
            };
        } catch (error) {
            logger.error(`Template validation error: ${error.message}`);
            return {
                isValid: false,
                issues: [`Failed to validate template: ${error.message}`],
                templateInfo
            };
        }
    }

    async fetchTemplate(url, retries = 3) {
        logger.info(`Fetching remote template from: ${url}`);
        let targetDir = '';
        let attempt = 0;

        while (attempt < retries) {
            try {
                // Create temp directory for template
                await fs.mkdir(this.tempDir, { recursive: true });
                targetDir = path.join(this.tempDir, `template-${Date.now()}`);
                
                // Handle GitHub URLs with token
                let gitUrl = url;
                if (url.startsWith('https://github.com/')) {
                    if (process.env.GITHUB_TOKEN) {
                        const tokenUrl = new URL(url);
                        tokenUrl.username = process.env.GITHUB_TOKEN;
                        gitUrl = tokenUrl.toString();
                        logger.debug('Using authenticated GitHub URL');
                    } else {
                        logger.warn('No GitHub token found, using public access');
                    }
                }

                // Clone repository with timeout and specific options
                logger.info(`Cloning repository (attempt ${attempt + 1}/${retries})...`);
                execSync(
                    `git clone --depth 1 --single-branch "${gitUrl}" "${targetDir}"`,
                    { 
                        stdio: 'pipe',
                        timeout: 60000, // 60 second timeout
                        env: {
                            ...process.env,
                            GIT_TERMINAL_PROMPT: '0' // Disable git prompts
                        }
                    }
                );

                // Verify the clone was successful
                const gitDirExists = await fs.access(path.join(targetDir, '.git'))
                    .then(() => true)
                    .catch(() => false);
                
                if (!gitDirExists) {
                    throw new Error('Git repository was not cloned correctly');
                }

                // Checkout default branch
                const defaultBranch = await this.detectAndCheckoutDefaultBranch(targetDir);
                logger.info(`Using default branch: ${defaultBranch}`);
                
                // Validate template structure
                const validation = await this.validateTemplateStructure(targetDir);
                if (!validation.isValid) {
                    throw new Error(`Invalid template structure: ${validation.issues.join(', ')}`);
                }

                // Read package.json
                const packageJsonPath = path.join(targetDir, 'package.json');
                const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
                const packageJson = JSON.parse(packageJsonContent);

                logger.success('Template fetched and validated successfully');
                
                // Clean up .git directory to save space
                await fs.rm(path.join(targetDir, '.git'), { recursive: true, force: true });
                
                return {
                    url,
                    path: targetDir,
                    packageJson,
                    defaultBranch
                };
            } catch (error) {
                attempt++;
                logger.warn(`Template fetch attempt ${attempt} failed: ${error.message}`);
                
                if (targetDir) {
                    try {
                        await fs.rm(targetDir, { recursive: true, force: true });
                    } catch (cleanupError) {
                        logger.warn(`Cleanup failed: ${cleanupError.message}`);
                    }
                }
                
                if (attempt === retries) {
                    throw new Error(`Failed to fetch template after ${retries} attempts: ${error.message}`);
                }
                
                // Exponential backoff with jitter
                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
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
}

module.exports = new RemoteTemplateManager();