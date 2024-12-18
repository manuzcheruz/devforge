const chalk = require('chalk');

function formatTextReport(analysis) {
    const report = [
        chalk.bold('DevForge Project Analysis Report'),
        `Generated at: ${new Date().toLocaleString()}`,
        '\n'
    ];

    // Project Structure
    report.push(chalk.bold('\nProject Structure'));
    report.push('──────────────────────────────────────────────────');
    const structure = analysis.metrics.structure || {};
    report.push(`📁 Package.json: ${formatCheck(structure.hasPackageJson)}`);
    report.push(`📝 README: ${formatCheck(structure.hasReadme)}`);
    report.push(`🧪 Tests: ${formatCheck(structure.hasTests)}`);
    report.push(`⚙️  Config: ${formatCheck(structure.hasConfig)}`);
    report.push(`📌 Git Ignore: ${formatCheck(structure.hasGitIgnore)}`);

    // Dependencies
    report.push(chalk.bold('\nDependencies'));
    report.push('──────────────────────────────────────────────────');
    report.push(`📦 Production Dependencies: ${analysis.metrics.dependencies.direct}`);
    report.push(`🔧 Development Dependencies: ${analysis.metrics.dependencies.dev}`);
    report.push(`🤝 Peer Dependencies: ${analysis.metrics.dependencies.peer}`);

    if (analysis.metrics.dependencies.typescript) {
        report.push('\nTypeScript Status:');
        report.push(`  - TypeScript: ${formatCheck(analysis.metrics.dependencies.typescript.hasTypeScript)}`);
        report.push(`  - Type Definitions: ${formatCheck(analysis.metrics.dependencies.typescript.hasTypesPackages)}`);
    }

    if (analysis.metrics.dependencies.details?.production) {
        report.push('\nDependency Analysis:');
        report.push('  Production Dependencies:');
        Object.entries(analysis.metrics.dependencies.details.production).forEach(([name, info]) => {
            const versionColor = getVersionTypeColor(info.versionType);
            report.push(`    - ${name}: ${versionColor(info.version)} ${info.locked ? '🔒' : ''}`);
        });
    }

    // Security
    report.push(chalk.bold('\nSecurity'));
    report.push('──────────────────────────────────────────────────');
    report.push(`🔒 Package Lock: ${formatCheck(analysis.metrics.security.hasPackageLock)}`);
    report.push(`📝 Environment Example: ${formatCheck(analysis.metrics.security?.securityFiles?.hasEnvExample)}`);

    // Code Quality
    report.push(chalk.bold('\nCode Quality'));
    report.push('──────────────────────────────────────────────────');
    const quality = analysis.metrics.quality || {};
    const linting = quality.linting || {};
    const testing = quality.testing || {};
    
    report.push(`🎨 ESLint: ${formatCheck(linting.hasEslint)}`);
    report.push(`✨ Prettier: ${formatCheck(linting.hasPrettier)}`);
    report.push(`📘 TypeScript: ${formatCheck(quality.typescript)}`);
    report.push(`🧪 Testing Framework: ${formatCheck(testing.hasJest || testing.hasMocha)}`);
    
    if (typeof quality.maintainabilityIndex === 'number') {
        report.push(`\nMaintainability Index: ${quality.maintainabilityIndex}/100`);
        report.push(formatComplexityBar(quality.maintainabilityIndex / 5)); // Scale to match complexity bar
    }
    
    if (quality.issues && quality.issues.length > 0) {
        report.push('\nQuality Issues:');
        quality.issues.slice(0, 5).forEach(issue => {
            report.push(`  • ${issue.message || issue.type}: ${issue.file || 'Project-wide'}`);
        });
        if (quality.issues.length > 5) {
            report.push(`  ... and ${quality.issues.length - 5} more issues`);
        }
    }

    // Performance Metrics
    if (analysis.metrics.performance) {
        report.push(chalk.bold('\nPerformance Analysis'));
        report.push('──────────────────────────────────────────────────');
        report.push(formatPerformanceMetrics(analysis.metrics.performance));
    }

    // Code Complexity
    if (analysis.metrics.complexity) {
        report.push(chalk.bold('\nCode Complexity Analysis'));
        report.push('──────────────────────────────────────────────────');
        report.push(formatComplexityMetrics(analysis.metrics.complexity));
    }

    // Best Practices
    report.push(chalk.bold('\nBest Practices'));
    report.push('──────────────────────────────────────────────────');
    report.push(`📚 Documentation: ${formatCheck(analysis.metrics.practices.documentation.hasReadme)}`);
    report.push(`🔄 CI/CD: ${formatCheck(analysis.metrics.practices.cicd.hasGithubActions)}`);
    report.push(`🐳 Docker: ${formatCheck(analysis.metrics.practices.docker.hasDockerfile)}`);

    // Recommendations
    if (analysis.recommendations && analysis.recommendations.length > 0) {
        report.push(chalk.bold('\nRecommendations'));
        report.push('──────────────────────────────────────────────────');
        analysis.recommendations.forEach(rec => {
            report.push(`${getPriorityIcon(rec.priority)} ${rec.message}`);
        });
    }

    return report.join('\n');
}

