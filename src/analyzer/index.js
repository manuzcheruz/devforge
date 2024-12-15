const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

class ProjectAnalyzer {
    constructor() {
        // Constants for file traversal
        this.ignoreDirs = new Set(['node_modules', 'coverage', 'dist', 'build', '.git']);
        this.sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
        
        // Initialize metrics storage
        this.metrics = {
            structure: {},
            dependencies: {},
            quality: {},
            complexity: {},
            performance: {},
            security: {}
        };

        // Bind all class methods
        const methods = [
            'findSourceFiles',
            'analyzeProject',
            'analyzeStructure',
            'analyzeDependencies',
            'analyzeCodeQuality',
            'analyzeComplexity',
            'analyzePerformance',
            'analyzeSecurityMetrics',
            'calculateFileMetrics',
            'calculateComplexity',
            'fileExists'
        ];
        
        methods.forEach(method => {
            if (typeof this[method] === 'function') {
                this[method] = this[method].bind(this);
            }
        });
    }

    async findSourceFiles(projectPath) {
        const sourceFiles = [];
        
        const processDirectory = async (dirPath) => {
            try {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    
                    if (entry.isDirectory()) {
                        // Skip ignored directories and dot directories
                        if (!this.ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
                            await processDirectory(fullPath);
                        }
                    } else if (entry.isFile()) {
                        // Only include files with source extensions
                        const ext = path.extname(entry.name);
                        if (this.sourceExtensions.has(ext) && 
                            !entry.name.includes('.test.') && 
                            !entry.name.includes('.spec.')) {
                            sourceFiles.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                logger.warn(`Error processing directory ${dirPath}: ${error.message}`);
            }
        };

        try {
            await processDirectory(projectPath);
            return sourceFiles;
        } catch (error) {
            logger.error(`Error finding source files: ${error.message}`);
            return [];
        }
    }

    async analyzeProject(projectPath) {
        const logger = require('../utils/logger').logger;
        
        try {
            if (!projectPath) {
                throw new Error('Project path is required');
            }

            // Reset and initialize metrics
            this.metrics = this.initializeMetrics();
            await this.validateProject(projectPath);

            logger.info('Starting project analysis...');
            const startTime = Date.now();

            // Analyze project components
            const results = await Promise.all([
                this.analyzeStructure(projectPath),
                this.analyzeDependencies(projectPath),
                this.analyzeCodeQuality(projectPath),
                this.analyzeComplexity(projectPath),
                this.analyzePerformance(projectPath),
                this.analyzeSecurityMetrics(projectPath)
            ]);

            // Map results to metrics structure
            const metrics = {
                structure: results[0],
                dependencies: results[1],
                quality: results[2],
                complexity: results[3],
                performance: results[4],
                security: results[5]
            };

            // Calculate final scores and generate report
            const analysis = {
                metrics,
                score: this.calculateProjectScore(metrics),
                timestamp: new Date().toISOString(),
                duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
                status: 'success',
                recommendations: await this.generateDetailedRecommendations(metrics)
            };

            logger.success(`Project analysis completed in ${analysis.duration}`);
            return analysis;

        } catch (error) {
            logger.error(`Project analysis failed: ${error.message}`);
            return {
                metrics: this.metrics,
                timestamp: new Date().toISOString(),
                status: 'error',
                error: error.message
            };
        }
    }

    initializeMetrics() {
        return {
            structure: {},
            dependencies: {},
            quality: {},
            complexity: {},
            performance: {},
            security: {}
        };
    }

    async validateProject(projectPath) {
        // Check if project path exists and is accessible
        const exists = await this.fileExists(projectPath);
        if (!exists) {
            throw new Error(`Project path does not exist: ${projectPath}`);
        }

        // Verify project structure
        const isValidProject = await this.validateProjectStructure(projectPath);
        if (!isValidProject.valid) {
            throw new Error(`Invalid project structure: ${isValidProject.reason}`);
        }
    }

    async runAnalysisTasks(projectPath) {
        // Run all analysis in parallel for better performance
        const tasks = [
            { name: 'structure', task: () => this.analyzeStructure(projectPath) },
            { name: 'dependencies', task: () => this.analyzeDependencies(projectPath) },
            { name: 'quality', task: () => this.analyzeCodeQuality(projectPath) },
            { name: 'complexity', task: () => this.analyzeComplexity(projectPath) },
            { name: 'performance', task: () => this.analyzePerformance(projectPath) },
            { name: 'security', task: () => this.analyzeSecurityMetrics(projectPath) }
        ];

        const results = await Promise.allSettled(tasks.map(t => t.task()));
        return tasks.reduce((acc, task, index) => {
            acc[task.name] = results[index];
            return acc;
        }, {});
    }

    aggregateResults(results) {
        return Object.entries(results).reduce((metrics, [key, result]) => {
            metrics[key] = this.processAnalysisResult(result, key);
            return metrics;
        }, {});
    }

    calculateProjectScore(metrics) {
        const weights = {
            quality: 0.3,
            complexity: 0.2,
            security: 0.2,
            performance: 0.15,
            dependencies: 0.1,
            structure: 0.05
        };

        let totalScore = 0;
        let totalWeight = 0;

        for (const [metric, weight] of Object.entries(weights)) {
            if (metrics[metric] && typeof metrics[metric].score === 'number') {
                totalScore += metrics[metric].score * weight;
                totalWeight += weight;
            }
        }

        return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    }

    generateRecommendations(metrics) {
        const recommendations = [];

        // Quality recommendations
        if (metrics.quality && metrics.quality.maintainabilityIndex < 70) {
            recommendations.push({
                category: 'quality',
                severity: 'high',
                message: 'Code maintainability needs improvement',
                details: 'Consider refactoring complex functions and improving documentation'
            });
        }

        // Security recommendations
        if (metrics.security && !metrics.security.hasPackageLock) {
            recommendations.push({
                category: 'security',
                severity: 'medium',
                message: 'Missing package-lock.json',
                details: 'Add package lock file to ensure dependency consistency'
            });
        }

        // Performance recommendations
        if (metrics.performance && metrics.performance.bundleSize > 1024 * 1024) {
            recommendations.push({
                category: 'performance',
                severity: 'medium',
                message: 'Large bundle size detected',
                details: 'Consider implementing code splitting and lazy loading'
            });
        }

        return recommendations.sort((a, b) => 
            this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity)
        );
    }

    getSeverityWeight(severity) {
        return { high: 3, medium: 2, low: 1 }[severity] || 0;
    }

    async validateProjectStructure(projectPath) {
        try {
            const packageJsonExists = await this.fileExists(path.join(projectPath, 'package.json'));
            if (!packageJsonExists) {
                return { valid: false, reason: 'Missing package.json file' };
            }

            const sourceFiles = await this.findSourceFiles(projectPath);
            if (sourceFiles.length === 0) {
                return { valid: false, reason: 'No source files found' };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, reason: error.message };
        }
    }

    processAnalysisResult(result, metricType) {
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            logger.error(`Error in ${metricType} analysis: ${result.reason}`);
            return {
                error: result.reason.message,
                status: 'error'
            };
        }
    }

