const { BasePlugin } = require('../interfaces/base');

class PerformanceAnalyzerPlugin extends BasePlugin {
    constructor() {
        super({
            name: 'performance-analyzer',
            version: '1.0.0',
            description: 'Analyzes project performance metrics',
            category: 'performance',
            capabilities: {
                bundleAnalysis: true,
                dependencyAudit: true,
                runtimeMetrics: true
            }
        });
    }

    async initialize(context) {
        this.metrics = {
            bundleSize: 0,
            dependencies: [],
            complexityScore: 0
        };
    }

    async execute(context) {
        const { projectPath } = context;
        const logger = require('../../utils/logger');

        try {
            logger.info('Starting performance analysis...');
            
            const startTime = Date.now();
            const analysis = {
                timestamp: new Date().toISOString(),
                metrics: await this.analyzeMetrics(projectPath),
                recommendations: await this.generateDetailedRecommendations(projectPath),
                score: 0 // Will be calculated based on metrics
            };

            // Calculate overall performance score
            analysis.score = this.calculatePerformanceScore(analysis.metrics);
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.success(`Performance analysis completed in ${duration}s`);
            
            return analysis;
        } catch (error) {
            logger.error(`Performance analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeMetrics(projectPath) {
        const fs = require('fs').promises;
        const path = require('path');
        const logger = require('../../utils/logger');
        
        try {
            logger.info('Starting performance metrics analysis...');
            
            // Collect project statistics
            const stats = await this.collectProjectStats(projectPath);
            const dependencies = await this.analyzeDependencies(projectPath);
            const asyncPatterns = await this.analyzeAsyncPatterns(projectPath);
            const runtimeMetrics = await this.analyzeRuntimeMetrics(projectPath);
            
            const metrics = {
                bundleSize: {
                    total: stats.totalSize,
                    formatted: this.formatBytes(stats.totalSize),
                    distribution: stats.files.map(f => ({
                        path: path.relative(projectPath, f.path),
                        size: f.size,
                        percentage: (f.size / stats.totalSize * 100).toFixed(2)
                    })),
                    warning: stats.totalSize > 1024 * 1024 ? 'Bundle size exceeds 1MB' : null
                },
                dependencies: {
                    count: dependencies.length,
                    heavyDependencies: dependencies.filter(d => d.size > 1024 * 1024),
                    versions: dependencies.reduce((acc, d) => {
                        acc[d.name] = d.version;
                        return acc;
                    }, {}),
                    recommendations: this.generateDependencyRecommendations(dependencies)
                },
                asyncUsage: {
                    ...asyncPatterns,
                    ratio: asyncPatterns.asyncAwait / (asyncPatterns.callbacks || 1),
                    recommendation: this.getAsyncRecommendation(asyncPatterns)
                },
                runtime: runtimeMetrics,
                complexity: this.calculateComplexity(stats),
                score: this.calculatePerformanceScore({
                    bundleSize: stats.totalSize,
                    dependencyCount: dependencies.length,
                    asyncRatio: asyncPatterns.asyncAwait / (asyncPatterns.callbacks || 1)
                })
            };

            logger.info('Performance metrics analysis completed successfully');
            return metrics;
        } catch (error) {
            logger.error(`Performance metrics analysis failed: ${error.message}`);
            return {
                error: error.message,
                bundleSize: { total: 0, formatted: '0 B', distribution: [] },
                dependencies: { count: 0, heavyDependencies: [], versions: {}, recommendations: [] },
                asyncUsage: { promises: 0, asyncAwait: 0, callbacks: 0, ratio: 0, recommendation: null },
                runtime: {},
                complexity: 0,
                score: 0
            };
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

    async analyzeDependencies(projectPath) {
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
            const nodeModulesPath = path.join(projectPath, 'node_modules');
            
            const dependencies = await Promise.all(
                Object.entries(packageJson.dependencies || {})
                    .map(async ([name, version]) => {
                        const depPath = path.join(nodeModulesPath, name);
                        try {
                            const size = await this.calculateDependencySize(depPath);
                            return {
                                name,
                                version,
                                size,
                                sizeFormatted: this.formatBytes(size),
                                isHeavy: size > 1024 * 1024 // Flag as heavy if > 1MB
                            };
                        } catch (err) {
                            return { name, version, size: 0, sizeFormatted: '0 B', isHeavy: false };
                        }
                    })
            );
            
            return dependencies.sort((a, b) => b.size - a.size);
        } catch (error) {
            console.warn('Error analyzing dependencies:', error);
            return [];
        }
    }

    async calculateDependencySize(depPath) {
        let totalSize = 0;
        
        const calculateSize = async (dirPath) => {
            try {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    
                    if (entry.isDirectory()) {
                        await calculateSize(fullPath);
                    } else if (entry.isFile()) {
                        const stats = await fs.stat(fullPath);
                        totalSize += stats.size;
                    }
                }
            } catch (error) {
                // Skip if directory or file is not accessible
                return;
            }
        };
        
        await calculateSize(depPath);
        return totalSize;
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
                patterns.promises += (content.match(/new Promise/g) || []).length;
                patterns.asyncAwait += (content.match(/async/g) || []).length;
                patterns.callbacks += (content.match(/callback|cb\)/g) || []).length;
            }

            return patterns;
        } catch (error) {
            console.warn('Error analyzing async patterns:', error);
            return { promises: 0, asyncAwait: 0, callbacks: 0 };
        }
    }

    async collectProjectStats(projectPath) {
        const stats = {
            totalSize: 0,
            fileCount: 0,
            files: []
        };

        const processDirectory = async (dirPath) => {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory() && 
                    !entry.name.startsWith('.') && 
                    entry.name !== 'node_modules') {
                    await processDirectory(fullPath);
                } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
                    const fileStat = await fs.stat(fullPath);
                    stats.totalSize += fileStat.size;
                    stats.fileCount++;
                    stats.files.push({
                        path: fullPath,
                        size: fileStat.size
                    });
                }
            }
        };

        await processDirectory(projectPath);
        return stats;
    }

    calculateComplexity(stats) {
        // Example complexity calculation
        const averageFileSize = stats.totalSize / (stats.fileCount || 1);
        const complexityScore = Math.min(100, (averageFileSize / 1024) * 10);
        return Math.round(complexityScore);
    }

    generateDependencyRecommendations(dependencies) {
        const recommendations = [];
        
        // Check for heavy dependencies
        const heavyDeps = dependencies.filter(d => d.size > 1024 * 1024);
        if (heavyDeps.length > 0) {
            recommendations.push({
                type: 'optimization',
                severity: 'medium',
                message: `Large dependencies found: ${heavyDeps.map(d => d.name).join(', ')}. Consider alternatives or code splitting.`
            });
        }

        // Check dependency count
        if (dependencies.length > 20) {
            recommendations.push({
                type: 'maintenance',
                severity: 'low',
                message: 'High number of dependencies may impact maintainability. Consider consolidating packages.'
            });
        }

        return recommendations;
    }

    getAsyncRecommendation(patterns) {
        if (patterns.callbacks > patterns.asyncAwait) {
            return {
                type: 'modernization',
                message: 'Consider migrating callback patterns to async/await for better readability and maintenance.'
            };
        }
        return null;
    }

    async analyzeRuntimeMetrics(projectPath) {
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            const metrics = {
                eventLoopUtilization: 0,
                memoryUsage: process.memoryUsage(),
                sourceFilesCount: sourceFiles.length,
                averageFileSize: 0
            };

            let totalSize = 0;
            for (const file of sourceFiles) {
                const stats = await fs.stat(file);
                totalSize += stats.size;
            }

            metrics.averageFileSize = sourceFiles.length > 0 ? totalSize / sourceFiles.length : 0;
            return metrics;
        } catch (error) {
            logger.error(`Runtime metrics analysis failed: ${error.message}`);
            return {};
        }
    }

    calculatePerformanceScore({ bundleSize, dependencyCount, asyncRatio }) {
        let score = 100;

        // Bundle size impact (max -30 points)
        if (bundleSize > 5 * 1024 * 1024) score -= 30;
        else if (bundleSize > 1024 * 1024) score -= 15;

        // Dependency count impact (max -20 points)
        if (dependencyCount > 50) score -= 20;
        else if (dependencyCount > 20) score -= 10;

        // Async patterns impact (max -20 points)
        if (asyncRatio < 0.5) score -= 20;
        else if (asyncRatio < 1) score -= 10;

        return Math.max(0, Math.min(100, score));
    }

    async generateDetailedRecommendations(projectPath) {
        const recommendations = [];
        const logger = require('../../utils/logger');

        try {
            const metrics = await this.analyzeMetrics(projectPath);

            // Bundle size recommendations
            if (metrics.bundleSize.total > 5 * 1024 * 1024) {
                recommendations.push({
                    type: 'optimization',
                    severity: 'high',
                    category: 'bundle',
                    message: 'Bundle size is critically large',
                    details: 'Large bundle sizes significantly impact initial load times',
                    suggestion: 'Implement code splitting and lazy loading for routes',
                    impact: 'High impact on user experience and load times'
                });
            } else if (metrics.bundleSize.total > 1024 * 1024) {
                recommendations.push({
                    type: 'optimization',
                    severity: 'medium',
                    category: 'bundle',
                    message: 'Bundle size could be optimized',
                    suggestion: 'Consider implementing tree shaking and dead code elimination'
                });
            }

            // Dependencies recommendations
            if (metrics.dependencies.heavyDependencies.length > 0) {
                recommendations.push({
                    type: 'dependencies',
                    severity: 'medium',
                    category: 'dependencies',
                    message: `Found ${metrics.dependencies.heavyDependencies.length} heavy dependencies`,
                    details: `Heavy dependencies: ${metrics.dependencies.heavyDependencies.map(d => d.name).join(', ')}`,
                    suggestion: 'Consider lighter alternatives or implement code splitting'
                });
            }

            // Async patterns recommendations
            if (metrics.asyncUsage.callbacks > metrics.asyncUsage.asyncAwait) {
                recommendations.push({
                    type: 'modernization',
                    severity: 'low',
                    category: 'async',
                    message: 'High usage of callback patterns detected',
                    suggestion: 'Migrate to async/await for better readability and maintainability'
                });
            }

            // Runtime metrics recommendations
            if (metrics.runtime.eventLoopUtilization > 0.8) {
                recommendations.push({
                    type: 'performance',
                    severity: 'high',
                    category: 'runtime',
                    message: 'High event loop utilization detected',
                    suggestion: 'Consider optimizing CPU-intensive operations or using worker threads'
                });
            }

            return recommendations.sort((a, b) => 
                this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity)
            );
        } catch (error) {
            logger.error(`Error generating recommendations: ${error.message}`);
            return [];
        }
    }

    getSeverityWeight(severity) {
        const weights = { high: 3, medium: 2, low: 1 };
        return weights[severity] || 0;
    }

    calculatePerformanceScore(metrics) {
        let score = 100;

        // Bundle size impact (max -30 points)
        if (metrics.bundleSize.total > 5 * 1024 * 1024) score -= 30;
        else if (metrics.bundleSize.total > 1024 * 1024) score -= 15;

        // Dependencies impact (max -20 points)
        const heavyDepsCount = metrics.dependencies.heavyDependencies.length;
        if (heavyDepsCount > 5) score -= 20;
        else if (heavyDepsCount > 0) score -= heavyDepsCount * 4;

        // Async patterns impact (max -20 points)
        const asyncRatio = metrics.asyncUsage.asyncAwait / 
            (metrics.asyncUsage.callbacks || 1);
        if (asyncRatio < 0.5) score -= 20;
        else if (asyncRatio < 1) score -= 10;

        // Runtime metrics impact (max -30 points)
        if (metrics.runtime.eventLoopUtilization > 0.8) score -= 30;
        else if (metrics.runtime.eventLoopUtilization > 0.6) score -= 15;

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    async cleanup() {
        // Clean up resources if needed
        this.metrics = null;
    }
}

module.exports = PerformanceAnalyzerPlugin;
