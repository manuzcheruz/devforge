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
                linting: {},
                documentation: {
                    hasReadme: false,
                    hasApiDocs: false,
                    readmeQuality: 0,
                    coverage: 0,
                    issues: []
                }
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
            if (!projectPath || typeof projectPath !== 'string') {
                throw new Error('Valid project path is required');
            }

            const normalizedPath = path.resolve(projectPath);
            const stats = await fs.stat(normalizedPath);
            if (!stats.isDirectory()) {
                throw new Error('Project path must be a directory');
            }

            logger.info('Finding source files...');
            const sourceFiles = await this.findSourceFiles(normalizedPath);
            if (!Array.isArray(sourceFiles)) {
                throw new Error('Invalid source files result');
            }
            logger.info(`Found ${sourceFiles.length} source files to analyze`);

            logger.info('Starting parallel analysis of project components...');
            const analysisPromises = [
                this.analyzeStructure(normalizedPath),
                this.analyzeDependencies(normalizedPath),
                this.analyzeSecurity(normalizedPath),
                this.analyzeCodeQuality(normalizedPath),
                this.analyzePerformance(sourceFiles),
                this.analyzeComplexity(sourceFiles)
            ];

            const [structure, dependencies, security, quality, performance, complexity] = 
                await Promise.all(analysisPromises);

            // Initialize documentation metrics with defaults
            const defaultDocumentation = {
                hasReadme: false,
                hasApiDocs: false,
                readmeQuality: 0,
                coverage: 0,
                issues: []
            };

            // Initialize quality metrics with documentation
            const defaultQualityMetrics = {
                issues: [],
                linting: {},
                documentation: defaultDocumentation,
                testCoverage: 0
            };

            let projectQuality = defaultQualityMetrics;
            try {
                const [qualityMetrics, testCoverage, documentation] = await Promise.all([
                    this.qualityAnalyzer.analyzeCodeQuality(projectPath, fs),
                    this.qualityAnalyzer.analyzeTestCoverage(projectPath, fs),
                    this.qualityAnalyzer.analyzeDocumentation(projectPath, fs)
                ]);

                projectQuality = {
                    ...defaultQualityMetrics,
                    ...qualityMetrics,
                    testCoverage,
                    documentation: {
                        ...defaultDocumentation,
                        ...(documentation || {})
                    }
                };
            } catch (error) {
                logger.warn(`Quality analysis warning: ${error.message}`);
            }

            // Ensure all metrics are properly initialized with defaults
            const analysisResults = {
                structure: structure || {
                    hasPackageJson: false,
                    hasReadme: false,
                    hasTests: false,
                    hasConfig: false,
                    hasGitIgnore: false,
                    sourceFiles: []
                },
                dependencies: dependencies || {
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
                security: security || {
                    hasPackageLock: false,
                    securityFiles: {
                        hasEnvExample: false
                    },
                    issues: []
                },
                quality: {
                    ...defaultQualityMetrics,
                    ...projectQuality
                },
                performance: performance || {
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
                complexity: complexity || {
                    cyclomaticComplexity: {
                        average: 0,
                        highest: 0,
                        files: []
                    }
                }
            };

            const projectRecommendations = this.generateRecommendations(analysisResults);

            return {
                status: 'success',
                metrics: analysisResults,
                recommendations: projectRecommendations,
                timestamp: new Date().toISOString(),
                projectPath: normalizedPath,
                sourceFiles: sourceFiles.length
            };
        } catch (error) {
            logger.error(`Project analysis failed: ${error.message}`);
            throw new Error(`Project analysis failed: ${error.message}`);
        }
    }

    generateRecommendations(metrics = {}) {
        const recommendations = {
            documentation: [],
            quality: [],
            security: [],
            performance: [],
            complexity: []
        };

        // Check documentation metrics
        const defaultDocMetrics = {
            hasReadme: false,
            hasApiDocs: false,
            readmeQuality: 0,
            coverage: 0,
            issues: []
        };
        
        const documentation = {
            ...defaultDocMetrics,
            ...(metrics?.quality?.documentation || {})
        };
        
        if (!documentation.hasReadme) {
            recommendations.documentation.push({
                type: 'missing-docs',
                severity: 'medium',
                message: 'Missing README.md file. Add project documentation for better maintainability.'
            });
        }

        if (documentation.coverage < 50) {
            recommendations.documentation.push({
                type: 'low-coverage',
                severity: 'medium',
                message: `Low documentation coverage (${documentation.coverage}%). Consider adding more JSDoc comments and documentation.`
            });
        }

        // Check project structure
        const structure = metrics.structure || {};
        if (structure.hasTests === false) {
            recommendations.quality.push({
                type: 'missing-tests',
                severity: 'high',
                message: 'No test directory found. Consider adding tests to improve code quality.'
            });
        }

        // Check code complexity
        const complexity = metrics.complexity?.cyclomaticComplexity || {};
        if (complexity.average && complexity.average > 15) {
            recommendations.complexity.push({
                type: 'complexity',
                severity: 'medium',
                message: `High average complexity (${complexity.average}). Consider breaking down complex functions.`
            });
        }

        // Check performance metrics
        const performance = metrics.performance?.bundleSize || {};
        if (performance.raw && performance.raw > 1000000) {
            recommendations.performance.push({
                type: 'bundle-size',
                severity: 'medium',
                message: `Large bundle size (${performance.formatted || '1MB+'}). Consider code splitting or removing unused dependencies.`
            });
        }

        // Check security measures
        const security = metrics.security || {};
        if (security.hasPackageLock === false) {
            recommendations.security.push({
                type: 'missing-lock',
                severity: 'high',
                message: 'Missing package-lock.json. Add it to ensure consistent dependency versions.'
            });
        }

        // Check code quality
        const quality = metrics.quality || {};
        if (quality.testCoverage && quality.testCoverage < 60) {
            recommendations.quality.push({
                type: 'test-coverage',
                severity: 'medium',
                message: `Low test coverage (${quality.testCoverage}%). Consider adding more tests.`
            });
        }

        // Only return recommendations if we have any
        const hasRecommendations = Object.values(recommendations).some(arr => arr.length > 0);
        return hasRecommendations ? recommendations : {};
    }

    async analyzeStructure(projectPath) {
        logger.info('Analyzing project structure...');
        try {
            const [hasPackageJson, hasReadme, hasTests, hasConfig, hasGitIgnore] = 
                await Promise.all([
                    fs.access(path.join(projectPath, 'package.json')).then(() => true).catch(() => false),
                    fs.access(path.join(projectPath, 'README.md')).then(() => true).catch(() => false),
                    fs.access(path.join(projectPath, '__tests__')).then(() => true).catch(() => false),
                    fs.access(path.join(projectPath, 'config')).then(() => true).catch(() => false),
                    fs.access(path.join(projectPath, '.gitignore')).then(() => true).catch(() => false)
                ]);

            // Get source files
            const sourceFiles = await this.findSourceFiles(projectPath);

            return {
                hasPackageJson,
                hasReadme,
                hasTests,
                hasConfig,
                hasGitIgnore,
                sourceFiles: sourceFiles || [] // Ensure we always return an array
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
            const packageData = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

            return {
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

    async analyzeSecurity(projectPath) {
        logger.info('Analyzing security...');
        try {
            const [hasPackageLock, hasEnvExample] = await Promise.all([
                fs.access(path.join(projectPath, 'package-lock.json')).then(() => true).catch(() => false),
                fs.access(path.join(projectPath, '.env.example')).then(() => true).catch(() => false)
            ]);

            return {
                hasPackageLock,
                securityFiles: {
                    hasEnvExample
                },
                issues: []
            };
        } catch (error) {
            logger.error(`Security analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeCodeQuality(projectPath) {
        logger.info('Analyzing code quality...');
        try {
            const [qualityMetrics, testCoverage, documentation] = await Promise.all([
                this.qualityAnalyzer.analyzeCodeQuality(projectPath, fs),
                this.qualityAnalyzer.analyzeTestCoverage(projectPath, fs),
                (async () => {
                    const docMetrics = {
                        hasReadme: false,
                        hasApiDocs: false,
                        readmeQuality: 0,
                        coverage: 0,
                        issues: []
                    };

                    try {
                        // Check README.md
                        docMetrics.hasReadme = await fs.access(path.join(projectPath, 'README.md'))
                            .then(() => true)
                            .catch(() => false);
                        
                        // Check API documentation
                        docMetrics.hasApiDocs = await fs.access(path.join(projectPath, 'docs/api'))
                            .then(() => true)
                            .catch(() => false);

                        // Calculate basic documentation coverage
                        let coveragePoints = 0;
                        if (docMetrics.hasReadme) coveragePoints += 50;
                        if (docMetrics.hasApiDocs) coveragePoints += 30;
                        
                        // Check for additional documentation files
                        const contributingExists = await fs.access(path.join(projectPath, 'CONTRIBUTING.md'))
                            .then(() => true)
                            .catch(() => false);
                        if (contributingExists) coveragePoints += 20;

                        docMetrics.coverage = Math.min(100, coveragePoints);
                        
                        // Basic readme quality check if exists
                        if (docMetrics.hasReadme) {
                            const readmeContent = await fs.readFile(path.join(projectPath, 'README.md'), 'utf-8');
                            const sections = readmeContent.split('\n#').length;
                            const hasCodeExamples = readmeContent.includes('```');
                            const hasInstallation = /installation|setup|getting started/i.test(readmeContent);
                            
                            docMetrics.readmeQuality = Math.min(100, 
                                (sections > 3 ? 40 : 20) + 
                                (hasCodeExamples ? 30 : 0) + 
                                (hasInstallation ? 30 : 0)
                            );
                        }

                        return docMetrics;
                    } catch (docError) {
                        logger.warn(`Documentation analysis warning: ${docError.message}`);
                        return docMetrics;
                    }
                })()
            ]);

            return {
                ...qualityMetrics,
                testCoverage,
                documentation
            };
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            return {
                issues: [],
                testCoverage: 0,
                documentation: {
                    hasReadme: false,
                    hasApiDocs: false,
                    readmeQuality: 0,
                    coverage: 0,
                    issues: []
                }
            };
        }
    }

    async analyzePerformance(sourceFiles) {
        logger.info('Analyzing performance metrics...');
        try {
            const [bundleSize, asyncPatterns] = await Promise.all([
                this.performanceAnalyzer.analyzeBundleSize(sourceFiles, fs),
                this.performanceAnalyzer.analyzeAsyncPatterns(sourceFiles, fs)
            ]);

            return { bundleSize, asyncPatterns };
        } catch (error) {
            logger.error(`Performance analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeComplexity(sourceFiles) {
        logger.info('Analyzing code complexity...');
        try {
            return await this.complexityAnalyzer.analyzeComplexity(sourceFiles, fs);
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            throw error;
        }
    }

    async findSourceFiles(projectPath) {
        const sourceFiles = new Set();
        const ignoredDirs = new Set([
            'node_modules', 'coverage', 'dist', 'build',
            '.git', '.svn', '.hg', 'vendor', 'tmp'
        ]);
        const sourceFileExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
        const testFilePatterns = ['.test.', '.spec.', '.d.ts', '.min.js'];
        
        const walk = async (dir) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
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
    }
}

module.exports = ProjectAnalyzer;