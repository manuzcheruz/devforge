const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

class ProjectAnalyzer {
    constructor() {
        this.initializeMetrics();
    }

    initializeMetrics() {
        this.metrics = {
            structure: {
                hasPackageJson: false,
                hasReadme: false,
                hasTests: false,
                hasConfig: false,
                hasGitIgnore: false,
                directoryStructure: {},
                sourceFiles: []
            },
            dependencies: {
                direct: 0,
                dev: 0,
                peer: 0,
                outdated: [],
                deprecated: [],
                security: {
                    hasLockFile: false,
                    vulnerabilities: []
                },
                details: {
                    production: {},
                    development: {},
                    peer: {}
                }
            },
            security: {
                hasPackageLock: false,
                vulnerabilities: [],
                securityFiles: {
                    hasNvmrc: false,
                    hasEnvExample: false,
                    hasDotenv: false
                }
            },
            quality: {
                linting: {
                    hasEslint: false,
                    hasPrettier: false,
                    eslintConfig: null,
                    prettierConfig: null
                },
                testing: {
                    hasJest: false,
                    hasMocha: false,
                    testCount: 0,
                    coverage: null
                },
                typescript: false,
                maintainabilityIndex: 0,
                issues: []
            },
            practices: {
                documentation: {
                    hasReadme: false,
                    hasChangelog: false,
                    hasContributing: false
                },
                cicd: {
                    hasGithubActions: false,
                    hasTravis: false,
                    hasJenkins: false
                },
                docker: {
                    hasDockerfile: false,
                    hasCompose: false
                }
            },
            performance: {
                bundleSize: {
                    raw: 0,
                    formatted: '0 B'
                },
                asyncPatterns: {
                    promises: 0,
                    asyncAwait: 0,
                    callbacks: 0
                }
            },
            complexity: {
                cyclomaticComplexity: {
                    average: 0,
                    highest: 0,
                    files: {}
                },
                maintainability: {
                    score: 0,
                    issues: []
                }
            },
            customRules: {}
        };
    }

    async analyzeProject(projectPath) {
        try {
            logger.info('Starting project analysis...');
            
            // Validate project path
            await this.validateProjectPath(projectPath);

            // Initialize metrics with default values
            this.metrics = {
                structure: {
                    hasPackageJson: false,
                    hasReadme: false,
                    hasTests: false,
                    hasConfig: false,
                    hasGitIgnore: false,
                    directoryStructure: {},
                    sourceFiles: []
                },
                dependencies: {
                    direct: 0,
                    dev: 0,
                    peer: 0,
                    production: [],
                    development: [],
                    outdated: [],
                    deprecated: []
                },
                security: {
                    hasPackageLock: false,
                    vulnerabilities: [],
                    securityFiles: {
                        hasNvmrc: false,
                        hasEnvExample: false,
                        hasDotenv: false
                    }
                },
                quality: {
                    linting: {
                        hasEslint: false,
                        hasPrettier: false
                    },
                    testing: {
                        hasJest: false,
                        hasMocha: false,
                        testCount: 0
                    },
                    typescript: false,
                    maintainabilityIndex: 0,
                    issues: []
                },
                complexity: {
                    average: 0,
                    highest: 0,
                    files: []
                }
            };

            // Run all analyses in parallel for better performance
            await Promise.all([
                this.analyzeStructure(projectPath),
                this.analyzeDependencies(projectPath),
                this.analyzeSecurity(projectPath),
                this.analyzeCodeQuality(projectPath),
                this.checkBestPractices(projectPath),
                this.analyzePerformance(projectPath),
                this.analyzeComplexity(projectPath)
            ]);

            // Generate report with recommendations
            const report = this.generateReport();
            report.recommendations = [
                ...this.getPerformanceRecommendations(),
                ...this.getComplexityRecommendations(),
                ...this.getQualityRecommendations()
            ];

            return report;
        } catch (error) {
            logger.error(`Analysis failed: ${error.message}`);
            throw error;
        }
    }

