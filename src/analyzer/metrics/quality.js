const { logger } = require('../../utils/logger');

class QualityAnalyzer {
    async analyzeCodeQuality(projectPath, fs) {
        try {
            const hasEslint = await this.checkFileExists(projectPath, '.eslintrc', fs);
            const hasPrettier = await this.checkFileExists(projectPath, '.prettierrc', fs);
            const hasTypeScript = await this.checkFileExists(projectPath, 'tsconfig.json', fs);

            const quality = {
                linting: { hasEslint, hasPrettier },
                typescript: hasTypeScript,
                testing: {
                    hasJest: await this.hasPackage(projectPath, 'jest', fs),
                    hasMocha: await this.hasPackage(projectPath, 'mocha', fs)
                }
            };

            quality.maintainabilityIndex = await this.calculateMaintainabilityIndex(projectPath, fs);
            quality.issues = [];

            return quality;
        } catch (error) {
            logger.error(`Code quality analysis failed: ${error.message}`);
            throw error;
        }
    }

    async checkFileExists(projectPath, filename, fs) {
        try {
            await fs.access(`${projectPath}/${filename}`);
            return true;
        } catch {
            return false;
        }
    }

    async hasPackage(projectPath, packageName, fs) {
        try {
            const packageJson = JSON.parse(
                await fs.readFile(`${projectPath}/package.json`, 'utf-8')
            );
            return !!(packageJson.dependencies?.[packageName] || 
                     packageJson.devDependencies?.[packageName]);
        } catch {
            return false;
        }
    }

    async calculateMaintainabilityIndex(projectPath, fs, sourceFiles = []) {
        try {
            let totalScore = 0;
            const issues = [];

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const fileScore = this.calculateFileMaintenanceScore(content);
                totalScore += fileScore;

                // Add issues if file score is below threshold
                if (fileScore < 70) {
                    issues.push({
                        type: 'maintainability',
                        message: `Low maintainability score (${fileScore.toFixed(2)})`,
                        file: file
                    });
                }
            }

            const averageScore = sourceFiles.length > 0 ? Math.min(100, totalScore / sourceFiles.length) : 70;

            return {
                score: averageScore,
                issues
            };
        } catch (error) {
            logger.warn(`Maintainability calculation failed: ${error.message}`);
            return {
                score: 70,
                issues: []
            };
        }
    }

    calculateFileMaintenanceScore(content) {
        const metrics = {
            lines: content.split('\n').length,
            comments: (content.match(/\/\*[\s\S]*?\*\/|\/\/.*/g) || []).length,
            functions: (content.match(/function\s+\w+\s*\(|=>\s*{|\w+\s*:\s*function/g) || []).length,
            complexity: (content.match(/if|else|for|while|do|switch|case|catch/g) || []).length
        };

        const score = 100 - (
            (metrics.complexity * 2) +
            (metrics.functions * 0.5) +
            (Math.max(0, metrics.lines - metrics.comments * 2) * 0.1)
        );

        return Math.max(0, Math.min(100, score));
    }
}

module.exports = QualityAnalyzer;
