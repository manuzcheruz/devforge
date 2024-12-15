const path = require('path');
const ProjectAnalyzer = require('../../analyzer');

describe('Core Analyzer Functionality', () => {
  let analyzer;
  let testProjectPath;

  beforeEach(() => {
    analyzer = new ProjectAnalyzer();
    testProjectPath = path.resolve(__dirname, '../../../'); // Use root project directory for testing
  });

  describe('Project Structure Analysis', () => {
    it('should detect basic project structure', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      expect(analysis.metrics.structure).toBeDefined();
      expect(analysis.metrics.structure.hasPackageJson).toBe(true);
      expect(analysis.metrics.structure.hasReadme).toBe(true);
    });

    it('should analyze dependencies correctly', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      expect(analysis.metrics.dependencies).toBeDefined();
      expect(typeof analysis.metrics.dependencies.direct).toBe('number');
      expect(typeof analysis.metrics.dependencies.dev).toBe('number');
    });

    it('should handle missing project directory gracefully', async () => {
      const nonExistentPath = path.join(__dirname, 'non-existent-project');
      await expect(analyzer.analyzeProject(nonExistentPath)).rejects.toThrow();
    });

    it('should detect source files correctly', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      const sourceFiles = analysis.metrics.structure.sourceFiles;
      expect(Array.isArray(sourceFiles)).toBe(true);
      expect(sourceFiles.some(file => file.endsWith('.js') || file.endsWith('.ts'))).toBe(true);
    });
  });

  describe('Code Quality Analysis', () => {
    it('should provide code quality metrics', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      expect(analysis.metrics.quality).toBeDefined();
      expect(typeof analysis.metrics.quality.maintainabilityIndex).toBe('number');
      expect(Array.isArray(analysis.metrics.quality.issues)).toBe(true);
      expect(analysis.metrics.quality.maintainabilityIndex).toBeGreaterThanOrEqual(0);
      expect(analysis.metrics.quality.maintainabilityIndex).toBeLessThanOrEqual(100);
    });

    it('should detect code complexity', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      expect(analysis.metrics.complexity).toBeDefined();
      expect(typeof analysis.metrics.complexity.cyclomaticComplexity.average).toBe('number');
      expect(typeof analysis.metrics.complexity.cyclomaticComplexity.highest).toBe('number');
      expect(analysis.metrics.complexity.cyclomaticComplexity.average).toBeGreaterThanOrEqual(0);
    });

    it('should identify specific code quality issues', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      const issues = analysis.metrics.quality.issues;
      expect(Array.isArray(issues)).toBe(true);
      if (issues.length > 0) {
        expect(issues.every(issue => issue.type && issue.message)).toBe(true);
        expect(issues.every(issue => typeof issue.type === 'string')).toBe(true);
      }
    });
  });

  describe('Performance Analysis', () => {
    it('should analyze bundle size', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      expect(analysis.metrics.performance).toBeDefined();
      expect(typeof analysis.metrics.performance.bundleSize.raw).toBe('number');
    });

    it('should detect async patterns', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      expect(analysis.metrics.performance.asyncPatterns).toBeDefined();
      expect(typeof analysis.metrics.performance.asyncPatterns.promises).toBe('number');
      expect(typeof analysis.metrics.performance.asyncPatterns.asyncAwait).toBe('number');
      expect(typeof analysis.metrics.performance.asyncPatterns.callbacks).toBe('number');
    });
  });
});
