const { analyzeProject } = require('../../analyzer');
const path = require('path');

describe('Core Analyzer Functionality', () => {
  const testProjectPath = path.join(__dirname, '../../../test-basic-project');

  describe('Project Structure Analysis', () => {
    it('should detect basic project structure', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.structure).toBeDefined();
      expect(analysis.metrics.structure.hasPackageJson).toBe(true);
      expect(analysis.metrics.structure.hasReadme).toBe(true);
    });

    it('should analyze dependencies correctly', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.dependencies).toBeDefined();
      expect(Array.isArray(analysis.metrics.dependencies.production)).toBe(true);
      expect(Array.isArray(analysis.metrics.dependencies.development)).toBe(true);
    });
  });

  describe('Code Quality Analysis', () => {
    it('should provide code quality metrics', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.quality).toBeDefined();
      expect(typeof analysis.metrics.quality.maintainabilityIndex).toBe('number');
      expect(Array.isArray(analysis.metrics.quality.issues)).toBe(true);
    });

    it('should detect code complexity', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.complexity).toBeDefined();
      expect(typeof analysis.metrics.complexity.average).toBe('number');
      expect(typeof analysis.metrics.complexity.highest).toBe('number');
    });
  });

  describe('Performance Analysis', () => {
    it('should analyze bundle size', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.performance).toBeDefined();
      expect(typeof analysis.metrics.performance.bundleSize).toBe('number');
    });

    it('should detect async patterns', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.performance.asyncPatterns).toBeDefined();
      expect(typeof analysis.metrics.performance.asyncPatterns.promises).toBe('number');
      expect(typeof analysis.metrics.performance.asyncPatterns.asyncAwait).toBe('number');
    });
  });

  describe('Security Analysis', () => {
    it('should check for security best practices', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.security).toBeDefined();
      expect(typeof analysis.metrics.security.hasPackageLock).toBe('boolean');
      expect(typeof analysis.metrics.security.hasEnvExample).toBe('boolean');
    });
  });
});
