const analyzer = require('../analyzer');
const path = require('path');
const fs = require('fs').promises;

describe('Project Analyzer', () => {
  const testProjectPath = path.join(__dirname, '../../test-basic-project');
  
  beforeAll(async () => {
    // Create test project structure if it doesn't exist
    try {
      await fs.access(testProjectPath);
    } catch {
      await fs.mkdir(testProjectPath, { recursive: true });
      await fs.writeFile(
        path.join(testProjectPath, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'express': '^4.17.1'
          }
        })
      );
    }
  });

  describe('analyzeProject', () => {
    it('should analyze project structure correctly', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      expect(analysis).toBeDefined();
      expect(analysis.metrics).toBeDefined();
      expect(analysis.metrics.structure).toBeDefined();
    });

    it('should analyze dependencies correctly', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      expect(analysis.metrics.dependencies).toBeDefined();
      expect(Array.isArray(analysis.metrics.dependencies.outdated)).toBe(true);
    });

    it('should generate valid recommendations', async () => {
      const analysis = await analyzer.analyzeProject(testProjectPath);
      const report = analysis.generateReport();
      expect(Array.isArray(report.recommendations)).toBe(true);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeComplexity', () => {
    it('should calculate code complexity metrics', async () => {
      const analysis = await analyzer.analyzeComplexity(testProjectPath);
      expect(analysis.cyclomaticComplexity).toBeDefined();
      expect(typeof analysis.cyclomaticComplexity.average).toBe('number');
    });
  });

  describe('analyzePerformance', () => {
    it('should analyze performance metrics', async () => {
      const analysis = await analyzer.analyzePerformance(testProjectPath);
      expect(analysis.bundleSize).toBeDefined();
      expect(analysis.asyncPatterns).toBeDefined();
    });
  });
});
