const { logger } = require('../../utils/logger');

class ComplexityAnalyzer {
    constructor() {
        this.defaultMetrics = {
            cyclomaticComplexity: {
                average: 0,
                highest: 0,
                files: []
            },
            codeOrganization: {
                nestedDepth: 0,
                functionLength: 0,
                classCount: 0,
                moduleMetrics: {
                    exports: 0,
                    imports: 0
                }
            },
            functionMetrics: {
                averageParameters: 0,
                maxParameters: 0,
                totalFunctions: 0
            }
        };

        this.complexityFactors = {
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
            },
            nesting: {
                patterns: [/{[^}]*{/g],
                weight: 0.75
            },
            errorHandling: {
                patterns: [
                    /throw\s+new\s+\w+/g,
                    /catch\s*\([^)]*\)\s*{/g,
                    /\.catch\s*\(/g,
                    /try\s*{[\s\S]*?}\s*finally\s*{/g
                ],
                weight: 0.25
            },
            moduleComplexity: {
                patterns: [
                    /require\([^)]+\)/g,
                    /import\s+.*\s+from/g,
                    /export\s+(default\s+)?(\{[^}]+\}|\w+)/g
                ],
                weight: 0.3
            }
        };
    }

    async analyzeComplexity(sourceFiles = [], fs) {
        try {
            let totalComplexity = 0;
            let highestComplexity = 0;
            const complexityData = [];

            for (const file of sourceFiles) {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    const complexity = this.calculateComplexity(content);
                    const functionMetrics = this.analyzeFunctionMetrics(content);
                    const moduleMetrics = this.analyzeModuleMetrics(content);
                    const organization = this.analyzeCodeOrganization(content);

                    const fileMetrics = {
                        path: file,
                        complexity,
                        functionMetrics,
                        moduleMetrics,
                        organization,
                        details: this.getComplexityDetails(content)
                    };

                    complexityData.push(fileMetrics);
                    totalComplexity += complexity;
                    highestComplexity = Math.max(highestComplexity, complexity);
                } catch (fileError) {
                    logger.warn(`Failed to analyze file ${file}: ${fileError.message}`);
                    continue;
                }
            }

            const averageComplexity = sourceFiles.length > 0
                ? Math.round((totalComplexity / sourceFiles.length) * 100) / 100
                : 0;

            return {
                cyclomaticComplexity: {
                    average: averageComplexity,
                    highest: Math.round(highestComplexity * 100) / 100,
                    files: complexityData
                }
            };
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            return this.defaultMetrics;
        }
    }

    calculateComplexity(content) {
        if (!content || typeof content !== 'string') {
            return {
                score: 1,
                details: {
                    error: 'Invalid or empty content'
                }
            };
        }

        try {
            let totalComplexity = 1; // Base complexity
            const details = {};

            // Calculate complexity from control flow and patterns
            for (const [key, factor] of Object.entries(this.complexityFactors)) {
                const matchCount = this.countPatternMatches(content, factor.patterns);
                const factorComplexity = matchCount * factor.weight;
                totalComplexity += factorComplexity;
                details[key] = {
                    count: matchCount,
                    weight: factor.weight,
                    contribution: factorComplexity
                };
            }

            // Analyze code organization metrics
            const organization = this.analyzeCodeOrganization(content);
            details.organization = organization;
            totalComplexity += organization.complexity;

            // Analyze function metrics
            const functionMetrics = this.analyzeFunctionMetrics(content);
            details.functions = functionMetrics;
            totalComplexity += Math.min(2, functionMetrics.averageParameters * 0.2);
            totalComplexity += Math.min(3, (functionMetrics.totalFunctions > 20 ? 3 : functionMetrics.totalFunctions * 0.15));

            // Analyze module metrics
            const moduleMetrics = this.analyzeModuleMetrics(content);
            details.modules = moduleMetrics;
            totalComplexity += moduleMetrics.moduleComplexity;

            // Calculate maintainability index
            const maintainabilityIndex = this.calculateMaintainabilityIndex(
                totalComplexity,
                organization.nestedDepth,
                functionMetrics
            );

            // Normalize complexity score
            const normalizedComplexity = Math.max(1, Math.min(100, Math.round(totalComplexity * 10) / 10));

            return {
                score: normalizedComplexity,
                maintainabilityIndex,
                details: {
                    ...details,
                    totalComplexity: normalizedComplexity,
                    factors: Object.keys(this.complexityFactors).map(key => ({
                        name: key,
                        ...details[key]
                    }))
                }
            };
        } catch (error) {
            logger.warn(`Complexity calculation failed: ${error.message}`);
            return {
                score: 1,
                details: {
                    error: error.message
                }
            };
        }
    }

    analyzeCodeOrganization(content) {
        try {
            const lines = content.split('\n');
            let maxDepth = 0;
            let currentDepth = 0;
            let maxFunctionLength = 0;
            let currentFunctionLength = 0;
            let inFunction = false;
            let classCount = 0;

            for (const line of lines) {
                const openBraces = (line.match(/{/g) || []).length;
                const closeBraces = (line.match(/}/g) || []).length;
                currentDepth += openBraces - closeBraces;
                maxDepth = Math.max(maxDepth, currentDepth);

                if (line.match(/function\s+\w+\s*\(|=>|\w+\s*:\s*function/)) {
                    inFunction = true;
                    currentFunctionLength = 0;
                } else if (inFunction) {
                    currentFunctionLength++;
                    if (line.match(/}/)) {
                        maxFunctionLength = Math.max(maxFunctionLength, currentFunctionLength);
                        inFunction = false;
                    }
                }

                if (line.match(/class\s+\w+/)) {
                    classCount++;
                }
            }

            const organizationComplexity = (
                (maxDepth * 0.5) +
                (maxFunctionLength > 50 ? (maxFunctionLength - 50) * 0.1 : 0) +
                (classCount * 0.5)
            );

            return {
                complexity: organizationComplexity,
                nestedDepth: maxDepth,
                functionLength: maxFunctionLength,
                classCount: classCount
            };
        } catch (error) {
            logger.warn(`Code organization analysis failed: ${error.message}`);
            return {
                complexity: 0,
                nestedDepth: 0,
                functionLength: 0,
                classCount: 0
            };
        }
    }

    countPatternMatches(content, patterns) {
        return patterns.reduce((count, pattern) => {
            const matches = content.match(pattern) || [];
            return count + matches.length;
        }, 0);
    }


    analyzeFunctionMetrics(content) {
        try {
            const functionRegex = /function\s+\w+\s*\(([^)]*)\)|(\w+|\([^)]*\))\s*=>\s*{|\w+\s*:\s*function\s*\(([^)]*)\)/g;
            const matches = [...content.matchAll(functionRegex)];

            let totalParameters = 0;
            let maxParameters = 0;
            const totalFunctions = matches.length;

            matches.forEach(match => {
                const params = (match[1] || match[3] || '').split(',').filter(p => p.trim());
                const paramCount = params.length;
                totalParameters += paramCount;
                maxParameters = Math.max(maxParameters, paramCount);
            });

            return {
                averageParameters: totalFunctions > 0 ? totalParameters / totalFunctions : 0,
                maxParameters,
                totalFunctions
            };
        } catch (error) {
            logger.warn(`Function metrics analysis failed: ${error.message}`);
            return {
                averageParameters: 0,
                maxParameters: 0,
                totalFunctions: 0
            };
        }
    }

    analyzeModuleMetrics(content) {
        try {
            const requireMatches = (content.match(/require\([^)]+\)/g) || []).length;
            const importMatches = (content.match(/import\s+.*\s+from/g) || []).length;
            const exportMatches = (content.match(/export\s+(default\s+)?(\{[^}]+\}|\w+)/g) || []).length;

            return {
                imports: requireMatches + importMatches,
                exports: exportMatches,
                moduleComplexity: Math.min(5, (requireMatches + importMatches + exportMatches) * 0.2)
            };
        } catch (error) {
            logger.warn(`Module metrics analysis failed: ${error.message}`);
            return {
                imports: 0,
                exports: 0,
                moduleComplexity: 0
            };
        }
    }

    calculateMaintainabilityIndex(complexity, nestedDepth, functionMetrics) {
        try {
            let maintainability = 100;
            maintainability -= Math.min(30, complexity * 2);
            maintainability -= Math.min(20, nestedDepth * 3);
            maintainability -= Math.min(15, functionMetrics.averageParameters * 5);
            maintainability -= Math.min(15, (functionMetrics.totalFunctions > 20 ? 15 : functionMetrics.totalFunctions * 0.75));

            return Math.max(0, Math.min(100, Math.round(maintainability)));
        } catch (error) {
            logger.warn(`Maintainability index calculation failed: ${error.message}`);
            return 70;
        }
    }

    getComplexityDetails(content) {
        if (!content || typeof content !== 'string') {
            return {
                controlFlow: 0,
                logicalOperators: 0,
                ternary: 0,
                functions: 0,
                nesting: 0,
                errorHandling: 0,
                moduleComplexity: 0
            };
        }

        const details = {};
        try {
            for (const [key, factor] of Object.entries(this.complexityFactors)) {
                const matches = factor.patterns.reduce((count, pattern) => {
                    const found = content.match(pattern) || [];
                    return count + found.length;
                }, 0);
                details[key] = {
                    count: matches,
                    weight: factor.weight,
                    contribution: matches * factor.weight
                };
            }

            const functionMetrics = this.analyzeFunctionMetrics(content);
            const moduleMetrics = this.analyzeModuleMetrics(content);
            const organization = this.analyzeCodeOrganization(content);

            return {
                ...details,
                functionMetrics,
                moduleMetrics,
                organization,
                totalComplexity: this.calculateComplexity(content)
            };
        } catch (error) {
            logger.warn(`Failed to get complexity details: ${error.message}`);
            return {
                controlFlow: 0,
                logicalOperators: 0,
                ternary: 0,
                functions: 0,
                nesting: 0,
                errorHandling: 0,
                moduleComplexity: 0,
                error: error.message
            };
        }
    }
}

module.exports = ComplexityAnalyzer;

module.exports = ComplexityAnalyzer;