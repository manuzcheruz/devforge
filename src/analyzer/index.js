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
            
            // Initialize default analysis results
            const defaultAnalysis = {
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
                    }
                },
                security: {
                    hasPackageLock: false,
                    securityFiles: {
                        hasEnvExample: false
                    },
                    issues: []
                },
                quality: {
                    issues: [],
                    linting: {},
                    documentation: {
                        hasReadme: false,
                        hasApiDocs: false,
                        readmeQuality: 0,
                        coverage: 0,
                        issues: []
                    },
                    maintainabilityIndex: 70,
                    testCoverage: {
                        lines: 0,
                        functions: 0,
                        branches: 0,
                        statements: 0
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
                        files: []
                    }
                }
            };

            // Run all analyses in parallel
            const results = await Promise.all([
                this.analyzeStructure(normalizedPath),
                this.analyzeDependencies(normalizedPath),
                this.analyzeSecurity(normalizedPath),
                this.analyzeCodeQuality(normalizedPath),
                this.analyzePerformance(sourceFiles),
                this.analyzeComplexity(sourceFiles)
            ]).catch(error => {
                logger.error(`Analysis failed: ${error.message}`);
                return [
                    defaultAnalysis.structure,
                    defaultAnalysis.dependencies,
                    defaultAnalysis.security,
                    defaultAnalysis.quality,
                    defaultAnalysis.performance,
                    defaultAnalysis.complexity
                ];
            });

            const [
                structureResult,
                dependenciesResult,
                securityResult,
                qualityResult,
                performanceResult,
                complexityResult
            ] = results;

            // Deep merge results with defaults to ensure all properties exist
            const analysisResults = {
                structure: { 
                    ...defaultAnalysis.structure, 
                    ...structureResult 
                },
                dependencies: { 
                    ...defaultAnalysis.dependencies, 
                    ...dependenciesResult 
                },
                security: { 
                    ...defaultAnalysis.security, 
                    ...securityResult 
                },
                quality: {
                    ...defaultAnalysis.quality,
                    ...(qualityResult || {}),
                    documentation: {
                        ...defaultAnalysis.quality.documentation,
                        ...((qualityResult && qualityResult.documentation) || {})
                    },
                    testCoverage: {
                        ...defaultAnalysis.quality.testCoverage,
                        ...((qualityResult && qualityResult.testCoverage) || {})
                    }
                },
                performance: { 
                    ...defaultAnalysis.performance, 
                    ...performanceResult 
                },
                complexity: { 
                    ...defaultAnalysis.complexity, 
                    ...complexityResult 
                }
            };

            // Ensure documentation property exists and is properly initialized
            if (!analysisResults.quality.documentation) {
                analysisResults.quality.documentation = { ...defaultAnalysis.quality.documentation };
            }

            logger.info('Analysis results merged successfully');
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
        logger.info('Generating project recommendations...');
        
        // Initialize recommendations object
        const recommendations = {
            documentation: [],
            quality: [],
            security: [],
            performance: [],
            complexity: []
        };

        try {
            // Initialize default metrics with complete structure
            const defaultMetrics = {
                quality: {
                    documentation: {
                        hasReadme: false,
                        hasApiDocs: false,
                        readmeQuality: 0,
                        coverage: 0,
                        issues: []
                    },
                    testCoverage: {
                        lines: 0,
                        functions: 0,
                        branches: 0,
                        statements: 0
                    },
                    maintainabilityIndex: 70,
                    issues: []
                },
                complexity: {
                    cyclomaticComplexity: {
                        average: 0,
                        highest: 0
                    }
                },
                performance: {
                    bundleSize: {
                        raw: 0,
                        formatted: '0 B'
                    }
                },
                security: {
                    hasPackageLock: false,
                    issues: []
                },
                structure: {
                    hasTests: true
                }
            };

            // Ensure metrics has a quality object
            if (!metrics.quality) {
                metrics.quality = {};
            }

            // Deep merge metrics with defaults
            const quality = {
                ...defaultMetrics.quality,
                ...metrics.quality,
                documentation: {
                    ...defaultMetrics.quality.documentation,
                    ...(metrics.quality?.documentation || {})
                },
                testCoverage: {
                    ...defaultMetrics.quality.testCoverage,
                    ...(metrics.quality?.testCoverage || {})
                }
            };

            const complexity = {
                ...defaultMetrics.complexity,
                ...metrics.complexity,
                cyclomaticComplexity: {
                    ...defaultMetrics.complexity.cyclomaticComplexity,
                    ...(metrics.complexity?.cyclomaticComplexity || {})
                }
            };

            const performance = {
                ...defaultMetrics.performance,
                ...metrics.performance,
                bundleSize: {
                    ...defaultMetrics.performance.bundleSize,
                    ...(metrics.performance?.bundleSize || {})
                }
            };

            const security = {
                ...defaultMetrics.security,
                ...metrics.security
            };

            const structure = {
                ...defaultMetrics.structure,
                ...metrics.structure
            };

            logger.info('Analyzing metrics for recommendations...');
        
        // Documentation recommendations
            if (!quality.documentation.hasReadme) {
                recommendations.documentation.push({
                    type: 'missing-docs',
                    severity: 'medium',
                    message: 'Missing README.md file. Add project documentation for better maintainability.'
                });
            }

            if (quality.documentation.coverage < 50) {
                recommendations.documentation.push({
                    type: 'low-coverage',
                    severity: 'medium',
                    message: `Low documentation coverage (${quality.documentation.coverage}%). Consider adding JSDoc comments.`
                });
            }

            // Structure recommendations
            if (structure.hasTests === false) {
                recommendations.quality.push({
                    type: 'missing-tests',
                    severity: 'high',
                    message: 'No test directory found. Consider adding tests to improve code quality.'
                });
            }

            // Complexity recommendations
            if (complexity.cyclomaticComplexity.average > 15) {
                recommendations.complexity.push({
                    type: 'complexity',
                    severity: 'medium',
                    message: `High average complexity (${complexity.cyclomaticComplexity.average}). Consider breaking down complex functions.`
                });
            }

            // Performance recommendations
            if (performance.bundleSize.raw > 1000000) {
                recommendations.performance.push({
                    type: 'bundle-size',
                    severity: 'medium',
                    message: `Large bundle size (${performance.bundleSize.formatted || '1MB+'}). Consider code splitting.`
                });
            }

            // Security recommendations
            if (security.hasPackageLock === false) {
                recommendations.security.push({
                    type: 'missing-lock',
                    severity: 'high',
                    message: 'Missing package-lock.json. Add it to ensure consistent dependency versions.'
                });
            }

            // Test coverage recommendations
            if (quality.testCoverage.lines < 60 || quality.testCoverage.functions < 60) {
                recommendations.quality.push({
                    type: 'test-coverage',
                    severity: 'medium',
                    message: `Low test coverage (Lines: ${quality.testCoverage.lines}%, Functions: ${quality.testCoverage.functions}%). Add more tests.`
                });
            }

            // Return recommendations if we have any
            const hasRecommendations = Object.values(recommendations).some(arr => arr.length > 0);
            return hasRecommendations ? recommendations : {};
        } catch (error) {
            logger.error(`Error generating recommendations: ${error.message}`);
            return {
                error: [{
                    type: 'analysis-error',
                    severity: 'high',
                    message: `Failed to generate recommendations: ${error.message}`
                }]
            };
        }
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
        
        // Define default quality metrics
        const defaultQuality = {
            issues: [],
            linting: {},
            documentation: {
                hasReadme: false,
                hasApiDocs: false,
                readmeQuality: 0,
                coverage: 0,
                issues: []
            },
            testCoverage: {
                lines: 0,
                functions: 0,
                branches: 0,
                statements: 0
            },
            maintainabilityIndex: 70,
            fileAnalyses: [],
            duplicationScore: 100
        };

        try {
            // Run quality analysis with proper error handling
            const [qualityMetrics, testCoverage] = await Promise.all([
                this.qualityAnalyzer.analyzeCodeQuality(projectPath, fs)
                    .catch(error => {
                        logger.error(`Quality analysis failed: ${error.message}`);
                        return { ...defaultQuality };
                    }),
                this.qualityAnalyzer.analyzeTestCoverage(projectPath, fs)
                    .catch(error => {
                        logger.error(`Test coverage analysis failed: ${error.message}`);
                        return { ...defaultQuality.testCoverage };
                    })
            ]);

            // Deep merge results ensuring all properties exist
            const mergedQuality = {
                ...defaultQuality,
                ...qualityMetrics,
                documentation: {
                    ...defaultQuality.documentation,
                    ...(qualityMetrics?.documentation || {})
                },
                testCoverage: {
                    ...defaultQuality.testCoverage,
                    ...(testCoverage || {})
                }
            };

            // Validate documentation property exists
            if (!mergedQuality.documentation) {
                mergedQuality.documentation = { ...defaultQuality.documentation };
            }

            return mergedQuality;
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            return { ...defaultQuality };
        }
    }

    async analyzePerformance(sourceFiles) {
        logger.info('Analyzing performance metrics...');
        try {
            const [bundleSize, asyncPatterns, memoryUsage, executionTime] = await Promise.all([
                this.performanceAnalyzer.analyzeBundleSize(sourceFiles, fs),
                this.performanceAnalyzer.analyzeAsyncPatterns(sourceFiles, fs),
                this.performanceAnalyzer.analyzeMemoryUsage(),
                this.performanceAnalyzer.analyzeExecutionTime(sourceFiles, fs)
            ]);

            return { 
                bundleSize, 
                asyncPatterns,
                memoryUsage,
                executionTime
            };
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