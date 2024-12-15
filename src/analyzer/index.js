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
        if (!projectPath) {
            throw new Error('Project path is required');
        }

        try {
            // Reset metrics
            this.metrics = {
                structure: {},
                dependencies: {},
                quality: {},
                complexity: {},
                performance: {},
                security: {}
            };

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

            logger.info('Starting project analysis...');
            const startTime = Date.now();

            // Run all analysis in parallel for better performance
            const [
                structure,
                dependencies,
                quality,
                complexity,
                performance,
                security
            ] = await Promise.allSettled([
                this.analyzeStructure(projectPath),
                this.analyzeDependencies(projectPath),
                this.analyzeCodeQuality(projectPath),
                this.analyzeComplexity(projectPath),
                this.analyzePerformance(projectPath),
                this.analyzeSecurityMetrics(projectPath)
            ]);

            // Process results and handle errors
            const metrics = {
                structure: this.processAnalysisResult(structure, 'structure'),
                dependencies: this.processAnalysisResult(dependencies, 'dependencies'),
                quality: this.processAnalysisResult(quality, 'quality'),
                complexity: this.processAnalysisResult(complexity, 'complexity'),
                performance: this.processAnalysisResult(performance, 'performance'),
                security: this.processAnalysisResult(security, 'security')
            };

            // Store results in metrics
            this.metrics = metrics;

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.success(`Project analysis completed in ${duration}s`);

            return {
                metrics,
                timestamp: new Date().toISOString(),
                duration: `${duration}s`,
                status: 'success'
            };
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
        try {
            const sourceFiles = await this.findSourceFiles(projectPath);
            let totalComplexity = 0;
            let highestComplexity = 0;
            
            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const complexity = this.calculateComplexity(content);
                totalComplexity += complexity;
                highestComplexity = Math.max(highestComplexity, complexity);
            }
            
            return {
                average: sourceFiles.length > 0 ? totalComplexity / sourceFiles.length : 0,
                highest: highestComplexity
            };
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            return { average: 0, highest: 0 };
        }
    }

    calculateComplexity(content) {
        try {
            let complexity = 1; // Base complexity
            const metrics = {
                controlFlow: 0,
                nesting: 0,
                functionComplexity: 0
            };

            // Control flow complexity
            const controlFlowKeywords = [
                'if', 'else', 'for', 'while', 'do', 'switch', 'case', 
                'catch', '&&', '||', '?', 'return', 'break', 'continue'
            ];
            
            for (const keyword of controlFlowKeywords) {
                const matches = content.match(new RegExp(`\\b${keyword}\\b`, 'g'));
                if (matches) {
                    metrics.controlFlow += matches.length;
                    complexity += matches.length;
                }
            }

            // Nesting complexity
            const lines = content.split('\n');
            let currentNesting = 0;
            let maxNesting = 0;
            
            for (const line of lines) {
                const openBraces = (line.match(/{/g) || []).length;
                const closeBraces = (line.match(/}/g) || []).length;
                
                currentNesting += openBraces - closeBraces;
                maxNesting = Math.max(maxNesting, currentNesting);
            }
            
            metrics.nesting = maxNesting;
            complexity += maxNesting * 2; // Nesting levels contribute more to complexity

            // Function complexity
            const functionMatches = content.match(/function\s+\w+\s*\(|\)\s*=>\s*{/g);
            if (functionMatches) {
                metrics.functionComplexity = functionMatches.length;
                complexity += functionMatches.length;
            }

            // Add complexity for class declarations and methods
            const classMatches = content.match(/class\s+\w+|static\s+\w+|get\s+\w+|set\s+\w+/g);
            if (classMatches) {
                complexity += classMatches.length;
            }

            return Math.min(100, complexity); // Cap complexity at 100
        } catch (error) {
            logger.error(`Error calculating complexity: ${error.message}`);
            return 1; // Return base complexity on error
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