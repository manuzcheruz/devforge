const path = require('path');
const { logger } = require('../../utils/logger');

class QualityAnalyzer {
    async analyzeCodeQuality(projectPath, fs) {
        if (!fs) {
            logger.warn('FileSystem (fs) parameter is required for analyzeCodeQuality');
            return this.getDefaultQualityMetrics();
        }

        try {
            // Initialize metrics with default values
            const metrics = this.getDefaultQualityMetrics();

            // Analyze documentation with proper error handling
            try {
                const docAnalysis = await this.analyzeDocumentation(projectPath, fs);
                metrics.documentation = {
                    ...metrics.documentation,
                    ...docAnalysis
                };
            } catch (error) {
                logger.warn(`Documentation analysis failed: ${error.message}`);
                // Keep default documentation metrics
            }

            logger.info('Documentation analysis completed');

            // Analyze linting configuration
            const [hasEslint, hasPrettier] = await Promise.all([
                fs.access(path.join(projectPath, '.eslintrc')).then(() => true).catch(() => false),
                fs.access(path.join(projectPath, '.prettierrc')).then(() => true).catch(() => false)
            ]);
            metrics.linting = { hasEslint, hasPrettier };

            // Analyze testing setup
            const [hasJest, hasMocha] = await Promise.all([
                this.hasPackage(projectPath, fs, 'jest'),
                this.hasPackage(projectPath, fs, 'mocha')
            ]);
            metrics.testing = { hasJest, hasMocha };

            // Calculate maintainability metrics
            const sourceFiles = await this.findSourceFiles(projectPath, fs);
            let totalMaintainability = 0;
            let fileCount = 0;

            for (const file of sourceFiles) {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    const fileAnalysis = {
                        file: path.relative(projectPath, file),
                        issues: [],
                        metrics: {},
                        maintainabilityScore: 70 // Default score
                    };

                    // Calculate file-specific maintainability
                    const complexity = this.calculateComplexity(content);
                    const linesOfCode = content.split('\n').length;
                    const commentLines = (content.match(/\/\*[\s\S]*?\*\/|\/\/.*/g) || []).length;
                    
                    // Maintainability formula based on complexity and documentation
                    const maintainabilityScore = Math.max(0, Math.min(100,
                        100 - (complexity * 2) + // Lower score for higher complexity
                        (commentLines / linesOfCode * 20) + // Bonus for documentation
                        (hasEslint ? 5 : 0) + // Bonus for having linting
                        (hasPrettier ? 5 : 0) // Bonus for having formatting
                    ));

                    fileAnalysis.maintainabilityScore = maintainabilityScore;
                    totalMaintainability += maintainabilityScore;
                    fileCount++;

                    // Detect code quality issues
                    const issues = this.detectCodeIssues(content);
                    if (issues.length > 0) {
                        fileAnalysis.issues = issues;
                        metrics.issues.push(...issues.map(issue => ({
                            file: fileAnalysis.file,
                            type: issue.type,
                            message: issue.message,
                            line: issue.line
                        })));
                    }

                    metrics.fileAnalyses.push(fileAnalysis);
                } catch (error) {
                    logger.warn(`Error analyzing file ${file}: ${error.message}`);
                }
            }

            // Calculate final maintainability index
            metrics.maintainabilityIndex = fileCount > 0
                ? Math.round(totalMaintainability / fileCount)
                : 70; // Default if no files analyzed

            return metrics;
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            throw error;
        }
    }


    async hasPackage(projectPath, fs, packageName) {
        if (!fs) {
            throw new Error('FileSystem (fs) parameter is required for hasPackage');
        }
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
            return !!(packageJson.dependencies?.[packageName] || packageJson.devDependencies?.[packageName]);
        } catch (error) {
            logger.warn(`Error checking package ${packageName}: ${error.message}`);
            return false;
        }
    }

    async getProjectContent(projectPath, fs) {
        if (!fs) {
            throw new Error('FileSystem (fs) parameter is required for getProjectContent');
        }
        try {
            let content = '';
            const sourceFiles = await this.findSourceFiles(projectPath, fs);
            for (const file of sourceFiles) {
                content += await fs.readFile(file, 'utf-8') + '\n';
            }
            return content;
        } catch (error) {
            logger.error(`Error getting project content: ${error.message}`);
            throw error;
        }
    }

    async calculateMaintenanceScore(content) {
        if (!content || typeof content !== 'string') {
            return 70; // Default maintainability score for invalid input
        }

        try {
            const metrics = {
                lineCount: Math.max(1, content.split('\n').length),
                commentRatio: this.calculateCommentRatio(content) || 0,
                complexity: Math.max(1, this.calculateComplexity(content)),
                duplicateLines: Math.min(this.calculateDuplicateLines(content), content.split('\n').length),
                functionLength: Math.max(1, this.calculateAverageFunctionLength(content))
            };

            // Calculate maintainability index using weighted factors
            const weights = {
                complexity: 0.25,    // Higher complexity reduces maintainability
                comments: 0.15,      // More comments improve maintainability
                size: 0.20,         // Larger files are harder to maintain
                duplication: 0.25,   // Code duplication reduces maintainability
                functions: 0.15      // Long functions are harder to maintain
            };

            // Calculate individual scores (0-100 scale)
            const scores = {
                complexity: Math.max(0, 100 - (metrics.complexity * 5)),
                comments: metrics.commentRatio * 100,
                size: Math.max(0, 100 - (Math.log(metrics.lineCount) * 10)),
                duplication: Math.max(0, 100 - (metrics.duplicateLines / metrics.lineCount * 100)),
                functions: Math.max(0, 100 - (Math.log(metrics.functionLength) * 15))
            };

            // Calculate weighted average
            const weightedScore = Object.entries(weights).reduce((total, [key, weight]) => {
                return total + (scores[key] * weight);
            }, 0);

            // Ensure the final score is between 0 and 100
            return Math.max(0, Math.min(100, Math.round(weightedScore)));
        } catch (error) {
            logger.warn(`Error calculating maintenance score: ${error.message}`);
            return 70; // Default score on error
        }
    }

    calculateDuplicateLines(content) {
        const lines = content.split('\n').map(line => line.trim());
        const lineFrequency = new Map();
        let duplicateCount = 0;

        lines.forEach(line => {
            if (line.length > 0) {
                const count = (lineFrequency.get(line) || 0) + 1;
                lineFrequency.set(line, count);
                if (count > 1) duplicateCount++;
            }
        });

        return duplicateCount;
    }

    calculateAverageFunctionLength(content) {
        const functionMatches = content.match(/function\s+\w+\s*\([^)]*\)\s*{[^}]*}|const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*{[^}]*}/g) || [];
        if (functionMatches.length === 0) return 0;

        const totalLength = functionMatches.reduce((sum, func) => {
            return sum + func.split('\n').length;
        }, 0);

        return Math.round(totalLength / functionMatches.length);
    }

    calculateCommentRatio(content) {
        const lines = content.split('\n');
        const commentLines = lines.filter(line =>
            line.trim().startsWith('//') ||
            line.trim().startsWith('/*') ||
            line.trim().startsWith('*')
        ).length;

        return commentLines / lines.length;
    }

    calculateComplexity(content) {
        if (!content || typeof content !== 'string') {
            logger.warn('Invalid content provided for complexity calculation');
            return 1;
        }

        const complexityFactors = {
            controlFlow: {
                patterns: [
                    /if\s*\([^)]*\)/g,           // if statements with conditions
                    /else\s+if\s*\([^)]*\)/g,    // else if statements
                    /for\s*\([^)]*\)/g,          // for loops
                    /while\s*\([^)]*\)/g,        // while loops
                    /do\s*{/g,                   // do-while loops
                    /switch\s*\([^)]*\)/g,       // switch statements
                    /case\s+[^:]+:/g,            // case statements
                    /catch\s*\([^)]*\)/g,        // catch blocks
                    /try\s*{/g,                  // try blocks
                    /throw\s+new/g               // throw statements
                ],
                weight: 2.0  // Highest weight for control flow
            },
            logicalOperators: {
                patterns: [
                    /&&|\|\|/g,                  // Logical AND/OR
                    /\?\?/g,                     // Nullish coalescing
                    /\?\./g                      // Optional chaining
                ],
                weight: 1.0
            },
            ternary: {
                patterns: [/\?[^:]+:/g],         // Ternary operations
                weight: 0.75
            },
            functions: {
                patterns: [
                    /function\s+\w+\s*\([^)]*\)\s*{/g,  // Named functions
                    /\w+\s*:\s*function\s*\([^)]*\)\s*{/g, // Object methods
                    /=>\s*{/g,                           // Arrow functions
                    /class\s+\w+/g,                      // Class declarations
                    /constructor\s*\([^)]*\)/g,          // Class constructors
                    /get\s+\w+\s*\(\)/g,                 // Getters
                    /set\s+\w+\s*\([^)]*\)/g            // Setters
                ],
                weight: 1.5
            },
            nesting: {
                patterns: [
                    /{[^}]*{/g,                  // Nested blocks
                    /\([^)]*\([^)]*\)/g          // Nested parentheses
                ],
                weight: 1.0
            },
            asyncPatterns: {
                patterns: [
                    /async\s+function/g,         // Async functions
                    /await\s+/g,                 // Await expressions
                    /\.then\s*\(/g,              // Promise chains
                    /\.catch\s*\(/g,             // Error handling
                    /Promise\.(all|race|any)\(/g, // Promise combinators
                    /new\s+Promise\s*\(/g        // Promise constructor
                ],
                weight: 1.25
            },
            errorHandling: {
                patterns: [
                    /try\s*{[^}]*}\s*catch/g,    // Complete try-catch blocks
                    /\.catch\s*\([^)]*\)/g,      // Promise catch handlers
                    /process\.on\s*\(['"](error|uncaughtException)['"]/g // Process error handlers
                ],
                weight: 1.0
            }
        };

        try {
            let totalComplexity = 1; // Base complexity
            const metrics = {
                controlFlowCount: 0,
                logicalOperatorsCount: 0,
                ternaryCount: 0,
                functionsCount: 0,
                nestingDepth: 0,
                callbacksCount: 0
            };

            // Calculate complexity metrics
            for (const [factorName, factor] of Object.entries(complexityFactors)) {
                const matchCount = factor.patterns.reduce((count, pattern) => {
                    const matches = content.match(pattern) || [];
                    return count + matches.length;
                }, 0);
                
                totalComplexity += matchCount * factor.weight;
                metrics[`${factorName}Count`] = matchCount;
            }

            // Calculate nesting depth
            const lines = content.split('\n');
            let maxDepth = 0;
            let currentDepth = 0;

            for (const line of lines) {
                const openBraces = (line.match(/{/g) || []).length;
                const closeBraces = (line.match(/}/g) || []).length;
                currentDepth += openBraces - closeBraces;
                maxDepth = Math.max(maxDepth, currentDepth);
            }

            // Add nesting depth to complexity
            totalComplexity += Math.max(0, maxDepth - 2) * 0.2; // Penalize deep nesting

            // Round to 1 decimal place and ensure minimum complexity of 1
            return Math.max(1, Math.round(totalComplexity * 10) / 10);
        } catch (error) {
            logger.error(`Error calculating complexity: ${error.message}`);
            return 1;
        }
    }

    detectCodeIssues(content) {
        if (!content || typeof content !== 'string') {
            return [];
        }

        const issues = [];
        const lines = content.split('\n');
        
        // Check line length
        const MAX_LINE_LENGTH = 100;
        lines.forEach((line, index) => {
            if (line.length > MAX_LINE_LENGTH) {
                issues.push({
                    type: 'line-length',
                    message: `Line ${index + 1} exceeds ${MAX_LINE_LENGTH} characters`,
                    line: index + 1,
                    severity: 'warning',
                    details: {
                        length: line.length,
                        limit: MAX_LINE_LENGTH
                    }
                });
            }
        });

        // Check for console statements in production code
        const consoleRegex = /console\.(log|warn|error|info|debug)/g;
        let match;
        while ((match = consoleRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            issues.push({
                type: 'console-usage',
                message: `Unexpected console.${match[1]} statement found`,
                line: lineNumber,
                severity: 'warning',
                details: {
                    statement: match[0]
                }
            });
        }

        // Check for TODO comments
        const todoRegex = /\/\/\s*TODO:\s*(.+)$/gmi;
        while ((match = todoRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            issues.push({
                type: 'todo',
                message: `TODO comment: "${match[1]?.trim() || 'No description'}"`,
                line: lineNumber,
                severity: 'info',
                details: {
                    comment: match[0]
                }
            });
        }

        // Check for empty catch blocks
        const emptyCatchRegex = /catch\s*\([^)]*\)\s*{\s*}/g;
        while ((match = emptyCatchRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            issues.push({
                type: 'empty-catch',
                message: 'Empty catch block detected - error handling required',
                line: lineNumber,
                severity: 'error',
                details: {
                    suggestion: 'Add error handling or logging inside catch block'
                }
            });
        }

        // Check for magic numbers
        const magicNumberRegex = /(?<![\w.])[0-9]+(?![\w.])/g;
        while ((match = magicNumberRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            const number = match[0];
            // Exclude common safe numbers and small indices
            if (!['0', '1', '-1', '2', '3'].includes(number)) {
                issues.push({
                    type: 'magic-number',
                    message: `Magic number "${number}" detected - consider using named constant`,
                    line: lineNumber,
                    severity: 'warning',
                    details: {
                        value: number,
                        suggestion: 'Replace with named constant'
                    }
                });
            }
        }

        // Ensure each issue has required properties
        return issues.map(issue => ({
            type: issue.type || 'unknown',
            message: issue.message || 'Unknown issue',
            line: issue.line || 0,
            severity: issue.severity || 'info',
            details: issue.details || {}
        }));
    }

    async findSourceFiles(projectPath, fs) {
        if (!fs) {
            throw new Error('FileSystem (fs) parameter is required');
        }
        const sourceFiles = [];
        try {
            const walk = async (dir) => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) await walk(fullPath);
                    else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) sourceFiles.push(fullPath);
                }
            };
            await walk(projectPath);
            return sourceFiles;
        } catch (error) {
            logger.warn(`Error finding source files: ${error.message}`);
            return [];
        }
    }

    async findTestFiles(projectPath, testPatterns, fs) {
        if (!fs) {
            throw new Error('FileSystem (fs) parameter is required');
        }
        
        const testFiles = new Set();
        const ignoredDirs = new Set(['node_modules', 'coverage', 'dist', 'build']);
        
        try {
            const walk = async (dir) => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.') || ignoredDirs.has(entry.name)) continue;
                    
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walk(fullPath);
                    } else if (entry.isFile()) {
                        // Check if file matches test patterns
                        const isTestFile = entry.name.match(/\.(test|spec)\.[jt]sx?$/) ||
                                         fullPath.includes('__tests__') ||
                                         fullPath.includes('test');
                        if (isTestFile) {
                            testFiles.add(fullPath);
                        }
                    }
                }
            };
            
            await walk(projectPath);
            return Array.from(testFiles);
        } catch (error) {
            logger.warn(`Error finding test files: ${error.message}`);
            return [];
        }
    }
    generateRecommendations(metrics) {
        const recommendations = [];
        
        // Complexity recommendations
        if (metrics.complexity && metrics.complexity.highest > 15) {
            recommendations.push({
                type: 'complexity',
                severity: 'high',
                message: `High complexity detected (${metrics.complexity.highest}). Consider breaking down complex functions into smaller, more manageable pieces.`,
                details: metrics.complexity.files
                    .filter(file => file.complexity > 15)
                    .map(file => ({
                        file: file.path,
                        complexity: file.complexity,
                        metrics: file.metrics
                    }))
            });
        }

        // Maintainability recommendations
        if (metrics.maintainabilityIndex < 65) {
            recommendations.push({
                type: 'maintainability',
                severity: 'medium',
                message: `Low maintainability score (${metrics.maintainabilityIndex}). Consider improving code organization and documentation.`,
                details: metrics.fileAnalyses
                    .filter(analysis => analysis.maintainabilityScore < 65)
                    .map(analysis => ({
                        file: analysis.file,
                        score: analysis.maintainabilityScore,
                        issues: analysis.issues
                    }))
            });
        }

        // Test coverage recommendations
        if (metrics.testCoverage.lines < 80 || metrics.testCoverage.functions < 80) {
            recommendations.push({
                type: 'test-coverage',
                severity: 'medium',
                message: `Insufficient test coverage (Lines: ${metrics.testCoverage.lines}%, Functions: ${metrics.testCoverage.functions}%). Consider adding more tests.`,
                details: {
                    coverage: metrics.testCoverage,
                    suggestions: [
                        'Add unit tests for uncovered functions',
                        'Include edge case testing',
                        'Implement integration tests'
                    ]
                }
            });
        }

        // Code duplication recommendations
        if (metrics.duplicationScore < 90) {
            recommendations.push({
                type: 'duplication',
                severity: 'low',
                message: `Code duplication detected (${100 - metrics.duplicationScore}% of code). Consider refactoring duplicate code into shared functions or utilities.`,
                details: metrics.fileAnalyses
                    .filter(analysis => analysis.duplicationScore < 90)
                    .map(analysis => ({
                        file: analysis.file,
                        duplicationScore: analysis.duplicationScore
                    }))
            });
        }

        return recommendations;
    }
    async analyzeTestCoverage(projectPath, fs) {
        if (!fs) {
            throw new Error('FileSystem (fs) parameter is required for analyzeTestCoverage');
        }

        try {
            const testPatterns = [
                '**/__tests__/**/*.[jt]s?(x)',
                '**/?(*.)+(spec|test).[jt]s?(x)',
                '**/test/**/*.[jt]s?(x)',
                '**/tests/**/*.[jt]s?(x)'
            ];

            const testFiles = await this.findTestFiles(projectPath, testPatterns, fs);
            const sourceFiles = await this.findSourceFiles(projectPath, fs);

            const testMetrics = {
                totalTests: 0,
                passedTests: 0,
                skippedTests: 0,
                coverage: {
                    lines: 0,
                    functions: 0,
                    branches: 0,
                    statements: 0,
                    classes: 0,
                    methods: 0
                },
                files: [],
                testSuites: {
                    total: 0,
                    passed: 0,
                    failed: 0,
                    skipped: 0,
                    duration: 0
                },
                uncoveredFiles: [],
                testTypes: {
                    unit: 0,
                    integration: 0,
                    e2e: 0
                },
                assertions: {
                    total: 0,
                    passed: 0,
                    failed: 0
                },
                mockCoverage: {
                    total: 0,
                    used: 0
                }
            };

            // Track covered files to identify uncovered ones
            const coveredFiles = new Set();

            for (const file of testFiles) {
                const content = await fs.readFile(file, 'utf-8');
                
                // Enhanced test case detection
                const describes = content.match(/describe\s*\(['"]/g) || [];
                const testCases = content.match(/\b(test|it)\s*\(['"]/g) || [];
                const skipped = content.match(/\b(test|it)\.skip\s*\(['"]/g) || [];
                const focused = content.match(/\b(test|it)\.only\s*\(['"]/g) || [];
                
                testMetrics.testSuites.total += describes.length;
                testMetrics.totalTests += testCases.length;
                testMetrics.skippedTests += skipped.length;

                // Analyze test structure and execution
                const passingTestsMatches = content.match(/\b(test|it)\s*\(['"][^'"]*['"]\s*,\s*(?:async\s+)?\(\s*\)\s*=>\s*{(?:[^}]*expect[^}]*)+}\s*\)/g) || [];
                testMetrics.passedTests += passingTestsMatches.length;

                // Track covered source files
                const importedFiles = content.match(/(?:require|import)\s+(?:.*?from\s+)?['"]([^'"]+)['"]/g) || [];
                importedFiles.forEach(match => {
                    const importPath = match.match(/['"]([^'"]+)['"]/)?.[1];
                    if (importPath && !importPath.includes('node_modules')) {
                        coveredFiles.add(importPath);
                    }
                });

                // Enhanced coverage analysis
                const functionMatches = content.match(/(?:function\s+\w+|\(\s*\)\s*=>|async\s+function|\bclass\s+\w+)/g) || [];
                const lineCount = content.split('\n').length;
                const branchMatches = content.match(/if|else|switch|case|default|try|catch|\?.|&&|\|\|/g) || [];
                const assertions = content.match(/\bexpect\s*\(|\bassert\s*\(|\bshould\s*\./g) || [];

                testMetrics.coverage.functions += functionMatches.length;
                testMetrics.coverage.lines += lineCount;
                testMetrics.coverage.branches += branchMatches.length;
                testMetrics.coverage.statements += assertions.length;

                testMetrics.files.push({
                    path: path.relative(projectPath, file),
                    tests: testCases.length,
                    passing: passingTestsMatches.length,
                    skipped: skipped.length,
                    focused: focused.length,
                    coverage: {
                        functions: functionMatches.length,
                        lines: lineCount,
                        branches: branchMatches.length,
                        assertions: assertions.length
                    }
                });
            }

            // Calculate coverage percentages
            if (testMetrics.files.length > 0) {
                const totalFiles = testMetrics.files.length;
                testMetrics.coverage = {
                    lines: Math.round((testMetrics.coverage.lines / totalFiles) * 100),
                    functions: Math.round((testMetrics.coverage.functions / totalFiles) * 100),
                    branches: Math.round((testMetrics.coverage.branches / totalFiles) * 100),
                    statements: Math.round((testMetrics.coverage.statements / totalFiles) * 100)
                };
            }

            return testMetrics;
        } catch (error) {
            logger.warn(`Test coverage analysis failed: ${error.message}`);
            throw error;
        }
    }
    async analyzeDocumentation(projectPath, fs) {
        if (!fs) {
            logger.warn('FileSystem (fs) parameter is required for analyzeDocumentation');
            return this.getDefaultDocMetrics();
        }

        try {
            const docMetrics = this.getDefaultDocMetrics();

            // Check for README
            const readmePaths = ['README.md', 'Readme.md', 'readme.md'];
            for (const readmePath of readmePaths) {
                try {
                    const readmeContent = await fs.readFile(path.join(projectPath, readmePath), 'utf-8');
                    docMetrics.hasReadme = true;
                    docMetrics.readmeQuality = this.analyzeReadmeQuality(readmeContent);
                    break;
                } catch (error) {
                    continue;
                }
            }

            // Check for API documentation
            const apiDocPaths = [
                'docs/api',
                'api-docs',
                'api-spec',
                'swagger.json',
                'openapi.json'
            ];

            for (const docPath of apiDocPaths) {
                try {
                    await fs.access(path.join(projectPath, docPath));
                    docMetrics.hasApiDocs = true;
                    break;
                } catch (error) {
                    continue;
                }
            }

            // Calculate documentation coverage
            try {
                const sourceFiles = await this.findSourceFiles(projectPath, fs);
                let documentedFiles = 0;

                for (const file of sourceFiles) {
                    try {
                        const content = await fs.readFile(file, 'utf-8');
                        const hasJsDoc = content.includes('/**') || content.includes('///');
                        if (hasJsDoc) documentedFiles++;
                    } catch (error) {
                        logger.warn(`Error reading file ${file}: ${error.message}`);
                        continue;
                    }
                }

                docMetrics.coverage = sourceFiles.length > 0 
                    ? Math.round((documentedFiles / sourceFiles.length) * 100)
                    : 0;
            } catch (error) {
                logger.warn(`Error calculating documentation coverage: ${error.message}`);
            }

            return docMetrics;
        } catch (error) {
            logger.warn(`Documentation analysis failed: ${error.message}`);
            return this.getDefaultDocMetrics();
        }
    }

    getDefaultDocMetrics() {
        return {
            hasReadme: false,
            hasApiDocs: false,
            readmeQuality: 0,
            coverage: 0,
            issues: []
        };
    }

    getDefaultQualityMetrics() {
        return {
            linting: {
                hasEslint: false,
                hasPrettier: false
            },
            testing: {
                hasJest: false,
                hasMocha: false
            },
            documentation: this.getDefaultDocMetrics(),
            maintainabilityIndex: 70,
            issues: [],
            fileAnalyses: [],
            duplicationScore: 100,
            testCoverage: {
                lines: 0,
                functions: 0,
                branches: 0,
                statements: 0
            }
        };
    }

    analyzeReadmeQuality(content) {
        if (!content) return 0;

        const sections = {
            installation: content.toLowerCase().includes('# installation') || 
                         content.toLowerCase().includes('## installation'),
            usage: content.toLowerCase().includes('# usage') || 
                   content.toLowerCase().includes('## usage'),
            api: content.toLowerCase().includes('# api') || 
                 content.toLowerCase().includes('## api'),
            examples: content.toLowerCase().includes('# example') || 
                     content.toLowerCase().includes('## example'),
            contributing: content.toLowerCase().includes('# contributing') || 
                         content.toLowerCase().includes('## contributing')
        };

        const presentSections = Object.values(sections).filter(Boolean).length;
        const maxSections = Object.keys(sections).length;
        
        return Math.round((presentSections / maxSections) * 100);
    }

}

module.exports = QualityAnalyzer;