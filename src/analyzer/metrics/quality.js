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

            // Analyze test coverage
            const coverageMetrics = await this.analyzeTestCoverage(projectPath, fs);

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
        try {
            // Calculate base score
            let score = 70;
            
            // Add points for documentation
            const commentLines = (content.match(/\/\*[\s\S]*?\*\/|\/\/.*/g) || []).length;
            score += Math.min(10, commentLines * 0.5);
            
            // Add points for consistent formatting
            const indentationPattern = /^[ \t]+/gm;
            const indentations = content.match(indentationPattern) || [];
            const consistentIndentation = new Set(indentations).size <= 2;
            if (consistentIndentation) score += 5;
            
            // Deduct points for code smells
            const codeSmells = [
                /TODO|FIXME/g,
                /console\.(log|debug)/g,
                /debugger/g
            ];
            
            for (const smell of codeSmells) {
                const matches = content.match(smell) || [];
                score -= matches.length * 2;
            }
            
            return Math.max(0, Math.min(100, score));
        } catch (error) {
            logger.warn(`Error calculating maintenance score: ${error.message}`);
            return 70; // Default score on error
        }
    }

    async analyzeTestCoverage(projectPath, fs) {
        try {
            const metrics = {
                hasTestDirectory: false,
                testFiles: 0,
                coverageConfig: false,
                testFrameworks: [],
                coverageScore: 0
            };

            // Check for test directories
            const testDirs = ['__tests__', 'test', 'tests', 'spec'];
            for (const dir of testDirs) {
                try {
                    await fs.access(`${projectPath}/${dir}`);
                    metrics.hasTestDirectory = true;
                    break;
                } catch {
                    continue;
                }
            }

            // Analyze configuration files
            const configs = ['jest.config.js', '.nycrc', 'karma.conf.js'];
            for (const config of configs) {
                try {
                    await fs.access(`${projectPath}/${config}`);
                    metrics.coverageConfig = true;
                    break;
                } catch {
                    continue;
                }
            }

            // Count test files and analyze content
            const sourceFiles = await this.findTestFiles(projectPath, fs);
            metrics.testFiles = sourceFiles.length;

            let totalAssertions = 0;
            let totalDescribeBlocks = 0;

            for (const file of sourceFiles) {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    totalAssertions += (content.match(/expect\(|assert\./g) || []).length;
                    totalDescribeBlocks += (content.match(/describe\(|context\(|suite\(/g) || []).length;
                } catch (error) {
                    logger.warn(`Error reading test file ${file}: ${error.message}`);
                }
            }

            // Calculate coverage score
            metrics.coverageScore = this.calculateTestCoverageScore(
                metrics.hasTestDirectory,
                metrics.coverageConfig,
                metrics.testFiles,
                totalAssertions,
                totalDescribeBlocks
            );

            return metrics;
        } catch (error) {
            logger.warn(`Test coverage analysis failed: ${error.message}`);
            return {
                hasTestDirectory: false,
                testFiles: 0,
                coverageConfig: false,
                testFrameworks: [],
                coverageScore: 0
            };
        }
    }

    async findTestFiles(projectPath, fs) {
        const testFiles = [];
        const testPatterns = ['.test.', '.spec.', '-test.', '-spec.'];
        
        try {
            const walk = async (dir) => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                        continue;
                    }

                    const fullPath = `${dir}/${entry.name}`;
                    
                    if (entry.isDirectory()) {
                        await walk(fullPath);
                    } else if (testPatterns.some(pattern => entry.name.includes(pattern))) {
                        testFiles.push(fullPath);
                    }
                }
            };

            await walk(projectPath);
            return testFiles;
        } catch (error) {
            logger.warn(`Error finding test files: ${error.message}`);
            return [];
        }
    }

    calculateTestCoverageScore(hasTestDir, hasConfig, numFiles, assertions, describes) {
        let score = 0;
        
        // Base points for test infrastructure
        if (hasTestDir) score += 20;
        if (hasConfig) score += 20;
        
        // Points for test quantity and quality
        if (numFiles > 0) {
            score += Math.min(30, numFiles * 5); // Up to 30 points for number of test files
            
            const assertionsPerFile = assertions / numFiles;
            score += Math.min(20, assertionsPerFile * 2); // Up to 20 points for assertions density
            
            const describesPerFile = describes / numFiles;
            score += Math.min(10, describesPerFile * 2); // Up to 10 points for test organization
        }
        
        return Math.min(100, Math.round(score));
    }
}

module.exports = QualityAnalyzer;