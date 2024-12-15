const { logger } = require('../../utils/logger');

class ComplexityAnalyzer {
    constructor() {
        this.defaultMetrics = {
            cyclomaticComplexity: {
                average: 0,
                highest: 0,
                files: []
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
                    /catch\s*\(/g,
                    /try\s*{/g
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
                    /=>\s*{/g,
                    /class\s+\w+/g
                ],
                weight: 0.5
            }
        };
    }

    calculateComplexity(content) {
        if (!content || typeof content !== 'string') {
            logger.warn('Invalid content provided for complexity calculation');
            return 1; // Base complexity for invalid input
        }

        let totalComplexity = 1; // Base complexity
        
        try {
            for (const factor of Object.values(this.complexityFactors)) {
                const matchCount = this.countPatternMatches(content, factor.patterns);
                totalComplexity += matchCount * factor.weight;
            }

            return Math.max(1, Math.round(totalComplexity * 10) / 10); // Ensure minimum complexity of 1
        } catch (error) {
            logger.error(`Error calculating complexity: ${error.message}`);
            return 1; // Return base complexity on error
        }
    }

    countPatternMatches(content, patterns) {
        return patterns.reduce((count, pattern) => {
            const matches = content.match(pattern) || [];
            return count + matches.length;
        }, 0);
    }

    async analyzeComplexity(sourceFiles, fs) {
        if (!Array.isArray(sourceFiles)) {
            logger.error('Invalid sourceFiles parameter: expected array');
            return this.defaultMetrics;
        }

        if (!fs || typeof fs.readFile !== 'function') {
            logger.error('Invalid fs parameter: missing readFile function');
            return this.defaultMetrics;
        }

        try {
            let totalComplexity = 0;
            let highestComplexity = 0;
            const complexityData = [];

            for (const file of sourceFiles) {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    const complexity = this.calculateComplexity(content);
                    
                    complexityData.push({ 
                        path: file, 
                        complexity,
                        details: this.getComplexityDetails(content)
                    });
                    
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

    getComplexityDetails(content) {
        if (!content || typeof content !== 'string') {
            return {};
        }

        const details = {};
        try {
            for (const [key, factor] of Object.entries(this.complexityFactors)) {
                const matches = factor.patterns.reduce((count, pattern) => {
                    const found = content.match(pattern) || [];
                    return count + found.length;
                }, 0);
                details[key] = matches;
            }
            return details;
        } catch (error) {
            logger.warn(`Failed to get complexity details: ${error.message}`);
            return {};
        }
    }
}

module.exports = ComplexityAnalyzer;