function formatCheck(value) {
    return value ? chalk.green('✓') : chalk.red('✗');
}

function formatComplexityBar(complexity) {
    const maxLength = 20;
    const threshold = 10;
    const barLength = Math.min(Math.floor((complexity / threshold) * maxLength), maxLength);
    const bar = '█'.repeat(barLength) + '░'.repeat(maxLength - barLength);
    
    if (complexity > threshold) {
        return chalk.red(bar);
    } else if (complexity > threshold * 0.7) {
        return chalk.yellow(bar);
    }
    return chalk.green(bar);
}

function formatPerformanceMetrics(metrics) {
    const lines = [];
    if (metrics.bundleSize) {
        lines.push(`Bundle Size: ${metrics.bundleSize.formatted}`);
    }
    if (metrics.asyncPatterns) {
        lines.push('Async Patterns:');
        lines.push(`  Promises: ${metrics.asyncPatterns.promises}`);
        lines.push(`  Async/Await: ${metrics.asyncPatterns.asyncAwait}`);
        lines.push(`  Callbacks: ${metrics.asyncPatterns.callbacks}`);
    }
    return lines.join('\n');
}

function formatComplexityMetrics(metrics) {
    const lines = [];
    if (metrics.cyclomaticComplexity) {
        lines.push('Code Complexity Analysis:');
        lines.push(`Average Complexity: ${metrics.cyclomaticComplexity.average.toFixed(2)}`);
        lines.push(formatComplexityBar(metrics.cyclomaticComplexity.average));
        
        if (metrics.maintainability) {
            lines.push(`\nMaintainability Score: ${metrics.maintainability.score}/100`);
            lines.push(formatComplexityBar(metrics.maintainability.score / 5)); // Scale to match complexity bar
            
            if (metrics.maintainability.issues.length > 0) {
                lines.push('\nMaintainability Issues:');
                metrics.maintainability.issues.slice(0, 5).forEach(issue => {
                    lines.push(`  • ${issue.file}: ${issue.message}`);
                });
                if (metrics.maintainability.issues.length > 5) {
                    lines.push(`  ... and ${metrics.maintainability.issues.length - 5} more issues`);
                }
            }
        }
    }
    return lines.join('\n');
}

function getVersionTypeColor(type) {
    switch (type) {
        case 'exact':
            return chalk.green;
        case 'patch':
            return chalk.blue;
        case 'minor':
            return chalk.yellow;
        case 'latest':
            return chalk.red;
        default:
            return chalk.white;
    }
}

function getPriorityIcon(priority) {
    switch (priority.toLowerCase()) {
        case 'high':
            return chalk.red('❗');
        case 'medium':
            return chalk.yellow('⚠️');
        case 'low':
            return chalk.blue('ℹ️');
        default:
            return '•';
    }
}

module.exports = { 
    formatTextReport,
    formatComplexityBar,
    formatPerformanceMetrics,
    formatComplexityMetrics
};