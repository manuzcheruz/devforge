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

    it('should handle missing project directory gracefully', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-project');
      await expect(analyzeProject(nonExistentPath)).rejects.toThrow();
    });

    it('should detect source files correctly', async () => {
      const analysis = await analyzeProject(testProjectPath);
      const sourceFiles = analysis.metrics.structure.sourceFiles;
      expect(Array.isArray(sourceFiles)).toBe(true);
      expect(sourceFiles.some(file => file.endsWith('.js') || file.endsWith('.ts'))).toBe(true);
    });
  });

  describe('Code Quality Analysis', () => {
    it('should provide code quality metrics', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.quality).toBeDefined();
      expect(typeof analysis.metrics.quality.maintainabilityIndex).toBe('number');
      expect(Array.isArray(analysis.metrics.quality.issues)).toBe(true);
      expect(analysis.metrics.quality.maintainabilityIndex).toBeGreaterThanOrEqual(0);
      expect(analysis.metrics.quality.maintainabilityIndex).toBeLessThanOrEqual(100);
    });

    it('should detect code complexity', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.complexity).toBeDefined();
      expect(typeof analysis.metrics.complexity.average).toBe('number');
      expect(typeof analysis.metrics.complexity.highest).toBe('number');
      expect(analysis.metrics.complexity.average).toBeGreaterThanOrEqual(1);
    });

    it('should identify specific code quality issues', async () => {
      const analysis = await analyzeProject(testProjectPath);
      const issues = analysis.metrics.quality.issues;
      expect(issues.every(issue => issue.type && issue.message)).toBe(true);
      expect(issues.every(issue => typeof issue.type === 'string')).toBe(true);
    });

    it('should calculate accurate complexity scores', async () => {
      const analysis = await analyzeProject(testProjectPath);
      expect(analysis.metrics.complexity.highest).toBeGreaterThanOrEqual(analysis.metrics.complexity.average);
      if (analysis.metrics.complexity.files) {
        expect(Array.isArray(analysis.metrics.complexity.files)).toBe(true);
        expect(analysis.metrics.complexity.files.every(file => file.path && typeof file.complexity === 'number')).toBe(true);
      }
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
