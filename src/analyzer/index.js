const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class ProjectAnalyzer {
    constructor() {
        // Constants for file traversal
        this.ignoreDirs = new Set(['node_modules', 'coverage', 'dist', 'build', '.git']);
        this.sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
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
        try {
            const analysis = {
                metrics: {
                    structure: await this.analyzeStructure(projectPath),
                    dependencies: await this.analyzeDependencies(projectPath),
                    quality: await this.analyzeCodeQuality(projectPath),
                    complexity: await this.analyzeComplexity(projectPath),
                    performance: await this.analyzePerformance(projectPath),
                    security: await this.analyzeSecurityMetrics(projectPath)
                }
            };
            return analysis;
        } catch (error) {
            logger.error(`Project analysis failed: ${error.message}`);
            throw error;
        }
    }

    async analyzeStructure(projectPath) {
        try {
            const hasPackageJson = await this.fileExists(path.join(projectPath, 'package.json'));
            const hasReadme = await this.fileExists(path.join(projectPath, 'README.md'));
            
            return {
                hasPackageJson,
                hasReadme
            };
        } catch (error) {
            logger.error(`Structure analysis failed: ${error.message}`);
            return { hasPackageJson: false, hasReadme: false };
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
            issues: []
        };
        
        // Simple metrics calculation
        const lines = content.split('\n');
        const loc = lines.length;
        const commentLines = lines.filter(line => line.trim().startsWith('//')).length;
        const codeLines = loc - commentLines;
        
        // Basic maintainability calculation
        metrics.maintainability = Math.max(0, Math.min(100, 
            100 - (codeLines / 1000 * 20) + (commentLines / codeLines * 40)
        ));
        
        // Basic issue detection
        if (codeLines > 300) {
            metrics.issues.push({
                type: 'complexity',
                message: 'File exceeds recommended size of 300 lines'
            });
        }
        
        if (commentLines / codeLines < 0.1) {
            metrics.issues.push({
                type: 'documentation',
                message: 'Low comment ratio, consider adding more documentation'
            });
        }
        
        return metrics;
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
        // Simple cyclomatic complexity calculation
        const controlFlowKeywords = [
            'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch', '&&', '||'
        ];
        
        let complexity = 1; // Base complexity
        for (const keyword of controlFlowKeywords) {
            const matches = content.match(new RegExp(`\\b${keyword}\\b`, 'g'));
            if (matches) {
                complexity += matches.length;
            }
        }
        
        return complexity;
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

module.exports = new ProjectAnalyzer();