    async analyzeStructure(projectPath) {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            
            // Basic structure checks
            const [hasPackageJson, hasReadme] = await Promise.all([
                this.fileExists(path.join(projectPath, 'package.json')),
                this.fileExists(path.join(projectPath, 'README.md'))
            ]);

            // Find source files
            const sourceFiles = await this.findSourceFiles(projectPath);
            
            // Analyze package.json if it exists
            let packageInfo = {};
            if (hasPackageJson) {
                try {
                    const packageData = JSON.parse(
                        await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8')
                    );
                    packageInfo = {
                        name: packageData.name,
                        version: packageData.version,
                        hasScripts: Boolean(packageData.scripts && Object.keys(packageData.scripts).length > 0),
                        hasDevDependencies: Boolean(packageData.devDependencies && Object.keys(packageData.devDependencies).length > 0)
                    };
                } catch (e) {
                    logger.warn(`Error parsing package.json: ${e.message}`);
                }
            }

            return {
                hasPackageJson,
                hasReadme,
                sourceFiles: sourceFiles.map(file => path.relative(projectPath, file)),
                packageInfo,
                fileCount: sourceFiles.length
            };
        } catch (error) {
            logger.error(`Structure analysis failed: ${error.message}`);
            return {
                hasPackageJson: false,
                hasReadme: false,
                sourceFiles: [],
                packageInfo: {},
                fileCount: 0,
                error: error.message
            };
        }
    }

    async analyzeDependencies(projectPath) {
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageData = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
            
            return {
                production: Object.keys(packageData.dependencies || {}),
                development: Object.keys(packageData.devDependencies || {})
            };
        } catch (error) {
            logger.error(`Dependencies analysis failed: ${error.message}`);
            return { production: [], development: [] };
        }
    }

    async analyzeCodeQuality(projectPath) {
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            const issues = [];
            let totalMaintainability = 0;
            
            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const fileMetrics = this.calculateFileMetrics(content);
                totalMaintainability += fileMetrics.maintainability;
                
                if (fileMetrics.issues.length > 0) {
                    issues.push(...fileMetrics.issues.map(issue => ({
                        ...issue,
                        file: path.relative(projectPath, file)
                    })));
                }
            }
            
            return {
                maintainabilityIndex: sourceFiles.length > 0 ? 
                    totalMaintainability / sourceFiles.length : 0,
                issues
            };
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            return { maintainabilityIndex: 0, issues: [] };
        }
    }

    calculateFileMetrics(content) {
        const metrics = {
            maintainability: 0,
            issues: [],
            details: {
                linesOfCode: 0,
                commentLines: 0,
                codeLines: 0,
                emptyLines: 0,
                complexity: 0,
                functionCount: 0
            }
        };
        
        try {
            // Enhanced metrics calculation
            const lines = content.split('\n');
            metrics.details.linesOfCode = lines.length;
            
            // Count different types of lines
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (!trimmedLine) {
                    metrics.details.emptyLines++;
                } else if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.endsWith('*/')) {
                    metrics.details.commentLines++;
                } else {
                    metrics.details.codeLines++;
                }
                
                // Count function declarations
                if (trimmedLine.match(/function\s+\w+\s*\(|=>|class\s+\w+/)) {
                    metrics.details.functionCount++;
                }
            });
            
            // Calculate complexity
            metrics.details.complexity = this.calculateComplexity(content);
            
            // Enhanced maintainability calculation using multiple factors
            const commentRatio = metrics.details.commentLines / metrics.details.codeLines;
            const sizeScore = Math.max(0, 100 - (metrics.details.codeLines / 500 * 20));
            const complexityScore = Math.max(0, 100 - (metrics.details.complexity / 10 * 20));
            const documentationScore = Math.min(100, commentRatio * 200);
            
            metrics.maintainability = Math.round(
                (sizeScore * 0.4) + (complexityScore * 0.4) + (documentationScore * 0.2)
            );
            
            // Enhanced issue detection
            this.detectIssues(metrics);
            
            return metrics;
        } catch (error) {
            logger.error(`Error calculating file metrics: ${error.message}`);
            return {
                maintainability: 0,
                issues: [{
                    type: 'error',
                    message: 'Failed to analyze file metrics'
                }],
                details: {
                    linesOfCode: 0,
                    commentLines: 0,
                    codeLines: 0,
                    emptyLines: 0,
                    complexity: 0,
                    functionCount: 0
                }
            };
        }
    }
    
    detectIssues(metrics) {
        const { details } = metrics;
        
        // File size issues
        if (details.codeLines > 300) {
            metrics.issues.push({
                type: 'complexity',
                severity: 'warning',
                message: 'File exceeds recommended size of 300 lines',
                recommendation: 'Consider splitting the file into smaller modules'
            });
        }
        
        // Documentation issues
        const commentRatio = details.commentLines / details.codeLines;
        if (commentRatio < 0.1) {
            metrics.issues.push({
                type: 'documentation',
                severity: 'info',
                message: 'Low comment ratio detected',
                recommendation: 'Consider adding more documentation to improve code maintainability'
            });
        }
        
        // Complexity issues
        if (details.complexity > 15) {
            metrics.issues.push({
                type: 'complexity',
                severity: 'error',
                message: 'High cyclomatic complexity detected',
                recommendation: 'Refactor complex logic into smaller, more manageable functions'
            });
        }
        
        // Function count issues
        if (details.functionCount > 10) {
            metrics.issues.push({
                type: 'structure',
                severity: 'warning',
                message: 'High number of functions in a single file',
                recommendation: 'Consider splitting functionality across multiple files'
            });
        }
        
        // Empty lines ratio check
        const emptyLineRatio = details.emptyLines / details.linesOfCode;
        if (emptyLineRatio < 0.1) {
            metrics.issues.push({
                type: 'readability',
                severity: 'info',
                message: 'Low number of empty lines',
                recommendation: 'Add more whitespace to improve code readability'
            });
        }
    }

    async analyzeComplexity(projectPath) {
        const logger = require('../utils/logger').logger;
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            const complexityMetrics = await Promise.all(sourceFiles.map(async (file) => {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    const metrics = this.calculateComplexityMetrics(content);
                    return {
                        file: path.relative(projectPath, file),
                        ...metrics,
                        severity: this.determineComplexitySeverity(metrics.total)
                    };
                } catch (error) {
                    logger.warn(`Failed to analyze complexity for ${file}: ${error.message}`);
                    return null;
                }
            }));

            // Filter out failed analyses and calculate aggregates
            const validMetrics = complexityMetrics.filter(m => m !== null);
            const totalFiles = validMetrics.length;

            if (totalFiles === 0) {
                return {
                    average: 0,
                    highest: 0,
                    metrics: [],
                    score: 100
                };
            }

            const aggregates = validMetrics.reduce((acc, curr) => ({
                totalComplexity: acc.totalComplexity + curr.total,
                highest: Math.max(acc.highest, curr.total),
                functionCount: acc.functionCount + curr.functions,
                classCount: acc.classCount + curr.classes,
                nestingCount: acc.nestingCount + curr.nesting
            }), { totalComplexity: 0, highest: 0, functionCount: 0, classCount: 0, nestingCount: 0 });

            return {
                average: aggregates.totalComplexity / totalFiles,
                highest: aggregates.highest,
                metrics: validMetrics,
                score: this.calculateComplexityScore({
                    average: aggregates.totalComplexity / totalFiles,
                    highest: aggregates.highest,
                    functionCount: aggregates.functionCount,
                    classCount: aggregates.classCount,
                    nestingCount: aggregates.nestingCount,
                    fileCount: totalFiles
                })
            };
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            return {
                average: 0,
                highest: 0,
                metrics: [],
                score: 0,
                error: error.message
            };
        }
    }

