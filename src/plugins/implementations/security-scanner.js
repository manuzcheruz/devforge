const { Plugin, LIFECYCLE_EVENTS } = require('../interfaces/base');
const { logger } = require('../../utils/logger');
const path = require('path');
const fs = require('fs').promises;

class SecurityScannerPlugin extends Plugin {
    constructor() {
        super({
            name: 'core-security-scanner',
            version: '1.0.0',
            type: 'security',
            description: 'Security scanning plugin for NodeForge',
            author: 'NodeForge',
            capabilities: {
                dependencyScan: true,
                codeScan: true,
                configScan: true,
                reportGeneration: true
            },
            hooks: [
                {
                    event: LIFECYCLE_EVENTS.PRE_EXECUTE,
                    handler: async (context) => {
                        logger.info(`Starting security scan: ${context.scanType}`);
                    }
                },
                {
                    event: LIFECYCLE_EVENTS.POST_EXECUTE,
                    handler: async (context) => {
                        logger.info(`Completed security scan: ${context.scanType}`);
                    }
                }
            ]
        });

        // Initialize plugin state
        this.setState('lastScanResult', null);
    }

    async onExecute(context) {
        const { action = 'scan', scanType = 'all' } = context;
        
        try {
            switch (scanType) {
                case 'dependencies':
                    return await this.scanDependencies(context);
                case 'code':
                    return await this.scanCode(context);
                case 'config':
                    return await this.scanConfig(context);
                case 'all':
                    return await this.runFullScan(context);
                default:
                    throw new Error(`Unsupported scan type: ${scanType}`);
            }
        } catch (error) {
            logger.error(`Security scan failed: ${error.message}`);
            throw error;
        }
    }

    async scanDependencies(context) {
        const projectPath = context.projectPath || process.cwd();
        const packageJsonPath = path.join(projectPath, 'package.json');
        
        try {
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
            const dependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };

            const vulnerabilities = [];
            for (const [dep, version] of Object.entries(dependencies)) {
                // Simulate vulnerability check
                if (version.includes('*') || version.includes('>')) {
                    vulnerabilities.push({
                        dependency: dep,
                        version,
                        severity: 'high',
                        reason: 'Unpinned dependency version'
                    });
                }
            }

            return {
                success: true,
                details: {
                    vulnerabilities,
                    scannedDependencies: Object.keys(dependencies).length
                }
            };
        } catch (error) {
            return {
                success: false,
                details: {
                    error: error.message
                }
            };
        }
    }

    async scanCode(context) {
        const projectPath = context.projectPath || process.cwd();
        
        try {
            const issues = [];
            const sourceFiles = await this.findSourceFiles(projectPath);
            
            for (const file of sourceFiles) {
                const content = await fs.readFile(file, 'utf-8');
                
                // Simple security checks (example patterns)
                if (content.includes('eval(')) {
                    issues.push({
                        file,
                        line: this.findLineNumber(content, 'eval('),
                        severity: 'high',
                        message: 'Use of eval() is potentially dangerous'
                    });
                }
                
                if (content.includes('process.env') && !content.includes('process.env.NODE_ENV')) {
                    issues.push({
                        file,
                        line: this.findLineNumber(content, 'process.env'),
                        severity: 'medium',
                        message: 'Sensitive information might be exposed through environment variables'
                    });
                }
            }

            return {
                success: true,
                details: {
                    issues,
                    filesScanned: sourceFiles.length
                }
            };
        } catch (error) {
            return {
                success: false,
                details: {
                    error: error.message
                }
            };
        }
    }

    async scanConfig(context) {
        const projectPath = context.projectPath || process.cwd();
        
        try {
            const configIssues = [];
            const configFiles = ['.env', '.env.example', 'config.js', 'config.json'];
            
            for (const file of configFiles) {
                const filePath = path.join(projectPath, file);
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    
                    // Check for sensitive information
                    const sensitivePatterns = [
                        'password',
                        'secret',
                        'key',
                        'token',
                        'auth'
                    ];
                    
                    for (const pattern of sensitivePatterns) {
                        if (content.toLowerCase().includes(pattern)) {
                            configIssues.push({
                                file,
                                severity: 'high',
                                message: `Potential sensitive information (${pattern}) found in config file`
                            });
                        }
                    }
                } catch (error) {
                    // File doesn't exist, skip
                    continue;
                }
            }

            return {
                success: true,
                details: {
                    configIssues,
                    scannedFiles: configFiles.length
                }
            };
        } catch (error) {
            return {
                success: false,
                details: {
                    error: error.message
                }
            };
        }
    }

    async runFullScan(context) {
        const results = await Promise.all([
            this.scanDependencies(context),
            this.scanCode(context),
            this.scanConfig(context)
        ]);

        const [dependencies, code, config] = results;
        
        // Store scan results in plugin state
        this.setState('lastScanResult', {
            timestamp: new Date().toISOString(),
            results: {
                dependencies,
                code,
                config
            }
        });

        return {
            success: results.every(r => r.success),
            details: {
                dependencies: dependencies.details,
                code: code.details,
                config: config.details
            }
        };
    }

    // Helper methods
    async findSourceFiles(dir, fileList = []) {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                await this.findSourceFiles(filePath, fileList);
            } else if (file.endsWith('.js') || file.endsWith('.ts')) {
                fileList.push(filePath);
            }
        }
        
        return fileList;
    }

    findLineNumber(content, searchString) {
        const lines = content.split('\n');
        return lines.findIndex(line => line.includes(searchString)) + 1;
    }
}

const securityScanner = new SecurityScannerPlugin();

module.exports = {
    name: securityScanner.config.name,
    version: securityScanner.config.version,
    type: securityScanner.config.type,
    description: securityScanner.config.description,
    author: securityScanner.config.author,
    capabilities: securityScanner.config.capabilities,
    hooks: securityScanner.config.hooks,
    execute: context => securityScanner.execute(context),
    initialize: context => securityScanner.initialize(context),
    cleanup: () => securityScanner.cleanup()
};
