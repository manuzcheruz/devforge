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
    formatDependencies(deps) {
        if (!deps) return [];
        return Object.entries(deps).map(([name, version]) => ({
            name,
            version,
            type: this.getVersionType(version)
        }));
    }


    async analyzeProject(projectPath) {
        try {
            logger.info('Starting comprehensive project analysis...');
            
            // Initialize or reset metrics
            this.metrics = {
                timestamp: new Date().toISOString(),
                projectPath: projectPath
            };
            
            // Core analysis phase
            logger.info('Running core analysis...');
            await this.analyzeStructure(projectPath);
            await this.analyzeDependencies(projectPath);
            await this.analyzeSecurity(projectPath);
            
            // Advanced analysis phase
            logger.info('Running advanced analysis...');
            const performanceMetrics = await this.analyzePerformance(projectPath);
            const complexityMetrics = await this.analyzeComplexity(projectPath);
            await this.analyzeCodeQuality(projectPath);
            await this.checkBestPractices(projectPath);
            
            // Post-process and integrate metrics
            this.metrics.performance = performanceMetrics;
            this.metrics.complexity = complexityMetrics;
            
            // Calculate quality scores
            this.metrics.quality = this.metrics.quality || {};
            this.metrics.quality.maintainabilityIndex = 
                this.calculateMaintainabilityIndex(complexityMetrics);
            this.metrics.quality.issues = 
                this.collectQualityIssues();
                
            // Generate final analysis
            const analysis = {
                timestamp: this.metrics.timestamp,
                metrics: this.metrics,
                recommendations: this.generateRecommendations(),
                summary: this.generateSummary(),
                generateReport: () => this.generateReport()
            };

            logger.info('Project analysis completed successfully');
            return analysis;
        } catch (error) {
            logger.error(`Project analysis failed: ${error.message}`);
            logger.debug(`Stack trace: ${error.stack}`);
            throw new Error(`Analysis failed: ${error.message}`);
        }
    }
    
    calculateMaintainabilityIndex(complexityMetrics) {
        const baseScore = 100;
        const complexityImpact = (complexityMetrics?.cyclomaticComplexity?.average || 0) * 5;
        const issuesImpact = (this.metrics.quality?.issues?.length || 0) * 2;
        const structureImpact = this.calculateStructureImpact();
        
        return Math.max(0, Math.min(100, 
            baseScore - complexityImpact - issuesImpact - structureImpact
        ));
    }
    
    calculateStructureImpact() {
        let impact = 0;
        if (!this.metrics.structure?.hasTests) impact += 10;
        if (!this.metrics.structure?.hasReadme) impact += 5;
        if (!this.metrics.quality?.linting?.hasEslint) impact += 5;
        return impact;
    }
    
    collectQualityIssues() {
        const issues = [];
        
        // Collect issues from various analyses
        if (this.metrics.complexity?.maintainability?.issues) {
            issues.push(...this.metrics.complexity.maintainability.issues);
        }
        
        if (this.metrics.security?.vulnerabilities) {
            issues.push(...this.metrics.security.vulnerabilities);
        }
        
        return issues;
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
            
            this.metrics.structure = {
                ...structure,
                hasPackageJson: structure.hasPackageJson,
                hasReadme: structure.hasReadme,
                hasTests: structure.hasTests || false,
                directoryStructure: structure.directoryStructure || {},
                fileCount: Object.keys(structure.directoryStructure || {}).length
            };
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
                production: this.formatDependencies(packageJson.dependencies || {}),
                development: this.formatDependencies(packageJson.devDependencies || {}),
                peer: this.formatDependencies(packageJson.peerDependencies || {}),
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
            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalMaintainability = 0;
            const issues = [];

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const fileIssues = this.checkMaintainabilityIssues(content, path.relative(projectPath, file));
                issues.push(...fileIssues);
                
                // Calculate maintainability index based on various metrics
                const complexity = this.calculateFileComplexity(content);
                const linesOfCode = content.split('\n').length;
                const commentRatio = (content.match(/\/\//g) || []).length / linesOfCode;
                
                // Maintainability formula: 171 - 5.2 * ln(avgComplexity) - 0.23 * ln(linesOfCode) - 16.2 * ln(commentRatio)
                const maintainability = Math.max(0, Math.min(100,
                    171 - 5.2 * Math.log(complexity) - 
                    0.23 * Math.log(linesOfCode) - 
                    16.2 * Math.log(commentRatio + 1)
                ));
                totalMaintainability += maintainability;
            }

            this.metrics.quality = {
                linting: {
                    hasEslint: await this.checkFileExists(projectPath, '.eslintrc'),
                    hasPrettier: await this.checkFileExists(projectPath, '.prettierrc')
                },
                testing: {
                    hasJest: await this.checkFileExists(projectPath, 'jest.config.js'),
                    hasMocha: await this.checkFileExists(projectPath, 'mocha.opts')
                },
                typescript: await this.checkFileExists(projectPath, 'tsconfig.json'),
                maintainabilityIndex: sourceFiles.length ? totalMaintainability / sourceFiles.length : 100,
                issues
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
        if (!this.metrics) {
            throw new Error('No metrics available. Run analysis first.');
        }
        return {
            timestamp: new Date().toISOString(),
            metrics: this.metrics,
            recommendations: this.generateRecommendations(),
            summary: this.generateSummary()
        };
    }

    generateSummary() {
        if (!this.metrics) return {};
        
        return {
            totalFiles: this.metrics.structure?.fileCount || 0,
            complexityScore: this.metrics.complexity?.maintainability?.score || 0,
            securityIssues: this.metrics.security?.vulnerabilities?.length || 0,
            performanceScore: this.calculatePerformanceScore(),
            qualityScore: this.metrics.quality?.maintainabilityIndex || 0
        };
    }

    async analyzeProject(projectPath) {
        try {
            logger.info('Starting project analysis...');
            
            // Initialize metrics
            this.metrics = {};
            
            // Core analysis
            await this.analyzeStructure(projectPath);
            await this.analyzeDependencies(projectPath);
            await this.analyzeSecurity(projectPath);
            await this.analyzeCodeQuality(projectPath);
            await this.checkBestPractices(projectPath);
            
            // Advanced analysis
            const performanceMetrics = await this.analyzePerformance(projectPath);
            const complexityMetrics = await this.analyzeComplexity(projectPath);
            
            // Post-process metrics
            this.metrics.performance = performanceMetrics;
            this.metrics.complexity = complexityMetrics;
            this.metrics.quality = this.metrics.quality || {};
            this.metrics.quality.maintainabilityIndex = 
                100 - (complexityMetrics?.cyclomaticComplexity?.average || 0) * 5;
            this.metrics.quality.issues = 
                complexityMetrics?.maintainability?.issues || [];
            
            // Return analysis with bound report generation
            const analysis = {
                metrics: this.metrics,
                recommendations: this.generateRecommendations(),
                generateReport: () => this.generateReport()
            };

            logger.info('Project analysis completed successfully');
            return analysis;
        } catch (error) {
            logger.error(`Analysis failed: ${error.message}`);
            throw error;
        }
    }

    calculatePerformanceScore() {
        if (!this.metrics.performance) return 0;
        
        const bundleScore = this.metrics.performance.bundleSize?.raw < 1024 * 1024 ? 30 : 
                           this.metrics.performance.bundleSize?.raw < 5 * 1024 * 1024 ? 20 : 10;
        
        const asyncScore = this.metrics.performance.asyncPatterns?.asyncAwait > 0 ? 20 : 10;
        const depsScore = this.metrics.performance.dependencies?.count < 20 ? 30 : 
                         this.metrics.performance.dependencies?.count < 50 ? 20 : 10;
        
        return Math.min(100, bundleScore + asyncScore + depsScore);
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
            if (!this.metrics) this.metrics = {};
            
            const metrics = {
                bundleSize: (await this.calculateBundleSize(projectPath)),
                dependencies: {
                    count: Object.keys(this.metrics.dependencies?.details?.production || {}).length,
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
            return metrics;
        } catch (error) {
            logger.error(`Performance analysis failed: ${error.message}`);
            throw error;
        }
    }

    async calculateBundleSize(projectPath) {
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalSize = 0;

            for (const file of sourceFiles) {
                const stats = await fs.stat(file);
                totalSize += stats.size;
            }

            return totalSize; // Return raw size in bytes
        } catch (error) {
            logger.warn(`Bundle size calculation failed: ${error.message}`);
            return 0;
        }
    }

    async analyzeComplexity(projectPath) {
        logger.info('Analyzing code complexity...');
        try {
            if (!this.metrics) this.metrics = {};
            
            const metrics = {
                cyclomaticComplexity: {
                    average: 0,
                    highest: 0,
                    files: {},
                    distribution: {
                        low: 0,    // 1-10
                        medium: 0, // 11-20
                        high: 0    // >20
                    }
                },
                maintainability: {
                    score: 0,
                    issues: [],
                    details: {}
                },
                cognitive: {
                    average: 0,
                    highest: 0,
                    hotspots: []
                }
            };

            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalComplexity = 0;
            let totalCognitive = 0;
            let fileCount = 0;

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const complexity = this.calculateFileComplexity(content);
                const relativePath = path.relative(projectPath, file);
                
                // Update complexity metrics
                metrics.cyclomaticComplexity.files[relativePath] = complexity;
                metrics.cognitive.hotspots.push({
                    file: relativePath,
                    complexity: complexity.total,
                    details: complexity.details
                });

                // Update distribution
                if (complexity.total <= 10) metrics.cyclomaticComplexity.distribution.low++;
                else if (complexity.total <= 20) metrics.cyclomaticComplexity.distribution.medium++;
                else metrics.cyclomaticComplexity.distribution.high++;

                totalComplexity += complexity.total;
                totalCognitive += complexity.details.nestingLevel || 0;
                fileCount++;

                // Check maintainability issues
                const issues = this.checkMaintainabilityIssues(content, relativePath);
                metrics.maintainability.issues.push(...issues);
                
                // Track maintainability details
                metrics.maintainability.details[relativePath] = {
                    linesOfCode: content.split('\n').length,
                    commentRatio: (content.match(/\/\//g) || []).length / content.split('\n').length,
                    complexity: complexity.total
                };
            }

            // Calculate averages and highest values
            metrics.cyclomaticComplexity.average = fileCount > 0 ? 
                Math.round(totalComplexity / fileCount * 100) / 100 : 0;
            metrics.cognitive.average = fileCount > 0 ?
                Math.round(totalCognitive / fileCount * 100) / 100 : 0;

            // Sort and limit hotspots
            metrics.cognitive.hotspots.sort((a, b) => b.complexity - a.complexity);
            metrics.cognitive.hotspots = metrics.cognitive.hotspots.slice(0, 5);
            
            // Calculate maintainability score (0-100)
            const issueImpact = metrics.maintainability.issues.length * 5;
            const complexityImpact = metrics.cyclomaticComplexity.average * 2;
            const cognitiveImpact = metrics.cognitive.average * 1.5;
            
            metrics.maintainability.score = Math.max(0, Math.min(100,
                100 - issueImpact - complexityImpact - cognitiveImpact
            ));

            this.metrics.complexity = metrics;
            return metrics;
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            throw error;
        }
    }

    calculateFileComplexity(content) {
        if (!content || typeof content !== 'string') {
            return {
                total: 0,
                details: {
                    conditionals: 0,
                    loops: 0,
                    switches: 0,
                    ternaries: 0,
                    catches: 0,
                    logicalOperations: 0,
                    functions: 0,
                    classes: 0
                }
            };
        }

        const patterns = {
            conditionals: {
                pattern: /if\s*\([^)]*\)|else\s+if\s*\([^)]*\)/g,
                weight: 1,
                description: 'Conditional statements'
            },
            loops: {
                pattern: /for\s*\([^)]*\)|while\s*\([^)]*\)|do\s*{[^}]*}/g,
                weight: 2,
                description: 'Loop structures'
            },
            switches: {
                pattern: /switch\s*\([^)]*\)|case\s+[^:]+:/g,
                weight: 1,
                description: 'Switch statements'
            },
            ternaries: {
                pattern: /[^?]*\?\s*[^:]+\s*:[^;]+/g,
                weight: 1,
                description: 'Ternary operations'
            },
            catches: {
                pattern: /catch\s*\([^)]*\)/g,
                weight: 1.5,
                description: 'Error handling'
            },
            logicalOperations: {
                pattern: /(?:&&|\|\|)(?![^(]*\))/g,
                weight: 0.5,
                description: 'Logical operations'
            },
            functions: {
                pattern: /function\s+\w+\s*\([^)]*\)|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
                weight: 1.5,
                description: 'Function declarations'
            },
            classes: {
                pattern: /class\s+\w+(?:\s+extends\s+\w+)?/g,
                weight: 2,
                description: 'Class declarations'
            },
            asyncPatterns: {
                pattern: /async|await|\.then\(|\.catch\(|new Promise/g,
                weight: 1.5,
                description: 'Asynchronous patterns'
            }
        };

        // Calculate complexity metrics
        const details = {};
        let total = 1; // Base complexity

        for (const [key, { pattern, weight }] of Object.entries(patterns)) {
            const matches = content.match(pattern) || [];
            details[key] = matches.length;
            total += matches.length * weight;
        }

        // Add nesting complexity
        const nestingLevel = this.calculateNestingLevel(content);
        details.nestingLevel = nestingLevel;
        total += nestingLevel * 0.5;

        return {
            total: Math.round(total * 10) / 10,
            details,
            risk: this.assessComplexityRisk(total)
        };
    }

    calculateNestingLevel(content) {
        const lines = content.split('\n');
        let maxNesting = 0;
        let currentNesting = 0;

        for (const line of lines) {
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            
            currentNesting += openBraces - closeBraces;
            maxNesting = Math.max(maxNesting, currentNesting);
        }

        return maxNesting;
    }

    assessComplexityRisk(complexity) {
        if (complexity <= 5) return 'low';
        if (complexity <= 10) return 'medium';
        return 'high';
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