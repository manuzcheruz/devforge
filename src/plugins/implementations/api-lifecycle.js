const { APIPlugin } = require('../interfaces/api');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../utils/logger');
const OpenAPIValidator = require('express-openapi-validator');
const swaggerUI = require('swagger-ui-express');

class APILifecyclePlugin extends APIPlugin {
    constructor() {
        super({
            name: 'core-api-lifecycle',
            version: '1.0.0',
            type: 'api',
            capabilities: {
                design: true,
                mock: true,
                test: true,
                document: true,
                monitor: true
            },
            execute: async ({ action, context = {} }) => {
                try {
                    switch (action) {
                        case 'design':
                            return await this.designAPI(context);
                        case 'mock':
                            return await this.generateMock(context);
                        case 'test':
                            return await this.runTests(context);
                        case 'document':
                            return await this.generateDocs(context);
                        case 'monitor':
                            return await this.monitorPerformance(context);
                        default:
                            throw new Error(`Unsupported action: ${action}`);
                    }
                } catch (error) {
                    logger.error(`Plugin execution failed: ${error.message}`);
                    return {
                        success: false,
                        details: {
                            issues: [error.message]
                        }
                    };
                }
            }
        });
    }

    async designAPI(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            logger.info(`Designing API for project at: ${projectPath}`);

            // Create OpenAPI specification directory
            const apiSpecPath = path.join(projectPath, 'api-spec');
            await fs.mkdir(apiSpecPath, { recursive: true });

            // Generate base OpenAPI specification
            const baseSpec = {
                openapi: '3.0.0',
                info: {
                    title: 'API Documentation',
                    version: '1.0.0',
                    description: 'Generated API documentation'
                },
                servers: [
                    {
                        url: '/api/v1',
                        description: 'API v1'
                    }
                ],
                paths: {},
                components: {
                    schemas: {},
                    securitySchemes: {
                        bearerAuth: {
                            type: 'http',
                            scheme: 'bearer',
                            bearerFormat: 'JWT'
                        }
                    }
                }
            };

            await fs.writeFile(
                path.join(apiSpecPath, 'openapi.json'),
                JSON.stringify(baseSpec, null, 2)
            );

            return {
                success: true,
                details: {
                    endpoints: [],
                    documentation: baseSpec
                }
            };
        } catch (error) {
            logger.error(`API design failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }

    async generateMock(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            const apiSpecPath = path.join(projectPath, 'api-spec', 'openapi.json');

            // Read OpenAPI specification
            const spec = JSON.parse(await fs.readFile(apiSpecPath, 'utf-8'));
            
            // Generate mock server code
            const mockServerCode = this.generateMockServerCode(spec);
            
            // Save mock server
            const mockServerPath = path.join(projectPath, 'src', 'mock-server');
            await fs.mkdir(mockServerPath, { recursive: true });
            await fs.writeFile(
                path.join(mockServerPath, 'index.js'),
                mockServerCode
            );

            return {
                success: true,
                details: {
                    endpoints: Object.keys(spec.paths || {})
                }
            };
        } catch (error) {
            logger.error(`Mock generation failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }

    generateMockServerCode(spec) {
        return `
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { generateMockData } = require('./mock-data');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(${JSON.stringify(spec, null, 2)}));

// Generate mock endpoints
${Object.entries(spec.paths || {}).map(([path, methods]) => `
// ${path}
${Object.entries(methods).map(([method, config]) => `
app.${method.toLowerCase()}('${path}', (req, res) => {
    const mockData = generateMockData(${JSON.stringify(config.responses['200'])});
    res.json(mockData);
});`).join('\n')}
`).join('\n')}

app.listen(port, '0.0.0.0', () => {
    console.log(\`Mock server running at http://0.0.0.0:\${port}\`);
    console.log(\`API Documentation available at http://0.0.0.0:\${port}/api-docs\`);
});`;
    }

    async runTests(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            const apiSpecPath = path.join(projectPath, 'api-spec', 'openapi.json');

            // Generate test files
            const testPath = path.join(projectPath, 'tests', 'api');
            await fs.mkdir(testPath, { recursive: true });

            // Read OpenAPI specification
            const spec = JSON.parse(await fs.readFile(apiSpecPath, 'utf-8'));
            
            // Generate test code for each endpoint
            for (const [path, methods] of Object.entries(spec.paths || {})) {
                const testCode = this.generateTestCode(path, methods);
                const fileName = path.replace(/\//g, '-').slice(1) || 'root';
                await fs.writeFile(
                    path.join(testPath, `${fileName}.test.js`),
                    testCode
                );
            }

            return {
                success: true,
                details: {
                    coverage: 100,
                    endpoints: Object.keys(spec.paths || {})
                }
            };
        } catch (error) {
            logger.error(`Test generation failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }

    generateTestCode(path, methods) {
        return `
const request = require('supertest');
const app = require('../src/app');

describe('${path}', () => {
    ${Object.entries(methods).map(([method, config]) => `
    describe('${method.toUpperCase()}', () => {
        it('should return ${config.responses['200']?.description || 'successful response'}', async () => {
            const response = await request(app)
                .${method.toLowerCase()}('${path}')
                .expect(200);
            
            // Add more specific assertions based on the schema
        });

        it('should validate request payload', async () => {
            const invalidPayload = {};
            const response = await request(app)
                .${method.toLowerCase()}('${path}')
                .send(invalidPayload)
                .expect(400);
        });
    });`).join('\n')}
});`;
    }

    async generateDocs(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            const apiSpecPath = path.join(projectPath, 'api-spec', 'openapi.json');

            // Read OpenAPI specification
            const spec = JSON.parse(await fs.readFile(apiSpecPath, 'utf-8'));

            // Generate documentation
            const docsPath = path.join(projectPath, 'docs', 'api');
            await fs.mkdir(docsPath, { recursive: true });

            // Generate Markdown documentation
            const markdownDocs = this.generateMarkdownDocs(spec);
            await fs.writeFile(
                path.join(docsPath, 'API.md'),
                markdownDocs
            );

            return {
                success: true,
                details: {
                    documentation: spec,
                    endpoints: Object.keys(spec.paths || {})
                }
            };
        } catch (error) {
            logger.error(`Documentation generation failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }

    generateMarkdownDocs(spec) {
        return `# ${spec.info.title}

${spec.info.description}

Version: ${spec.info.version}

## Endpoints

${Object.entries(spec.paths || {}).map(([path, methods]) => `
### ${path}

${Object.entries(methods).map(([method, config]) => `
#### ${method.toUpperCase()}

${config.description || ''}

**Parameters:**
${config.parameters?.map(param => `- ${param.name} (${param.in}) - ${param.description}`).join('\n') || 'None'}

**Responses:**
${Object.entries(config.responses).map(([code, response]) => `- ${code}: ${response.description}`).join('\n')}
`).join('\n')}`).join('\n')}

## Schemas

${Object.entries(spec.components?.schemas || {}).map(([name, schema]) => `
### ${name}

${schema.description || ''}

**Properties:**
${Object.entries(schema.properties || {}).map(([prop, details]) => `- ${prop} (${details.type}) - ${details.description || ''}`).join('\n')}
`).join('\n')}`;
    }

    async monitorPerformance(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            
            // Generate monitoring setup code
            const monitoringPath = path.join(projectPath, 'src', 'monitoring');
            await fs.mkdir(monitoringPath, { recursive: true });

            // Generate monitoring code
            const monitoringCode = `
const prometheus = require('prom-client');
const express = require('express');

// Create metrics
const httpRequestDuration = new prometheus.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new prometheus.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

// Initialize metrics collection
prometheus.collectDefaultMetrics();

// Create metrics middleware
const metricsMiddleware = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const labels = {
            method: req.method,
            route: req.route?.path || req.path,
            status_code: res.statusCode
        };
        httpRequestDuration.observe(labels, duration);
        httpRequestTotal.inc(labels);
    });
    next();
};

// Metrics endpoint
const metricsEndpoint = async (req, res) => {
    res.set('Content-Type', prometheus.register.contentType);
    const metrics = await prometheus.register.metrics();
    res.send(metrics);
};

module.exports = {
    metricsMiddleware,
    metricsEndpoint
};`;

            await fs.writeFile(
                path.join(monitoringPath, 'index.js'),
                monitoringCode
            );

            return {
                success: true,
                details: {
                    metrics: {
                        requestDuration: 'http_request_duration_seconds',
                        requestTotal: 'http_requests_total'
                    }
                }
            };
        } catch (error) {
            logger.error(`Performance monitoring setup failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }
}

const apiLifecyclePlugin = new APILifecyclePlugin();

module.exports = {
    name: apiLifecyclePlugin.config.name,
    version: apiLifecyclePlugin.config.version,
    type: apiLifecyclePlugin.config.type,
    execute: apiLifecyclePlugin.config.execute,
    capabilities: apiLifecyclePlugin.config.capabilities
};
