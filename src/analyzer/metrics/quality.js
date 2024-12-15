const { logger } = require('../../utils/logger');

class QualityAnalyzer {
    constructor() {
        this.defaultMetrics = {
            linting: {
                hasEslint: false,
                hasPrettier: false
            },
            typescript: false,
            testing: {
                hasJest: false,
                hasMocha: false
            },
            maintainabilityIndex: 70,
            issues: []
        };
    }

    async analyzeCodeQuality(projectPath, fs) {
        if (!projectPath || typeof projectPath !== 'string') {
            logger.error('Invalid project path provided');
            return this.defaultMetrics;
        }

        if (!fs || typeof fs.readFile !== 'function' || typeof fs.access !== 'function') {
            logger.error('Invalid filesystem interface provided');
            return this.defaultMetrics;
        }

        try {
            // Validate project directory exists
            try {
                await fs.access(projectPath);
            } catch (error) {
                logger.error(`Project path is not accessible: ${error.message}`);
                return this.defaultMetrics;
            }

            const [hasEslint, hasPrettier, hasTypeScript] = await Promise.all([
                this.checkConfigFile(projectPath, '.eslintrc', fs),
                this.checkConfigFile(projectPath, '.prettierrc', fs),
                this.checkConfigFile(projectPath, 'tsconfig.json', fs)
            ]);

            const [hasJest, hasMocha] = await Promise.all([
                this.hasPackage(projectPath, 'jest', fs),
                this.hasPackage(projectPath, 'mocha', fs)
            ]);

            const maintainabilityData = await this.calculateMaintainabilityIndex(projectPath, fs);
            
            return {
                linting: { hasEslint, hasPrettier },
                typescript: hasTypeScript,
                testing: { hasJest, hasMocha },
                maintainabilityIndex: maintainabilityData.score,
                issues: maintainabilityData.issues || []
            };
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            return {
                ...this.defaultMetrics,
                issues: [{
                    type: 'error',
                    message: `Analysis failed: ${error.message}`,
                    severity: 'high'
                }]
            };
        }
    }

    async checkConfigFile(projectPath, filename, fs) {
        if (!projectPath || !filename || !fs) {
            return false;
        }

        try {
            const variations = [
                filename,
                `${filename}.json`,
                `${filename}.js`,
                `${filename}.yaml`,
                `${filename}.yml`
            ];

            for (const variant of variations) {
                try {
                    await fs.access(`${projectPath}/${variant}`);
                    return true;
                } catch {
                    continue;
                }
            }
            return false;
        } catch (error) {
            logger.warn(`Error checking config file ${filename}: ${error.message}`);
            return false;
        }
    }

    async hasPackage(projectPath, packageName, fs) {
        if (!projectPath || !packageName || !fs) {
            return false;
        }

        try {
            const packageJsonContent = await fs.readFile(`${projectPath}/package.json`, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            
            return !!(
                packageJson.dependencies?.[packageName] || 
                packageJson.devDependencies?.[packageName]
            );
        } catch (error) {
            logger.warn(`Error checking package ${packageName}: ${error.message}`);
            return false;
        }
    }

    async calculateMaintainabilityIndex(projectPath, fs) {
        if (!projectPath || !fs) {
            return { score: 70, issues: [] };
        }

        try {
            const sourceFiles = await fs.readdir(projectPath);
            let totalScore = 0;
            const issues = [];

            for (const file of sourceFiles) {
                if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;

                try {
                    const content = await fs.readFile(`${projectPath}/${file}`, 'utf-8');
                    const fileScore = this.calculateFileMaintenanceScore(content);
                    totalScore += fileScore;

                    if (fileScore < 70) {
                        issues.push({
                            type: 'maintainability',
                            message: `Low maintainability score (${fileScore.toFixed(2)})`,
                            file: file,
                            severity: fileScore < 50 ? 'high' : 'medium'
                        });
                    }
                } catch (error) {
                    logger.warn(`Error analyzing file ${file}: ${error.message}`);
                    continue;
                }
            }

            const averageScore = sourceFiles.length > 0 
                ? Math.min(100, totalScore / sourceFiles.length) 
                : 70;

            return {
                score: Math.round(averageScore * 100) / 100,
                issues
            };
        } catch (error) {
            logger.warn(`Maintainability calculation failed: ${error.message}`);
            return {
                score: 70,
                issues: [{
                    type: 'error',
                    message: `Maintainability calculation failed: ${error.message}`,
                    severity: 'medium'
                }]
            };
        }
    }

    calculateFileMaintenanceScore(content) {
        if (!content || typeof content !== 'string') {
            return 70; // Default score for invalid input
        }

        try {
            const metrics = {
                lines: content.split('\n').length,
                comments: (content.match(/\/\*[\s\S]*?\*\/|\/\/.*/g) || []).length,
                functions: (content.match(/function\s+\w+\s*\(|=>\s*{|\w+\s*:\s*function/g) || []).length,
                complexity: (content.match(/if|else|for|while|do|switch|case|catch/g) || []).length,
                declarationDensity: (content.match(/const|let|var|class|interface|type|enum/g) || []).length,
                maxLineLength: Math.max(...content.split('\n').map(line => line.length))
            };

            // Calculate base score
            let score = 100;

            // Penalize for complexity
            score -= metrics.complexity * 2;
            
            // Penalize for too many functions in a single file
            score -= Math.max(0, metrics.functions - 10) * 2;
            
            // Penalize for low comment ratio (if file is large enough)
            if (metrics.lines > 50) {
                const commentRatio = metrics.comments / metrics.lines;
                if (commentRatio < 0.1) {
                    score -= 10;
                }
            }
            
            // Penalize for extremely long lines
            if (metrics.maxLineLength > 100) {
                score -= Math.min(10, (metrics.maxLineLength - 100) / 10);
            }
            
            // Penalize for too many lines
            if (metrics.lines > 300) {
                score -= Math.min(20, (metrics.lines - 300) / 50);
            }
            
            // Add small bonus for good declaration density
            const declarationRatio = metrics.declarationDensity / metrics.lines;
            if (declarationRatio > 0.1 && declarationRatio < 0.3) {
                score += 5;
            }

            return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
        } catch (error) {
            logger.warn(`Error calculating maintenance score: ${error.message}`);
            return 70; // Default score on error
        }
    }
}

module.exports = QualityAnalyzer;