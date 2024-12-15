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
            // Verify project path exists
            try {
                await fs.access(projectPath);
            } catch (error) {
                throw new Error(`Project path does not exist: ${projectPath}`);
            }

            const sourceFiles = await this.findSourceFiles(projectPath);
            
            // Initialize metrics structure
            this.metrics = {
                structure: {},
                dependencies: {
                    production: [],
                    development: []
                },
                quality: {
                    issues: [],
                    linting: {},
                    maintainabilityIndex: 0
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

            // Basic structure analysis
            logger.info('Analyzing project structure...');
            await this.analyzeStructure(projectPath);
            this.metrics.structure.sourceFiles = sourceFiles;

            // Dependencies analysis
            logger.info('Analyzing dependencies...');
            await this.analyzeDependencies(projectPath);

            // Security analysis
            logger.info('Analyzing security...');
            await this.analyzeSecurity(projectPath);

            // Code quality analysis
            logger.info('Analyzing code quality...');
            const qualityMetrics = await this.qualityAnalyzer.analyzeCodeQuality(projectPath, fs, sourceFiles);
            this.metrics.quality = {
                ...this.metrics.quality,
                ...qualityMetrics
            };

            // Best practices
            logger.info('Checking best practices...');
            await this.analyzeBestPractices(projectPath);

            // Performance metrics
            logger.info('Analyzing performance metrics...');
            const [bundleSize, asyncPatterns] = await Promise.all([
                this.performanceAnalyzer.analyzeBundleSize(sourceFiles, fs),
                this.performanceAnalyzer.analyzeAsyncPatterns(sourceFiles, fs)
            ]);
            this.metrics.performance = { bundleSize, asyncPatterns };

            // Code complexity
            logger.info('Analyzing code complexity...');
            const complexityMetrics = await this.complexityAnalyzer.analyzeComplexity(sourceFiles, fs);
            this.metrics.complexity = {
                ...this.metrics.complexity,
                ...complexityMetrics
            };

            return {
                status: 'success',
                metrics: this.metrics,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`Analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeStructure(projectPath) {
        const hasPackageJson = await fs.access(path.join(projectPath, 'package.json'))
            .then(() => true)
            .catch(() => false);
        const hasReadme = await fs.access(path.join(projectPath, 'README.md'))
            .then(() => true)
            .catch(() => false);
        const hasTests = await fs.access(path.join(projectPath, '__tests__'))
            .then(() => true)
            .catch(() => false);
        const hasConfig = await fs.access(path.join(projectPath, 'config'))
            .then(() => true)
            .catch(() => false);
        const hasGitIgnore = await fs.access(path.join(projectPath, '.gitignore'))
            .then(() => true)
            .catch(() => false);

        const sourceFiles = await this.findSourceFiles(projectPath);

        this.metrics.structure = {
            hasPackageJson,
            hasReadme,
            hasTests,
            hasConfig,
            hasGitIgnore,
            sourceFiles
        };
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
            const hasEslint = await fs.access(path.join(projectPath, '.eslintrc'))
                .then(() => true)
                .catch(() => false);
            const hasPrettier = await fs.access(path.join(projectPath, '.prettierrc'))
                .then(() => true)
                .catch(() => false);

            this.metrics.quality.linting = { hasEslint, hasPrettier };
            this.metrics.quality.testing = {
                hasJest: await this.hasPackage(projectPath, 'jest'),
                hasMocha: await this.hasPackage(projectPath, 'mocha')
            };

            this.metrics.quality.maintainabilityIndex = await this.calculateMaintainabilityIndex(projectPath);
            this.metrics.quality.issues = [];
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            throw error;
        }
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
