const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../utils/logger');
const ComplexityAnalyzer = require('./metrics/complexity');
const PerformanceAnalyzer = require('./metrics/performance');
const QualityAnalyzer = require('./metrics/quality');

class ProjectAnalyzer {
    constructor() {
        this.complexityAnalyzer = new ComplexityAnalyzer();
        this.performanceAnalyzer = new PerformanceAnalyzer();
        this.qualityAnalyzer = new QualityAnalyzer();
        
        this.metrics = {
            structure: {},
            dependencies: {},
            quality: {
                issues: [],
                linting: {}
            },
            security: {},
            complexity: {
                cyclomaticComplexity: {
                    average: 0,
                    highest: 0,
                    files: []
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
            }
        };
    }

    async analyzeProject(projectPath) {
        logger.info('Starting project analysis...');
        
        try {
            // Validate project path
            if (!projectPath || typeof projectPath !== 'string') {
                throw new Error('Valid project path is required');
            }

            const normalizedPath = path.resolve(projectPath);
            try {
                const stats = await fs.stat(normalizedPath);
                if (!stats.isDirectory()) {
                    throw new Error('Project path must be a directory');
                }
            } catch (error) {
                logger.error(`Project path is not accessible: ${error.message}`);
                throw new Error(`Project path is not accessible: ${error.message}`);
            }

            // Initialize metrics with default values
            this.metrics = {
                structure: {
                    hasPackageJson: false,
                    hasReadme: false,
                    hasTests: false,
                    hasConfig: false,
                    hasGitIgnore: false,
                    sourceFiles: []
                },
                dependencies: {
                    direct: 0,
                    dev: 0,
                    peer: 0,
                    typescript: {
                        hasTypeScript: false,
                        hasTypesPackages: false
                    },
                    production: {},
                    development: {}
                },
                quality: {
                    issues: [],
                    linting: {
                        hasEslint: false,
                        hasPrettier: false
                    },
                    maintainabilityIndex: 70,
                    typescript: false,
                    testing: {
                        hasJest: false,
                        hasMocha: false
                    }
                },
                security: {
                    hasPackageLock: false,
                    securityFiles: {
                        hasEnvExample: false
                    },
                    issues: []
                },
                complexity: {
                    cyclomaticComplexity: {
                        average: 0,
                        highest: 0,
                        files: []
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
                }
            };

            // Find source files first as they're needed by multiple analyzers
            logger.info('Finding source files...');
            const sourceFiles = await this.findSourceFiles(normalizedPath);
            if (!Array.isArray(sourceFiles)) {
                throw new Error('Invalid source files result');
            }
            logger.info(`Found ${sourceFiles.length} source files to analyze`);

            // Execute analysis components in parallel
            logger.info('Starting parallel analysis of project components...');
            const analysisPromises = [
                {
                    name: 'structure',
                    promise: (async () => {
                        logger.info('Analyzing project structure...');
                        const structure = await this.analyzeStructure(normalizedPath);
                        return { ...structure, sourceFiles };
                    })()
                },
                {
                    name: 'dependencies',
                    promise: (async () => {
                        logger.info('Analyzing dependencies...');
                        return await this.analyzeDependencies(normalizedPath);
                    })()
                },
                {
                    name: 'security',
                    promise: (async () => {
                        logger.info('Analyzing security...');
                        return await this.analyzeSecurity(normalizedPath);
                    })()
                },
                {
                    name: 'quality',
                    promise: (async () => {
                        logger.info('Analyzing code quality...');
                        const [qualityMetrics, testCoverage] = await Promise.all([
                            this.qualityAnalyzer.analyzeCodeQuality(normalizedPath, fs),
                            this.qualityAnalyzer.analyzeTestCoverage(normalizedPath, fs)
                        ]);
                        return {
                            ...qualityMetrics,
                            testCoverage
                        };
                    })()
                },
                {
                    name: 'performance',
                    promise: (async () => {
                        logger.info('Analyzing performance metrics...');
                        const bundleSize = await this.performanceAnalyzer.analyzeBundleSize(sourceFiles, fs);
                        const asyncPatterns = await this.performanceAnalyzer.analyzeAsyncPatterns(sourceFiles, fs);
                        return { bundleSize, asyncPatterns };
                    })()
                },
                {
                    name: 'complexity',
                    promise: (async () => {
                        logger.info('Analyzing code complexity...');
                        return await this.complexityAnalyzer.analyzeComplexity(sourceFiles, fs);
                    })()
                }
            ];

            const analysisResults = await Promise.allSettled(analysisPromises.map(({ promise }) => promise));
            const warnings = [];
            const recommendations = [];

            // Process results and handle failures
            analysisResults.forEach((result, index) => {
                const { name } = analysisPromises[index];
                if (result.status === 'fulfilled') {
                    if (result.value && typeof result.value === 'object') {
                        this.metrics[name] = {
                            ...this.metrics[name],
                            ...result.value
                        };
                        
                        // Generate recommendations based on metrics
                        if (name === 'quality') {
                            const qualityMetrics = result.value;
                            
                            // Check for code duplication issues
                            if (qualityMetrics.duplicationScore < 80) {
                                recommendations.push({
                                    type: 'code-duplication',
                                    severity: 'medium',
                                    message: `High code duplication detected (${100 - qualityMetrics.duplicationScore}% of code). Consider refactoring duplicate code into reusable functions or modules.`,
                                    details: qualityMetrics.fileAnalyses
                                        .filter(analysis => analysis.duplicationScore < 80)
                                        .map(analysis => ({
                                            file: analysis.file,
                                            duplicateScore: analysis.duplicationScore,
                                            metrics: analysis.metrics.duplication
                                        }))
                                });
                            }
                            
                            // Check maintainability issues
                            if (qualityMetrics.maintainabilityIndex < 70) {
                                recommendations.push({
                                    type: 'maintainability',
                                    severity: 'high',
                                    message: `Low maintainability score (${qualityMetrics.maintainabilityIndex}/100). Consider improving code organization and documentation.`,
                                    details: qualityMetrics.fileAnalyses
                                        .filter(analysis => analysis.maintainabilityScore < 70)
                                        .map(analysis => ({
                                            file: analysis.file,
                                            score: analysis.maintainabilityScore,
                                            metrics: analysis.metrics
                                        }))
                                });
                            }
                        }
                    }
                } else {
                    const errorMessage = `${name} analysis failed: ${result.reason.message}`;
                    logger.error(errorMessage);
                    warnings.push(errorMessage);
                }
            });

            // Return comprehensive analysis results
            return {
                status: 'success',
                metrics: this.metrics,
                timestamp: new Date().toISOString(),
                projectPath: normalizedPath,
                sourceFiles: sourceFiles.length,
                warnings: warnings.length > 0 ? warnings : undefined
            };
        } catch (error) {
            logger.error(`Project analysis failed: ${error.message}`);
            throw new Error(`Project analysis failed: ${error.message}`);
        }
    }

    async analyzeStructure(projectPath) {
        try {
            const [
                hasPackageJson,
                hasReadme,
                hasTests,
                hasConfig,
                hasGitIgnore
            ] = await Promise.all([
                fs.access(path.join(projectPath, 'package.json')).then(() => true).catch(() => false),
                fs.access(path.join(projectPath, 'README.md')).then(() => true).catch(() => false),
                fs.access(path.join(projectPath, '__tests__')).then(() => true).catch(() => false),
                fs.access(path.join(projectPath, 'config')).then(() => true).catch(() => false),
                fs.access(path.join(projectPath, '.gitignore')).then(() => true).catch(() => false)
            ]);

            // Find source files
            const sourceFiles = await this.findSourceFiles(projectPath);

            // Update metrics structure with all fields
            this.metrics.structure = {
                hasPackageJson,
                hasReadme,
                hasTests,
                hasConfig,
                hasGitIgnore,
                sourceFiles: sourceFiles || [] // Ensure it's always an array
            };

            return this.metrics.structure;
        } catch (error) {
            logger.error(`Structure analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeDependencies(projectPath) {
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageData = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

            this.metrics.dependencies = {
                direct: Object.keys(packageData.dependencies || {}).length,
                dev: Object.keys(packageData.devDependencies || {}).length,
                peer: Object.keys(packageData.peerDependencies || {}).length,
                typescript: {
                    hasTypeScript: !!(packageData.dependencies?.typescript || packageData.devDependencies?.typescript),
                    hasTypesPackages: Object.keys({
                        ...packageData.dependencies,
                        ...packageData.devDependencies
                    }).some(pkg => pkg.startsWith('@types/'))
                },
                production: packageData.dependencies || {},
                development: packageData.devDependencies || {}
            };
        } catch (error) {
            logger.error(`Dependencies analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeCodeQuality(projectPath) {
        try {
            // Analyze linting configuration
            const hasEslint = await fs.access(path.join(projectPath, '.eslintrc'))
                .then(() => true)
                .catch(() => false);
            const hasPrettier = await fs.access(path.join(projectPath, '.prettierrc'))
                .then(() => true)
                .catch(() => false);

            // Analyze testing setup
            const [hasJest, hasMocha] = await Promise.all([
                this.hasPackage(projectPath, 'jest'),
                this.hasPackage(projectPath, 'mocha')
            ]);

            // Get test coverage metrics
            const testCoverage = await this.qualityAnalyzer.analyzeTestCoverage(projectPath, fs);

            // Calculate maintainability metrics
            const maintainabilityIndex = await this.qualityAnalyzer.calculateMaintenanceScore(
                await this.getProjectContent(projectPath)
            );

            // Update quality metrics
            this.metrics.quality = {
                ...this.metrics.quality,
                linting: { hasEslint, hasPrettier },
                testing: { hasJest, hasMocha },
                testCoverage,
                maintainabilityIndex,
                issues: [] // Will be populated by issue detection
            };

            // Analyze and collect code quality issues
            const sourceFiles = await this.findSourceFiles(projectPath);
            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const fileIssues = this.qualityAnalyzer.detectCodeIssues(content);
                if (fileIssues.length > 0) {
                    this.metrics.quality.issues.push({
                        file: path.relative(projectPath, file),
                        issues: fileIssues
                    });
                }
            }
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            throw error;
        }
    }

    async getProjectContent(projectPath) {
        const sourceFiles = await this.findSourceFiles(projectPath);
        const contents = await Promise.all(
            sourceFiles.map(file => fs.readFile(file, 'utf-8'))
        );
        return contents.join('\n');
    }

    async calculateMaintainabilityIndex(projectPath) {
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalScore = 0;

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const complexity = this.calculateComplexity(content);
                totalScore += 100 - complexity;
            }

            return sourceFiles.length > 0 ? Math.max(0, Math.min(100, totalScore / sourceFiles.length)) : 70;
        } catch (error) {
            return 70; // Default score
        }
    }

    async analyzeSecurity(projectPath) {
        const hasPackageLock = await fs.access(path.join(projectPath, 'package-lock.json'))
            .then(() => true)
            .catch(() => false);
        const hasEnvExample = await fs.access(path.join(projectPath, '.env.example'))
            .then(() => true)
            .catch(() => false);

        this.metrics.security = {
            hasPackageLock,
            securityFiles: {
                hasEnvExample
            }
        };
    }

    async analyzePerformance(projectPath) {
        try {
            const bundleSize = await this.calculateBundleSize(projectPath);
            const asyncPatterns = await this.analyzeAsyncPatterns(projectPath);

            this.metrics.performance = {
                bundleSize,
                asyncPatterns
            };
        } catch (error) {
            logger.error(`Performance analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeComplexity(projectPath) {
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalComplexity = 0;
            let highestComplexity = 0;
            const complexityData = [];

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const complexity = this.calculateComplexity(content);
                const relativePath = path.relative(projectPath, file);
                
                complexityData.push({ path: relativePath, complexity });
                totalComplexity += complexity;
                highestComplexity = Math.max(highestComplexity, complexity);
            }

            const averageComplexity = sourceFiles.length > 0 ? totalComplexity / sourceFiles.length : 0;

            this.metrics.complexity = {
                cyclomaticComplexity: {
                    average: averageComplexity,
                    highest: highestComplexity,
                    files: complexityData
                }
            };
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            throw error;
        }
    }

    calculateComplexity(content) {
        const complexityFactors = {
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
            logicalOperators: {
                patterns: [/&&|\|\|/g],
                weight: 0.5
            },
            ternary: {
                patterns: [/\?[^:]+:/g],
                weight: 0.5
            },
            functions: {
                patterns: [
                    /function\s+\w+\s*\([^)]*\)\s*{/g,
                    /\w+\s*:\s*function\s*\([^)]*\)\s*{/g,
                    /=>\s*{/g
                ],
                weight: 0.5
            }
        };

        let totalComplexity = 1; // Base complexity
        
        for (const factor of Object.values(complexityFactors)) {
            const matchCount = factor.patterns.reduce((count, pattern) => {
                const matches = content.match(pattern) || [];
                return count + matches.length;
            }, 0);
            totalComplexity += matchCount * factor.weight;
        }

        return Math.round(totalComplexity * 10) / 10; // Round to 1 decimal place
    }

    async analyzeBestPractices(projectPath) {
        this.metrics.practices = {
            documentation: {
                hasReadme: this.metrics.structure.hasReadme
            },
            cicd: {
                hasGithubActions: await fs.access(path.join(projectPath, '.github/workflows'))
                    .then(() => true)
                    .catch(() => false)
            },
            docker: {
                hasDockerfile: await fs.access(path.join(projectPath, 'Dockerfile'))
                    .then(() => true)
                    .catch(() => false)
            }
        };
    }

    async findSourceFiles(projectPath) {
        if (!projectPath || typeof projectPath !== 'string') {
            logger.error('Invalid project path provided to findSourceFiles');
            return [];
        }

        const sourceFiles = new Set();
        const ignoredDirs = new Set([
            'node_modules', 'coverage', 'dist', 'build',
            '.git', '.svn', '.hg', 'vendor', 'tmp'
        ]);
        const sourceFileExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
        const testFilePatterns = ['.test.', '.spec.', '.d.ts', '.min.js'];
        
        try {
            const walk = async (dir) => {
                try {
                    const entries = await fs.readdir(dir, { withFileTypes: true });
                    
                    for (const entry of entries) {
                        // Skip ignored directories and files
                        if (entry.name.startsWith('.') || ignoredDirs.has(entry.name)) {
                            continue;
                        }

                        const fullPath = path.join(dir, entry.name);
                        
                        if (entry.isDirectory()) {
                            await walk(fullPath).catch(error => {
                                logger.warn(`Skipping directory ${fullPath}: ${error.message}`);
                            });
                        } else if (entry.isFile()) {
                            const ext = path.extname(entry.name).toLowerCase();
                            if (sourceFileExtensions.has(ext) && 
                                !testFilePatterns.some(pattern => entry.name.includes(pattern))) {
                                sourceFiles.add(fullPath);
                            }
                        }
                    }
                } catch (error) {
                    logger.warn(`Error reading directory ${dir}: ${error.message}`);
                }
            };

            await walk(projectPath);
            return Array.from(sourceFiles);
        } catch (error) {
            logger.error(`Failed to find source files: ${error.message}`);
            return [];
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

    async hasPackage(projectPath, packageName) {
        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8'));
            return !!(packageJson.dependencies?.[packageName] || packageJson.devDependencies?.[packageName]);
        } catch {
            return false;
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

            return {
                raw: totalSize,
                formatted: this.formatBytes(totalSize)
            };
        } catch (error) {
            logger.warn(`Bundle size calculation failed: ${error.message}`);
            return { raw: 0, formatted: '0 B' };
        }
    }

    async analyzeAsyncPatterns(projectPath) {
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            const patterns = {
                promises: 0,
                asyncAwait: 0,
                callbacks: 0
            };

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                patterns.promises += (content.match(/new\s+Promise|Promise\.(all|race|resolve|reject)/g) || []).length;
                patterns.asyncAwait += (content.match(/async|await/g) || []).length;
                patterns.callbacks += (content.match(/callback|cb|done|next/g) || []).length;
            }

            return patterns;
        } catch (error) {
            logger.warn(`Async patterns analysis failed: ${error.message}`);
            return { promises: 0, asyncAwait: 0, callbacks: 0 };
        }
    }
}

module.exports = ProjectAnalyzer;
