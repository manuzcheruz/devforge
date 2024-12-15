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

            const recommendations = {
                documentation: [],
                quality: [],
                security: [],
                performance: [],
                complexity: []
            };

            // Generate recommendations based on metrics
            this.generateRecommendations(
                { structure, dependencies, security, quality, performance, complexity },
                recommendations
            );

            return {
                status: 'success',
                metrics: {
                    structure,
                    dependencies,
                    security,
                    quality,
                    performance,
                    complexity
                },
                recommendations: Object.values(recommendations).some(arr => arr.length > 0) 
                    ? recommendations 
                    : undefined,
                timestamp: new Date().toISOString(),
                projectPath: normalizedPath,
                sourceFiles: sourceFiles.length
            };
        } catch (error) {
            logger.error(`Project analysis failed: ${error.message}`);
            throw new Error(`Project analysis failed: ${error.message}`);
        }
    }

    async analyzeStructure(projectPath) {
        logger.info('Analyzing project structure...');
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

            return {
                hasPackageJson,
                hasReadme,
                hasTests,
                hasConfig,
                hasGitIgnore
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
            const [qualityMetrics, testCoverage] = await Promise.all([
                this.qualityAnalyzer.analyzeCodeQuality(projectPath, fs),
                this.qualityAnalyzer.analyzeTestCoverage(projectPath, fs)
            ]);

            return {
                ...qualityMetrics,
                testCoverage
            };
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            throw error;
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

    generateRecommendations(metrics, recommendations) {
        const { quality, complexity, performance } = metrics;

        if (quality?.maintainabilityIndex < 70) {
            recommendations.quality.push({
                type: 'maintainability',
                severity: 'high',
                message: `Low maintainability score (${quality.maintainabilityIndex}/100). Consider improving code organization and documentation.`
            });
        }

        if (complexity?.cyclomaticComplexity?.average > 15) {
            recommendations.complexity.push({
                type: 'complexity',
                severity: 'medium',
                message: `High average complexity (${complexity.cyclomaticComplexity.average}). Consider breaking down complex functions.`
            });
        }

        if (performance?.bundleSize?.raw > 1000000) {
            recommendations.performance.push({
                type: 'bundle-size',
                severity: 'medium',
                message: `Large bundle size (${performance.bundleSize.formatted}). Consider code splitting or removing unused dependencies.`
            });
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