    async validateProjectPath(projectPath) {
        try {
            const stats = await fs.stat(projectPath);
            if (!stats.isDirectory()) {
                throw new Error(`Path exists but is not a directory: ${projectPath}`);
            }
            return true;
        } catch (error) {
            throw new Error(`Project path does not exist: ${projectPath}`);
        }
    }

    getPerformanceRecommendations() {
        const recommendations = [];
        if (this.metrics.performance?.bundleSize?.raw > 1024 * 1024) {
            recommendations.push({
                category: 'performance',
                priority: 'medium',
                message: 'Consider optimizing bundle size to improve load times'
            });
        }
        return recommendations;
    }

    getComplexityRecommendations() {
        const recommendations = [];
        if (this.metrics.complexity?.cyclomaticComplexity?.average > 10) {
            recommendations.push({
                category: 'complexity',
                priority: 'high',
                message: 'High average cyclomatic complexity detected. Consider refactoring complex functions'
            });
        }
        if (this.metrics.complexity?.maintainability?.score < 70) {
            recommendations.push({
                category: 'maintainability',
                priority: 'high',
                message: `Low maintainability score (${this.metrics.complexity.maintainability.score}). Review and address maintainability issues`
            });
        }
        return recommendations;
    }

    getQualityRecommendations() {
        const recommendations = [];
        if (!this.metrics.quality?.linting?.hasEslint) {
            recommendations.push({
                category: 'quality',
                priority: 'medium',
                message: 'Add ESLint for consistent code style'
            });
        }
        return recommendations;
    }

    async analyzeStructure(projectPath) {
        logger.info('Analyzing project structure...');
        try {
            // Create a new structure metrics object that inherits from the existing one
            const structureMetrics = {
                ...this.metrics.structure,
                hasPackageJson: false,
                hasReadme: false,
                hasTests: false,
                hasConfig: false,
                hasGitIgnore: false,
                directoryStructure: {},
                sourceFiles: []
            };

            const files = await fs.readdir(projectPath, { withFileTypes: true });
            const sourceFiles = [];

            for (const file of files) {
                const filePath = path.join(projectPath, file.name);
                if (file.isFile()) {
                    const lowerName = file.name.toLowerCase();
                    switch (lowerName) {
                        case 'package.json':
                            structureMetrics.hasPackageJson = true;
                            break;
                        case 'readme.md':
                            structureMetrics.hasReadme = true;
                            break;
                        case '.gitignore':
                            structureMetrics.hasGitIgnore = true;
                            break;
                    }

                    // Collect source files
                    if (/\.(js|jsx|ts|tsx)$/.test(lowerName)) {
                        sourceFiles.push(filePath);
                    }
                } else if (file.isDirectory()) {
                    const dirName = file.name.toLowerCase();
                    if (dirName === 'test' || dirName === '__tests__' || dirName === 'tests') {
                        structureMetrics.hasTests = true;
                    }
                    if (dirName === 'config') {
                        structureMetrics.hasConfig = true;
                    }

                    if (!dirName.startsWith('.') && dirName !== 'node_modules') {
                        structureMetrics.directoryStructure[file.name] = await this.getDirectoryTree(filePath);
                        
                        // Recursively find source files
                        const dirSourceFiles = await this.findSourceFiles(filePath);
                        sourceFiles.push(...dirSourceFiles);
                    }
                }
            }

            structureMetrics.sourceFiles = sourceFiles;
            
            // Update the metrics object with our analyzed structure
            this.metrics.structure = structureMetrics;
            
            return structureMetrics;
        } catch (error) {
            logger.error(`Structure analysis failed: ${error.message}`);
            // Return the current metrics instead of undefined
            return this.metrics.structure;
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
            const versionType = this.getVersionType(version);
            const isLocked = lockfile ? !!lockfile.dependencies?.[name] : false;
            
            analyzed[name] = {
                version,
                versionType,
                locked: isLocked,
                hasTypes: name.startsWith('@types/'),
                isDevTool: this.isDevTool(name),
                recommendedVersion: await this.getRecommendedVersion(name, version)
            };

            // Add warning for non-locked versions
            if (!isLocked && versionType !== 'exact') {
                this.metrics.dependencies.outdated.push({
                    name,
                    currentVersion: version,
                    recommendation: 'Lock dependency version for better stability'
                });
            }
        }
        return analyzed;
    }

