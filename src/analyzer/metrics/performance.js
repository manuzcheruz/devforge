const { logger } = require('../../utils/logger');

class PerformanceAnalyzer {
    constructor() {
        this.defaultMetrics = {
            bundleSize: {
                raw: 0,
                formatted: '0 B'
            },
            asyncPatterns: {
                promises: 0,
                asyncAwait: 0,
                callbacks: 0
            }
        };
    }

    formatBytes(bytes) {
        if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) {
            return '0 B';
        }

        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    async analyzeBundleSize(sourceFiles = [], fs) {
        try {
            if (!Array.isArray(sourceFiles)) {
                throw new Error('sourceFiles must be an array');
            }

            let totalSize = 0;

            for (const file of sourceFiles) {
                try {
                    const stats = await fs.stat(file);
                    totalSize += stats.size;
                } catch (fileError) {
                    logger.warn(`Failed to get size for file ${file}: ${fileError.message}`);
                }
            }

            return {
                raw: totalSize,
                formatted: this.formatBytes(totalSize)
            };
        } catch (error) {
            logger.warn(`Bundle size calculation failed: ${error.message}`);
            return this.defaultMetrics.bundleSize;
        }
    }

    async analyzeAsyncPatterns(sourceFiles = [], fs) {
        try {
            if (!Array.isArray(sourceFiles)) {
                throw new Error('sourceFiles must be an array');
            }

            const patterns = {
                promises: 0,
                asyncAwait: 0,
                callbacks: 0
            };

            const asyncPatterns = {
                promises: /new\s+Promise|Promise\.(all|race|resolve|reject|any|allSettled)/g,
                asyncAwait: /\basync\b|\bawait\b/g,
                callbacks: /\bcallback\b|\bcb\b|\bdone\b|\bnext\b|\bthen\b|\bcatch\b/g
            };

            for (const file of sourceFiles) {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    
                    for (const [key, pattern] of Object.entries(asyncPatterns)) {
                        const matches = content.match(pattern) || [];
                        patterns[key] += matches.length;
                    }
                } catch (fileError) {
                    logger.warn(`Failed to analyze patterns in file ${file}: ${fileError.message}`);
                }
            }

            return patterns;
        } catch (error) {
            logger.warn(`Async patterns analysis failed: ${error.message}`);
            return this.defaultMetrics.asyncPatterns;
        }
    }

    getDefaultMetrics() {
        return JSON.parse(JSON.stringify(this.defaultMetrics));
    }
}

module.exports = PerformanceAnalyzer;
