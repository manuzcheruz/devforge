const { logger } = require('../../utils/logger');

class ComplexityAnalyzer {
    calculateComplexity(content) {
        const complexityFactors = {
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
            }
        };

        let totalComplexity = 1;
        
        for (const factor of Object.values(complexityFactors)) {
            const matchCount = this.countPatternMatches(content, factor.patterns);
            totalComplexity += matchCount * factor.weight;
        }

        return Math.round(totalComplexity * 10) / 10;
    }

    countPatternMatches(content, patterns) {
        return patterns.reduce((count, pattern) => {
            const matches = content.match(pattern) || [];
            return count + matches.length;
        }, 0);
    }

    async analyzeComplexity(sourceFiles, fs) {
        try {
            let totalComplexity = 0;
            let highestComplexity = 0;
            const complexityData = [];

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const complexity = this.calculateComplexity(content);
                
                complexityData.push({ path: file, complexity });
                totalComplexity += complexity;
                highestComplexity = Math.max(highestComplexity, complexity);
            }

            const averageComplexity = sourceFiles.length > 0 ? totalComplexity / sourceFiles.length : 0;

            return {
                cyclomaticComplexity: {
                    average: averageComplexity,
                    highest: highestComplexity,
                    files: complexityData
                }
            };
        } catch (error) {
            logger.error(`Complexity analysis failed: ${error.message}`);
            throw error;
        }
    }
}

module.exports = ComplexityAnalyzer;
