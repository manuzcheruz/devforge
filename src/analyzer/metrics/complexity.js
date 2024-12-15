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
            if (!Array.isArray(sourceFiles)) {
                throw new Error('sourceFiles must be an array');
            }

            let totalComplexity = 0;
            let highestComplexity = 0;
            const complexityData = [];
            let validFileCount = 0;

            for (const file of sourceFiles) {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    if (!content || typeof content !== 'string') {
                        logger.warn(`Invalid content for file ${file}`);
                        continue;
                    }

                    const complexityResult = this.calculateComplexity(content);
                    if (!complexityResult || typeof complexityResult.score !== 'number') {
                        logger.warn(`Invalid complexity result for file ${file}`);
                        continue;
                    }

                    const complexity = Math.max(1, Math.min(100, complexityResult.score));
                    const functionMetrics = this.analyzeFunctionMetrics(content);
                    const moduleMetrics = this.analyzeModuleMetrics(content);
                    const organization = this.analyzeCodeOrganization(content);

                    const fileMetrics = {
                        path: file,
                        complexity,
                        functionMetrics: functionMetrics || this.defaultMetrics.functionMetrics,
                        moduleMetrics: moduleMetrics || this.defaultMetrics.codeOrganization.moduleMetrics,
                        organization: organization || this.defaultMetrics.codeOrganization,
                        details: complexityResult.details || {}
                    };

                    complexityData.push(fileMetrics);
                    totalComplexity += complexity;
                    highestComplexity = Math.max(highestComplexity, complexity);
                    validFileCount++;
                } catch (fileError) {
                    logger.warn(`Failed to analyze file ${file}: ${fileError.message}`);
                    continue;
                }
            }

            const averageComplexity = validFileCount > 0
                ? Math.round((totalComplexity / validFileCount) * 100) / 100
                : 0;

            return {
                cyclomaticComplexity: {
                    average: Math.max(0, Math.min(100, averageComplexity)),
                    highest: Math.max(0, Math.min(100, Math.round(highestComplexity * 100) / 100)),
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
            logger.warn('Invalid input: content must be a non-empty string');
            return {
                score: 1,
                maintainabilityIndex: 100,
                details: {
                    error: 'Invalid or empty content'
                }
            };
        }

        try {
            // Initialize base metrics structure
            const metrics = {
                base: 1,
                patterns: 0,
                organization: 0,
                functions: 0,
                modules: 0
            };

            const details = {};
            let totalWeight = 0;

            // Calculate pattern-based complexity with weighted normalization
            for (const [key, factor] of Object.entries(this.complexityFactors)) {
                const matchCount = Math.max(0, this.countPatternMatches(content, factor.patterns));
                const weight = Number(factor.weight) || 0;
                totalWeight += weight;
                
                // Calculate contribution with bounds checking
                let contribution = 0;
                if (matchCount > 0 && weight > 0) {
                    contribution = Math.min(10, matchCount) * weight;
                }
                
                if (isFinite(contribution)) {
                    metrics.patterns += contribution;
                    details[key] = {
                        count: matchCount,
                        weight: weight,
                        contribution: contribution,
                        normalized: Math.min(100, (contribution / weight) * 10)
                    };
                }
            }

            // Normalize pattern-based complexity
            if (totalWeight > 0) {
                metrics.patterns = Math.min(50, (metrics.patterns / totalWeight) * 10);
            }

            // Calculate organizational complexity
            const organization = this.analyzeCodeOrganization(content);
            details.organization = organization;
            if (organization && typeof organization.complexity === 'number') {
                metrics.organization = Math.min(20, Math.max(0, organization.complexity));
            }

            // Calculate function-based complexity
            const functionMetrics = this.analyzeFunctionMetrics(content);
            details.functions = functionMetrics;
            if (functionMetrics && typeof functionMetrics.totalFunctions === 'number') {
                // Parameter complexity (max 10)
                const paramComplexity = Math.min(10, 
                    ((functionMetrics.averageParameters || 0) * 2)
                );
                
                // Function count complexity (max 10)
                const funcCountComplexity = Math.min(10,
                    functionMetrics.totalFunctions > 20 ? 10 : 
                    ((functionMetrics.totalFunctions || 0) * 0.5)
                );
                
                metrics.functions = Math.min(20, paramComplexity + funcCountComplexity);
            }

            // Calculate module-based complexity
            const moduleMetrics = this.analyzeModuleMetrics(content);
            details.modules = moduleMetrics;
            if (moduleMetrics && typeof moduleMetrics.moduleComplexity === 'number') {
                metrics.modules = Math.min(10, moduleMetrics.moduleComplexity);
            }

            // Calculate final complexity score
            let totalComplexity = Object.values(metrics).reduce((sum, value) => {
                return sum + (isFinite(value) ? value : 0);
            }, 0);

            // Ensure minimum complexity of 1 and maximum of 100
            totalComplexity = Math.max(1, Math.min(100, totalComplexity));

            // Calculate maintainability index
            const maintainabilityIndex = this.calculateMaintainabilityIndex(
                totalComplexity,
                Math.max(0, organization?.nestedDepth || 0),
                functionMetrics || this.defaultMetrics.functionMetrics
            );

            return {
                score: Math.round(totalComplexity * 10) / 10,
                maintainabilityIndex: Math.round(maintainabilityIndex * 10) / 10,
                details: {
                    metrics,
                    ...details,
                    totalComplexity,
                    normalizedScore: totalComplexity,
                    maintainabilityIndex,
                    factors: Object.keys(this.complexityFactors).map(key => ({
                        name: key,
                        ...details[key]
                    }))
                }
            };
        } catch (error) {
            logger.error(`Complexity calculation failed: ${error.message}`);
            return {
                score: 1,
                maintainabilityIndex: 100,
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