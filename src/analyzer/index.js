const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

class ProjectAnalyzer {
    constructor() {
        this.metrics = {
            structure: {},
            dependencies: {},
            security: {},
            quality: {},
            practices: {},
            performance: {},
            complexity: {},
            customRules: {}
        };
        
        // Bind all methods to this instance
        this.analyzeProject = this.analyzeProject.bind(this);
        this.analyzeStructure = this.analyzeStructure.bind(this);
        this.analyzeDependencies = this.analyzeDependencies.bind(this);
        this.analyzeSecurity = this.analyzeSecurity.bind(this);
        this.analyzeCodeQuality = this.analyzeCodeQuality.bind(this);
        this.checkBestPractices = this.checkBestPractices.bind(this);
        this.analyzePerformance = this.analyzePerformance.bind(this);
        this.analyzeComplexity = this.analyzeComplexity.bind(this);
    }

    async analyzeProject(projectPath) {
        try {
            logger.info('Starting project analysis...');
            
            // Core analysis
            await this.analyzeStructure(projectPath);
            await this.analyzeDependencies(projectPath);
            await this.analyzeSecurity(projectPath);
            await this.analyzeCodeQuality(projectPath);
            await this.checkBestPractices(projectPath);
            
            // Advanced analysis
            await this.analyzePerformance(projectPath);
            await this.analyzeComplexity(projectPath);
            
            // Generate comprehensive report with new metrics
            const report = this.generateReport();
            
            // Add performance recommendations
            if (this.metrics.performance.bundleSize.raw > 1024 * 1024) {
                report.recommendations.push({
                    category: 'performance',
                    priority: 'medium',
                    message: 'Consider optimizing bundle size to improve load times'
                });
            }
            
            // Add complexity recommendations
            if (this.metrics.complexity.cyclomaticComplexity.average > 10) {
                report.recommendations.push({
                    category: 'complexity',
                    priority: 'high',
                    message: 'High average cyclomatic complexity detected. Consider refactoring complex functions'
                });
            }
            
            if (this.metrics.complexity.maintainability.score < 70) {
                report.recommendations.push({
                    category: 'maintainability',
                    priority: 'high',
                    message: `Low maintainability score (${this.metrics.complexity.maintainability.score}). Review and address maintainability issues`
                });
            }
            
            return report;
        } catch (error) {
            logger.error(`Analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeStructure(projectPath) {
        logger.info('Analyzing project structure...');
        const structure = {
            hasPackageJson: false,
            hasReadme: false,
            hasTests: false,
            hasConfig: false,
            hasGitIgnore: false,
            directoryStructure: {}
        };

        try {
            const files = await fs.readdir(projectPath, { withFileTypes: true });
            for (const file of files) {
                if (file.isFile()) {
                    switch (file.name.toLowerCase()) {
                        case 'package.json':
                            structure.hasPackageJson = true;
                            break;
                        case 'readme.md':
                            structure.hasReadme = true;
                            break;
                        case '.gitignore':
                            structure.hasGitIgnore = true;
                            break;
                    }
                } else if (file.isDirectory()) {
                    if (file.name === 'test' || file.name === '__tests__') {
                        structure.hasTests = true;
                    }
                    if (file.name === 'config') {
                        structure.hasConfig = true;
                    }
                    structure.directoryStructure[file.name] = await this.getDirectoryTree(
                        path.join(projectPath, file.name)
                    );
                }
            }
            
            this.metrics.structure = structure;
        } catch (error) {
            logger.error(`Structure analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeDependencies(projectPath) {
        logger.info('Analyzing dependencies...');
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageLockPath = path.join(projectPath, 'package-lock.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
            let packageLock;
            
            try {
                packageLock = JSON.parse(await fs.readFile(packageLockPath, 'utf-8'));
            } catch (e) {
                logger.warn('No package-lock.json found, skipping detailed dependency analysis');
            }
            
            this.metrics.dependencies = {
                direct: Object.keys(packageJson.dependencies || {}).length,
                dev: Object.keys(packageJson.devDependencies || {}).length,
                peer: Object.keys(packageJson.peerDependencies || {}).length,
                outdated: [],
                deprecated: [],
                security: {
                    hasLockFile: !!packageLock,
                    vulnerabilities: []
                }
            };
            
            // Detailed dependency analysis
            this.metrics.dependencies.details = {
                production: await this.analyzeDependencyGroup(packageJson.dependencies, packageLock),
                development: await this.analyzeDependencyGroup(packageJson.devDependencies, packageLock),
                peer: await this.analyzeDependencyGroup(packageJson.peerDependencies, packageLock)
            };
            
            // Check for TypeScript dependencies
            const hasTypeScript = this.metrics.dependencies.details.production.typescript ||
                                this.metrics.dependencies.details.development.typescript;
            const hasTypesPackages = Object.keys(this.metrics.dependencies.details.development)
                .some(pkg => pkg.startsWith('@types/'));
            
            this.metrics.dependencies.typescript = {
                hasTypeScript,
                hasTypesPackages,
                recommended: !hasTypeScript && Object.keys(packageJson.dependencies || {}).length > 5
            };
            
        } catch (error) {
            logger.error(`Dependency analysis failed: ${error.message}`);
            throw error;
        }
    }
    
    async analyzeDependencyGroup(deps, lockfile) {
        if (!deps) return {};
        
        const analyzed = {};
        for (const [name, version] of Object.entries(deps)) {
            analyzed[name] = {
                version,
                versionType: this.getVersionType(version),
                locked: lockfile ? !!lockfile.dependencies?.[name] : false
            };
        }
        return analyzed;
    }
    
    getVersionType(version) {
        if (version.startsWith('~')) return 'patch';
        if (version.startsWith('^')) return 'minor';
        if (version.startsWith('>=')) return 'minimum';
        if (version === '*' || version === 'latest') return 'latest';
        return 'exact';
    }

    async analyzeSecurity(projectPath) {
        logger.info('Analyzing security...');
        try {
            const packageLockPath = path.join(projectPath, 'package-lock.json');
            const hasPackageLock = await fs.access(packageLockPath)
                .then(() => true)
                .catch(() => false);
            
            this.metrics.security = {
                hasPackageLock,
                vulnerabilities: [],
                securityFiles: {
                    hasNvmrc: await this.checkFileExists(projectPath, '.nvmrc'),
                    hasEnvExample: await this.checkFileExists(projectPath, '.env.example'),
                    hasDotenv: await this.checkFileExists(projectPath, '.env')
                }
            };
        } catch (error) {
            logger.error(`Security analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeCodeQuality(projectPath) {
        logger.info('Analyzing code quality...');
        try {
            this.metrics.quality = {
                linting: {
                    hasEslint: await this.checkFileExists(projectPath, '.eslintrc'),
                    hasPrettier: await this.checkFileExists(projectPath, '.prettierrc')
                },
                testing: {
                    hasJest: await this.checkFileExists(projectPath, 'jest.config.js'),
                    hasMocha: await this.checkFileExists(projectPath, 'mocha.opts')
                },
                typescript: await this.checkFileExists(projectPath, 'tsconfig.json')
            };
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            throw error;
        }
    }

    async checkBestPractices(projectPath) {
        logger.info('Checking best practices...');
        try {
            this.metrics.practices = {
                documentation: {
                    hasReadme: await this.checkFileExists(projectPath, 'README.md'),
                    hasChangelog: await this.checkFileExists(projectPath, 'CHANGELOG.md'),
                    hasContributing: await this.checkFileExists(projectPath, 'CONTRIBUTING.md')
                },
                cicd: {
                    hasGithubActions: await this.checkFileExists(path.join(projectPath, '.github', 'workflows')),
                    hasTravis: await this.checkFileExists(projectPath, '.travis.yml'),
                    hasJenkins: await this.checkFileExists(projectPath, 'Jenkinsfile')
                },
                docker: {
                    hasDockerfile: await this.checkFileExists(projectPath, 'Dockerfile'),
                    hasCompose: await this.checkFileExists(projectPath, 'docker-compose.yml')
                }
            };
        } catch (error) {
            logger.error(`Best practices check failed: ${error.message}`);
            throw error;
        }
    }

    async getDirectoryTree(dirPath, depth = 1) {
        if (depth > 3) return '...'; // Limit recursion depth
        
        const tree = {};
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            if (entry.name === 'node_modules') continue;
            
            if (entry.isDirectory()) {
                tree[entry.name] = await this.getDirectoryTree(
                    path.join(dirPath, entry.name),
                    depth + 1
                );
            } else {
                tree[entry.name] = null;
            }
        }
        
        return tree;
    }

    async checkFileExists(basePath, relativePath) {
        try {
            await fs.access(path.join(basePath, relativePath));
            return true;
        } catch {
            return false;
        }
    }

    generateReport() {
        return {
            timestamp: new Date().toISOString(),
            metrics: this.metrics,
            recommendations: this.generateRecommendations()
        };
    }

    generateRecommendations() {
        const recommendations = [];
        
        // Structure recommendations
        if (!this.metrics.structure.hasReadme) {
            recommendations.push({
                category: 'structure',
                priority: 'high',
                message: 'Add a README.md file to document your project'
            });
        }
        
        if (!this.metrics.structure.hasTests) {
            recommendations.push({
                category: 'structure',
                priority: 'high',
                message: 'Add tests to ensure code quality and prevent regressions'
            });
        }
        
        // Security recommendations
        if (!this.metrics.security.hasPackageLock) {
            recommendations.push({
                category: 'security',
                priority: 'high',
                message: 'Add package-lock.json to ensure dependency consistency'
            });
        }
        
        if (!this.metrics.security.securityFiles.hasEnvExample) {
            recommendations.push({
                category: 'security',
                priority: 'medium',
                message: 'Add .env.example to document required environment variables'
            });
        }
        
        // Quality recommendations
        if (!this.metrics.quality.linting.hasEslint) {
            recommendations.push({
                category: 'quality',
                priority: 'medium',
                message: 'Add ESLint for consistent code style'
            });
        }
        
        if (!this.metrics.quality.typescript) {
            recommendations.push({
                category: 'quality',
                priority: 'medium',
                message: 'Consider using TypeScript for better type safety'
            });
        }
        
        return recommendations;
    }
    async analyzePerformance(projectPath) {
        logger.info('Analyzing performance metrics...');
        try {
            const metrics = {
                bundleSize: await this.calculateBundleSize(projectPath),
                dependencies: {
                    count: Object.keys(this.metrics.dependencies.details?.production || {}).length,
                    heavyDeps: []
                },
                asyncPatterns: {
                    promises: 0,
                    asyncAwait: 0,
                    callbacks: 0
                }
            };

            // Analyze source files for async patterns
            const sourceFiles = await this.findSourceFiles(projectPath);
            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                metrics.asyncPatterns.promises += (content.match(/new Promise/g) || []).length;
                metrics.asyncPatterns.asyncAwait += (content.match(/async/g) || []).length;
                metrics.asyncPatterns.callbacks += (content.match(/callback|cb\)/g) || []).length;
            }

            this.metrics.performance = metrics;
        } catch (error) {
            logger.error(`Performance analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeComplexity(projectPath) {
        logger.info('Analyzing code complexity...');
        try {
            const metrics = {
                cyclomaticComplexity: {
                    average: 0,
                    files: {}
                },
                maintainability: {
                    score: 0,
                    issues: []
                }
            };

            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalComplexity = 0;
            let fileCount = 0;

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const complexity = this.calculateFileComplexity(content);
                const relativePath = path.relative(projectPath, file);
                
                metrics.cyclomaticComplexity.files[relativePath] = complexity;
                totalComplexity += complexity;
                fileCount++;

                // Check maintainability issues
                const issues = this.checkMaintainabilityIssues(content, relativePath);
                metrics.maintainability.issues.push(...issues);
            }

            metrics.cyclomaticComplexity.average = fileCount > 0 ? 
                totalComplexity / fileCount : 0;
            
            // Calculate maintainability score (0-100)
            metrics.maintainability.score = Math.max(0, Math.min(100,
                100 - (metrics.maintainability.issues.length * 5) -
                (metrics.cyclomaticComplexity.average * 2)
            ));

            this.metrics.complexity = metrics;
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            throw error;
        }
    }

    calculateFileComplexity(content) {
        // Calculate cyclomatic complexity
        const controlFlow = [
            /if\s*\(/g,
            /else\s+if\s*\(/g,
            /for\s*\(/g,
            /while\s*\(/g,
            /switch\s*\(/g,
            /\?\s*[^:]+\s*:/g, // Ternary operators
            /catch\s*\(/g,
            /&&|\|\|/g
        ];

        return controlFlow.reduce((complexity, pattern) => {
            const matches = content.match(pattern) || [];
            return complexity + matches.length;
        }, 1); // Base complexity of 1
    }

    checkMaintainabilityIssues(content, filePath) {
        const issues = [];
        const checks = [
            {
                pattern: /function\s*\([^)]{120,}\)/g,
                message: 'Function has too many parameters'
            },
            {
                pattern: /{[^}]{300,}}/g,
                message: 'Function body is too long'
            },
            {
                pattern: /\/\/\s*TODO|\/\/\s*FIXME/g,
                message: 'Contains TODO/FIXME comments'
            },
            {
                pattern: /console\.(log|debug|info)/g,
                message: 'Contains console logging statements'
            }
        ];

        checks.forEach(({ pattern, message }) => {
            if (pattern.test(content)) {
                issues.push({ file: filePath, message });
            }
        });

        return issues;
    }

    async calculateBundleSize(projectPath) {
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalSize = 0;

            for (const file of sourceFiles) {
                const stats = await fs.stat(file);
                totalSize += stats.size;
            }

            return {
                raw: totalSize,
                formatted: this.formatBytes(totalSize)
            };
        } catch (error) {
            logger.warn(`Bundle size calculation failed: ${error.message}`);
            return { raw: 0, formatted: '0 B' };
        }
    }

    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    async findSourceFiles(projectPath) {
        const sourceFiles = [];
        const walk = async (dir) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory() && 
                    !entry.name.startsWith('.') && 
                    entry.name !== 'node_modules') {
                    await walk(fullPath);
                } else if (entry.isFile() && 
                    /\.(js|jsx|ts|tsx)$/.test(entry.name) &&
                    !entry.name.includes('.test.') &&
                    !entry.name.includes('.spec.')) {
                    sourceFiles.push(fullPath);
                }
            }
        };

        await walk(projectPath);
        return sourceFiles;
    }
}

module.exports = new ProjectAnalyzer();