calculateComplexityMetrics(content) {
        return {
            total: this.calculateComplexity(content),
            functions: this.calculateFunctionComplexity(content),
            classes: this.calculateClassComplexity(content),
            nesting: this.calculateNestingComplexity(content),
            controlFlow: this.calculateControlFlowComplexity(content)
        };
    }

determineComplexitySeverity(complexity) {
        if (complexity > 20) return 'high';
        if (complexity > 10) return 'medium';
        return 'low';
    }

calculateComplexityScore({ average, highest, functionCount, classCount, nestingCount, fileCount }) {
        let score = 100;
        
        // Penalize high average complexity
        if (average > 15) score -= 30;
        else if (average > 10) score -= 20;
        else if (average > 5) score -= 10;
        
        // Penalize extremely high complexity in any file
        if (highest > 30) score -= 20;
        else if (highest > 20) score -= 10;
        
        // Penalize high nesting levels
        const avgNesting = nestingCount / fileCount;
        if (avgNesting > 5) score -= 20;
        else if (avgNesting > 3) score -= 10;
        
        // Penalize high function/class density
        const density = (functionCount + classCount) / fileCount;
        if (density > 10) score -= 20;
        else if (density > 5) score -= 10;
        
        return Math.max(0, Math.min(100, score));
    }

    calculateComplexity(content) {
        const logger = require('../utils/logger').logger;
        
        if (!content || typeof content !== 'string') {
            logger.warn('Invalid content provided for complexity calculation');
            return 1;
        }

        try {
            // Calculate individual complexity metrics with weights
            const weights = {
                controlFlow: 1.0,  // Base weight for control flow
                nesting: 2.0,      // Higher weight for nesting (most important)
                functions: 1.5,    // Medium weight for function complexity
                classes: 1.0       // Base weight for class complexity
            };

            const metrics = {
                controlFlow: this.calculateControlFlowComplexity(content) * weights.controlFlow,
                nesting: this.calculateNestingComplexity(content) * weights.nesting,
                functions: this.calculateFunctionComplexity(content) * weights.functions,
                classes: this.calculateClassComplexity(content) * weights.classes
            };

            // Calculate total complexity
            const totalComplexity = Object.values(metrics).reduce((sum, value) => sum + value, 1);
            
            // Normalize to 1-100 scale using logarithmic scaling
            // This provides better distribution of scores
            const normalizedComplexity = Math.min(100, Math.max(1, Math.round(
                20 * Math.log2(1 + totalComplexity)
            )));

            logger.debug(`Complexity calculation results: ${JSON.stringify({
                raw: metrics,
                normalized: normalizedComplexity
            })}`);

            return normalizedComplexity;
        } catch (error) {
            logger.error(`Error in complexity calculation: ${error.message}`);
            return 1; // Return base complexity on error
        }
    }

    calculateControlFlowComplexity(content) {
        if (!content || typeof content !== 'string') {
            return 0;
        }

        const logger = require('../utils/logger').logger;
        const controlFlowPatterns = {
            conditions: {
                pattern: /\b(if|else\s+if|switch)\s*\([^)]*\)/g,
                weight: 1
            },
            loops: {
                pattern: /\b(for|while|do)\s*\([^)]*\)/g,
                weight: 2
            },
            tryCatch: {
                pattern: /\b(try|catch|finally)\s*\{/g,
                weight: 1
            },
            ternary: {
                pattern: /\?[^:]+:/g,
                weight: 0.5
            },
            logicalOperators: {
                pattern: /(?:&&|\|\|)(?!\|)(?!&)/g,
                weight: 0.3
            }
        };

        try {
            let complexity = 0;
            // Remove comments and strings to avoid false positives
            const cleanContent = content
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
                .replace(/\/\/.*/g, '')           // Remove single-line comments
                .replace(/'([^'\\]|\\.)*'/g, '')  // Remove single-quoted strings
                .replace(/"([^"\\]|\\.)*"/g, '')  // Remove double-quoted strings
                .replace(/`([^`\\]|\\.)*`/g, ''); // Remove template literals

            for (const [type, { pattern, weight }] of Object.entries(controlFlowPatterns)) {
                const matches = cleanContent.match(pattern) || [];
                complexity += matches.length * weight;
            }

            logger.debug(`Control flow complexity: ${complexity}`);
            return complexity;
        } catch (error) {
            logger.warn(`Error in control flow analysis: ${error.message}`);
            return 0;
        }
    }

    calculateNestingComplexity(content) {
        try {
            const lines = content.split('\n');
            let currentNesting = 0;
            let maxNesting = 0;

            for (const line of lines) {
                // Count braces considering escaped characters and string contents
                const openBraces = (line.match(/(?<!\\)\{/g) || []).length;
                const closeBraces = (line.match(/(?<!\\)\}/g) || []).length;
                
                currentNesting += openBraces - closeBraces;
                maxNesting = Math.max(maxNesting, currentNesting);
            }

            return maxNesting;
        } catch (error) {
            this.logger.warn(`Error in nesting analysis: ${error.message}`);
            return 0;
        }
    }

    calculateFunctionComplexity(content) {
        const functionPatterns = {
            traditional: /\bfunction\s+[\w$]+\s*\([^)]*\)/g,
            arrow: /(?:^|\s)(\([^)]*\)|[\w$]+)\s*=>\s*(?:\{|\S)/gm,
            method: /(?:^|\s)[\w$]+\s*\([^)]*\)\s*\{/gm
        };

        try {
            let complexity = 0;
            for (const [type, pattern] of Object.entries(functionPatterns)) {
                const matches = content.match(pattern) || [];
                complexity += matches.length;
            }
            return complexity;
        } catch (error) {
            this.logger.warn(`Error in function analysis: ${error.message}`);
            return 0;
        }
    }

    calculateClassComplexity(content) {
        const classPatterns = {
            declaration: /\bclass\s+[\w$]+/g,
            methods: /(?:static\s+)?(?:async\s+)?[\w$]+\s*\([^)]*\)\s*\{/g,
            accessors: /\b(?:get|set)\s+[\w$]+\s*\(/g,
            properties: /\b(?:static\s+)?[\w$]+\s*=/g
        };

        try {
            let complexity = 0;
            for (const [type, pattern] of Object.entries(classPatterns)) {
                const matches = content.match(pattern) || [];
                complexity += matches.length;
            }
            return complexity;
        } catch (error) {
            this.logger.warn(`Error in class analysis: ${error.message}`);
            return 0;
        }
    }

    async analyzePerformance(projectPath) {
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalSize = 0;
            let promises = 0;
            let asyncAwait = 0;
            
            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                totalSize += Buffer.from(content).length;
                promises += (content.match(/new Promise/g) || []).length;
                asyncAwait += (content.match(/async/g) || []).length;
            }
            
            return {
                bundleSize: totalSize,
                asyncPatterns: {
                    promises,
                    asyncAwait
                }
            };
        } catch (error) {
            logger.error(`Performance analysis failed: ${error.message}`);
            return {
                bundleSize: 0,
                asyncPatterns: { promises: 0, asyncAwait: 0 }
            };
        }
    }

    async analyzeSecurityMetrics(projectPath) {
        try {
            return {
                hasPackageLock: await this.fileExists(path.join(projectPath, 'package-lock.json')),
                hasEnvExample: await this.fileExists(path.join(projectPath, '.env.example'))
            };
        } catch (error) {
            logger.error(`Security analysis failed: ${error.message}`);
            return { hasPackageLock: false, hasEnvExample: false };
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = { ProjectAnalyzer };