    isDevTool(packageName) {
        const devTools = [
            'eslint', 'prettier', 'jest', 'mocha', 'typescript',
            'webpack', 'babel', 'nodemon', 'ts-node', 'husky'
        ];
        return devTools.some(tool => 
            packageName.includes(tool) || packageName.startsWith(`@${tool}/`)
        );
    }

    async getRecommendedVersion(name, currentVersion) {
        // This is a placeholder - in a real implementation, you would:
        // 1. Check npm registry for latest stable version
        // 2. Compare with current version
        // 3. Consider compatibility and breaking changes
        return currentVersion;
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
            // Initialize security metrics with default values
            const securityMetrics = {
                hasPackageLock: false,
                vulnerabilities: [],
                securityFiles: {
                    hasNvmrc: false,
                    hasEnvExample: false,
                    hasDotenv: false
                }
            };

            // Check package lock
            securityMetrics.hasPackageLock = await this.checkFileExists(
                projectPath,
                'package-lock.json'
            );

            // Check security-related files
            const securityFiles = [
                { key: 'hasNvmrc', file: '.nvmrc' },
                { key: 'hasEnvExample', file: '.env.example' },
                { key: 'hasDotenv', file: '.env' }
            ];

            await Promise.all(
                securityFiles.map(async ({ key, file }) => {
                    securityMetrics.securityFiles[key] = await this.checkFileExists(
                        projectPath,
                        file
                    );
                })
            );

            this.metrics.security = securityMetrics;
            return securityMetrics;
        } catch (error) {
            logger.error(`Security analysis failed: ${error.message}`);
            // Instead of throwing, return a default security metrics object
            return {
                hasPackageLock: false,
                vulnerabilities: [],
                securityFiles: {
                    hasNvmrc: false,
                    hasEnvExample: false,
                    hasDotenv: false
                }
            };
        }
    }

    async analyzeCodeQuality(projectPath) {
        logger.info('Analyzing code quality...');
        try {
            // Initialize quality metrics with default values
            const qualityMetrics = {
                linting: {
                    hasEslint: false,
                    hasPrettier: false,
                    eslintConfig: null,
                    prettierConfig: null
                },
                testing: {
                    hasJest: false,
                    hasMocha: false,
                    testCount: 0,
                    coverage: null
                },
                typescript: false,
                maintainabilityIndex: 0,
                issues: []
            };

            // Check for linting configuration files
            qualityMetrics.linting.hasEslint = await this.checkFileExists(projectPath, '.eslintrc') ||
                await this.checkFileExists(projectPath, '.eslintrc.js') ||
                await this.checkFileExists(projectPath, '.eslintrc.json');
            
            qualityMetrics.linting.hasPrettier = await this.checkFileExists(projectPath, '.prettierrc') ||
                await this.checkFileExists(projectPath, '.prettierrc.js') ||
                await this.checkFileExists(projectPath, '.prettierrc.json');

            // Check for testing frameworks
            qualityMetrics.testing.hasJest = await this.checkFileExists(projectPath, 'jest.config.js');
            qualityMetrics.testing.hasMocha = await this.checkFileExists(projectPath, 'mocha.opts');

            // Check for TypeScript configuration
            qualityMetrics.typescript = await this.checkFileExists(projectPath, 'tsconfig.json');

            // Calculate maintainability index based on existing metrics
            qualityMetrics.maintainabilityIndex = this.calculateMaintainabilityIndex(
                this.metrics.complexity?.cyclomaticComplexity?.average || 0,
                this.metrics.performance?.bundleSize?.raw || 0,
                qualityMetrics.linting.hasEslint,
                qualityMetrics.testing.hasJest || qualityMetrics.testing.hasMocha
            );

            // Update the metrics object
            this.metrics.quality = qualityMetrics;
            
            return qualityMetrics;
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            // Return default metrics instead of throwing
            return {
                linting: { hasEslint: false, hasPrettier: false },
                testing: { hasJest: false, hasMocha: false },
                typescript: false,
                maintainabilityIndex: 0,
                issues: []
            };
        }
    }

    calculateMaintainabilityIndex(complexity, size, hasLinting, hasTesting) {
        // Base score starts at 70 (minimum acceptable score)
        let score = 70;

        // Adjust for complexity (max -20 points)
        const complexityPenalty = Math.min(20, Math.max(0, (complexity - 5) * 2));
        score -= complexityPenalty;

        // Adjust for size (max -10 points)
        const sizeMB = size / (1024 * 1024);
        const sizePenalty = Math.min(10, Math.max(0, sizeMB * 2));
        score -= sizePenalty;

        // Add points for good practices (up to 30 points)
        if (hasLinting) score += 15;
        if (hasTesting) score += 15;

        // Extra points for additional good practices
        const practices = this.metrics.practices || {};
        if (practices.documentation?.hasReadme) score += 5;
        if (practices.cicd?.hasGithubActions) score += 5;
        if (this.metrics.security?.hasPackageLock) score += 5;
        if (this.metrics.quality?.typescript) score += 5;

        // Ensure score stays within 0-100 range
        return Math.max(0, Math.min(100, Math.round(score)));
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
        // Ensure all metric objects exist with default values and are properly initialized
        const defaultMetrics = {
            structure: {
                hasPackageJson: false,
                hasReadme: false,
                hasTests: false,
                hasConfig: false,
                hasGitIgnore: false,
                directoryStructure: {},
                sourceFiles: []
            },
            dependencies: {
                direct: 0,
                dev: 0,
                peer: 0,
                outdated: [],
                deprecated: []
            },
            security: {
                hasPackageLock: false,
                vulnerabilities: [],
                securityFiles: {
                    hasNvmrc: false,
                    hasEnvExample: false,
                    hasDotenv: false
                }
            },
            quality: {
                linting: {
                    hasEslint: false,
                    hasPrettier: false
                },
                testing: {
                    hasJest: false,
                    hasMocha: false,
                    testCount: 0
                },
                typescript: false,
                maintainabilityIndex: 0,
                issues: []
            },
            practices: {
                documentation: {
                    hasReadme: false,
                    hasChangelog: false,
                    hasContributing: false
                },
                cicd: {
                    hasGithubActions: false,
                    hasTravis: false,
                    hasJenkins: false
                },
                docker: {
                    hasDockerfile: false,
                    hasCompose: false
                }
            },
            performance: {
                bundleSize: {
                    raw: 0,
                    formatted: '0 B'
                },
                asyncPatterns: {
                    promises: 0,
                    asyncAwait: 0,
                    callbacks: 0
                }
            },
            complexity: {
                cyclomaticComplexity: {
                    average: 0,
                    highest: 0,
                    files: {}
                },
                maintainability: {
                    score: 0,
                    issues: []
                }
            },
            customRules: {}
        };

        // Merge existing metrics with defaults
        this.metrics = {
            structure: { ...defaultMetrics.structure, ...this.metrics.structure },
            dependencies: { ...defaultMetrics.dependencies, ...this.metrics.dependencies },
            security: { ...defaultMetrics.security, ...this.metrics.security },
            quality: { ...defaultMetrics.quality, ...this.metrics.quality },
            practices: { ...defaultMetrics.practices, ...this.metrics.practices },
            performance: { ...defaultMetrics.performance, ...this.metrics.performance },
            complexity: { ...defaultMetrics.complexity, ...this.metrics.complexity },
            customRules: { ...defaultMetrics.customRules, ...this.metrics.customRules }
        };

        return {
            timestamp: new Date().toISOString(),
            metrics: this.metrics,
            recommendations: this.generateRecommendations()
        };
    }

    generateRecommendations() {
        const recommendations = [];
        const { structure, security, quality, complexity } = this.metrics;
        
        // Structure recommendations
        if (structure && !structure.hasReadme) {
            recommendations.push({
                category: 'structure',
                priority: 'high',
                message: 'Add a README.md file to document your project'
            });
        }
        
        if (structure && !structure.hasTests) {
            recommendations.push({
                category: 'structure',
                priority: 'high',
                message: 'Add tests to ensure code quality and prevent regressions'
            });
        }
        
        // Security recommendations
        if (security) {
            if (!security.hasPackageLock) {
                recommendations.push({
                    category: 'security',
                    priority: 'high',
                    message: 'Add package-lock.json to ensure dependency consistency'
                });
            }
            
            if (security.securityFiles && !security.securityFiles.hasEnvExample) {
                recommendations.push({
                    category: 'security',
                    priority: 'medium',
                    message: 'Add .env.example to document required environment variables'
                });
            }
        }
        
        // Quality recommendations
        if (quality) {
            if (quality.linting && !quality.linting.hasEslint) {
                recommendations.push({
                    category: 'quality',
                    priority: 'medium',
                    message: 'Add ESLint for consistent code style'
                });
            }
            
            if (!quality.typescript) {
                recommendations.push({
                    category: 'quality',
                    priority: 'medium',
                    message: 'Consider using TypeScript for better type safety'
                });
            }
        }

        // Complexity recommendations
        if (complexity) {
            if (complexity.cyclomaticComplexity && complexity.cyclomaticComplexity.average > 10) {
                recommendations.push({
                    category: 'complexity',
                    priority: 'high',
                    message: 'High average cyclomatic complexity detected. Consider refactoring complex functions'
                });
            }
            
            if (complexity.maintainability && complexity.maintainability.score < 70) {
                recommendations.push({
                    category: 'complexity',
                    priority: 'high',
                    message: `Low maintainability score (${complexity.maintainability.score}). Review and address maintainability issues`
                });
            }
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
            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalComplexity = 0;
            let highestComplexity = 0;
            const complexityData = [];

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                // Calculate cyclomatic complexity based on code patterns
                const complexity = this.calculateComplexity(content);
                const relativePath = path.relative(projectPath, file);
                
                complexityData.push({ path: relativePath, complexity });
                totalComplexity += complexity;
                highestComplexity = Math.max(highestComplexity, complexity);

                // Check maintainability issues
                if (complexity > 10) {
                    this.metrics.quality.issues.push({
                        type: 'complexity',
                        message: `High complexity (${complexity.toFixed(1)}) in ${relativePath}`,
                        file: relativePath
                    });
                }
            }

            this.metrics.complexity = {
                cyclomaticComplexity: {
                    average: sourceFiles.length > 0 ? totalComplexity / sourceFiles.length : 0,
                    highest: highestComplexity,
                    files: complexityData
                },
                maintainability: {
                    score: this.calculateMaintainabilityScore(),
                    issues: this.metrics.quality.issues.filter(issue => issue.type === 'complexity')
                }
            };

            // Update maintainability index based on complexity
            // Calculate maintainability index based on multiple factors
            const baseScore = 70; // Start with a base score
            const issuesPenalty = Math.min(30, this.metrics.quality.issues.length * 2);
            const complexityPenalty = Math.min(20, this.metrics.complexity.average);
            
            // Add points for good practices
            let bonusPoints = 0;
            if (this.metrics.quality.linting.hasEslint) bonusPoints += 10;
            if (this.metrics.quality.testing.hasJest || this.metrics.quality.testing.hasMocha) bonusPoints += 10;
            if (this.metrics.structure.hasReadme) bonusPoints += 5;
            if (this.metrics.security.hasPackageLock) bonusPoints += 5;
            
            const maintenanceScore = Math.max(0, Math.min(100,
                baseScore - issuesPenalty - complexityPenalty + bonusPoints
            ));

            this.metrics.quality.maintainabilityIndex = maintenanceScore;
            return this.metrics.complexity;
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            return { average: 0, highest: 0, files: [] };
        }
    }

    calculateComplexity(content) {
        let complexity = 0;
        
        // Count control structures that increase cyclomatic complexity
        const patterns = [
            /if\s*\(/g,           // if statements
            /else\s+if\s*\(/g,    // else if statements
            /for\s*\(/g,          // for loops
            /while\s*\(/g,        // while loops
            /do\s*{/g,            // do-while loops
            /\?\s*\w+\s*:/g,      // ternary operators
            /case\s+[\w'"]/g,     // case statements
            /catch\s*\(/g,        // catch blocks
            /&&|\|\|/g,           // logical operators
            /function\s*\w*\s*\(/g, // function declarations
            /=>\s*{/g             // arrow functions with blocks
        ];

        patterns.forEach(pattern => {
            const matches = content.match(pattern);
            complexity += matches ? matches.length : 0;
        });

        // Add base complexity of 1 for the function/file itself
        return complexity + 1;
    }

    calculateFileComplexity(filePath, content) {
        try {
            const complexity = this.calculateComplexity(content);
            return {
                path: filePath,
                complexity,
                details: {
                    size: content.length,
                    lines: content.split('\n').length
                }
            };
        } catch (error) {
            logger.error(`Failed to calculate complexity for ${filePath}: ${error.message}`);
            return {
                path: filePath,
                complexity: 1,
                details: {
                    size: content.length,
                    lines: content.split('\n').length,
                    error: error.message
                }
            };
        }
    }
            if (this.metrics.quality.linting.hasEslint) bonusPoints += 10;
            if (this.metrics.quality.testing.hasJest || this.metrics.quality.testing.hasMocha) bonusPoints += 10;
            if (this.metrics.structure.hasReadme) bonusPoints += 5;
            if (this.metrics.security.hasPackageLock) bonusPoints += 5;
            
            this.metrics.quality.maintainabilityIndex = Math.max(0, Math.min(100,
                baseScore - issuesPenalty - complexityPenalty + bonusPoints
            ));

            return this.metrics.complexity;
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            return { average: 0, highest: 0, files: [] };
        }
    }

    calculateFileComplexity(content) {
        const complexityFactors = {
            // Control flow statements
            controlFlow: {
                patterns: [
                    /if\s*\(/g,
                    /else\s+if\s*\(/g,
                    /for\s*\(/g,
                    /while\s*\(/g,
                    /do\s*{/g,
                    /switch\s*\(/g,
                    /case\s+[^:]+:/g,
                    /catch\s*\(/g
                ],
                weight: 1
            },
            // Logical operators
            logicalOperators: {
                patterns: [/&&|\|\|/g],
                weight: 0.5
            },
            // Ternary operators
            ternary: {
                patterns: [/\?[^:]+:/g],
                weight: 0.5
            },
            // Function declarations
            functions: {
                patterns: [
                    /function\s+\w+\s*\([^)]*\)\s*{/g,
                    /\w+\s*:\s*function\s*\([^)]*\)\s*{/g,
                    /=>\s*{/g
                ],
                weight: 0.5
            }
        };

        // Calculate weighted complexity
        let totalComplexity = 1; // Base complexity
        
        for (const factor of Object.values(complexityFactors)) {
            const matchCount = factor.patterns.reduce((count, pattern) => {
                const matches = content.match(pattern) || [];
                return count + matches.length;
            }, 0);
            totalComplexity += matchCount * factor.weight;
        }

        // Add complexity for nested structures
        const nestingLevel = this.calculateNestingLevel(content);
        totalComplexity += nestingLevel * 0.1;

        return Math.round(totalComplexity * 10) / 10; // Round to 1 decimal place
    }

    calculateNestingLevel(content) {
        let maxNesting = 0;
        let currentNesting = 0;
        
        for (const char of content) {
            if (char === '{') {
                currentNesting++;
                maxNesting = Math.max(maxNesting, currentNesting);
            } else if (char === '}') {
                currentNesting = Math.max(0, currentNesting - 1);
            }
        }
        
        return maxNesting;
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

module.exports = ProjectAnalyzer;