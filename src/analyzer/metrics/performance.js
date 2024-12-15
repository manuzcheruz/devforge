const { logger } = require('../../utils/logger');

class PerformanceAnalyzer {
    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    async analyzeBundleSize(sourceFiles, fs) {
        try {
            let totalSize = 0;

            for (const file of sourceFiles) {
                const stats = await fs.stat(file);
                totalSize += stats.size;
            }

            return {
                raw: totalSize,
                formatted: this.formatBytes(totalSize)
            };
        } catch (error) {
            logger.warn(`Bundle size calculation failed: ${error.message}`);
            return { raw: 0, formatted: '0 B' };
        }
    }

    async analyzeAsyncPatterns(sourceFiles, fs) {
        try {
            const patterns = {
                promises: 0,
                asyncAwait: 0,
                callbacks: 0
            };

            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                patterns.promises += (content.match(/new\s+Promise|Promise\.(all|race|resolve|reject)/g) || []).length;
                patterns.asyncAwait += (content.match(/async|await/g) || []).length;
                patterns.callbacks += (content.match(/callback|cb|done|next/g) || []).length;
            }

            return patterns;
        } catch (error) {
            logger.warn(`Async patterns analysis failed: ${error.message}`);
            return { promises: 0, asyncAwait: 0, callbacks: 0 };
        }
    }
}

module.exports = PerformanceAnalyzer;
