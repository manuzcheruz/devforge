const { APIPlugin, API_ACTIONS } = require('../interfaces/api');
const { LIFECYCLE_EVENTS } = require('../interfaces/base');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../../utils/logger');

class OpenAPIGeneratorPlugin extends APIPlugin {
    constructor() {
        super({
            name: 'openapi-generator',
            version: '1.0.0',
            type: 'api',
            description: 'OpenAPI specification generator and validator',
            author: 'NodeForge',
            capabilities: {
                design: true,
                mock: true,
                test: true,
                document: true,
                monitor: true
            },
            hooks: [
                {
                    event: LIFECYCLE_EVENTS.PRE_EXECUTE,
                    handler: async (context) => {
                        logger.info(`Starting OpenAPI operation: ${context.action}`);
                    }
                },
                {
                    event: LIFECYCLE_EVENTS.POST_EXECUTE,
                    handler: async (context) => {
                        logger.info(`Completed OpenAPI operation: ${context.action}`);
                    }
                },
                {
                    event: LIFECYCLE_EVENTS.ERROR,
                    handler: async (context) => {
                        logger.error(`OpenAPI operation failed: ${context.error.message}`);
                    }
                }
            ]
        });

        // Initialize plugin state
        this.setState('specCache', new Map());
    }

    async onInitialize(context) {
        logger.info('Initializing OpenAPI Generator Plugin');
        const specDir = path.join(context.projectPath, 'specs');
        try {
            await fs.mkdir(specDir, { recursive: true });
        } catch (error) {
            logger.error(`Failed to create specs directory: ${error.message}`);
            throw error;
        }
    }

    async designAPI(context) {
        const { projectPath, apiSpec } = context;
        
        try {
            // Validate input spec if provided
            if (apiSpec) {
                this.validateAPISpec(apiSpec);
            }

            // Generate or update OpenAPI specification
            const spec = apiSpec || this.generateDefaultSpec();
            const specPath = path.join(projectPath, 'specs', 'openapi.json');
            
            await fs.writeFile(specPath, JSON.stringify(spec, null, 2));
            this.setState('currentSpec', spec);

            return {
                success: true,
                details: {
                    specPath,
                    endpoints: this.extractEndpoints(spec)
                }
            };
        } catch (error) {
            throw new Error(`Failed to design API: ${error.message}`);
        }
    }

    async generateMock(context) {
        const { projectPath } = context;
        const spec = this.getState('currentSpec');
        
        if (!spec) {
            throw new Error('No API specification found. Run designAPI first.');
        }

        try {
            // Generate mock server code
            const mockServerPath = path.join(projectPath, 'generated', 'mock-server.js');
            const mockCode = this.generateMockServerCode(spec);
            
            await fs.mkdir(path.dirname(mockServerPath), { recursive: true });
            await fs.writeFile(mockServerPath, mockCode);

            return {
                success: true,
                details: {
                    mockServerPath,
                    endpoints: this.extractEndpoints(spec)
                }
            };
        } catch (error) {
            throw new Error(`Failed to generate mock server: ${error.message}`);
        }
    }

    async generateDocs(context) {
        const { projectPath } = context;
        const spec = this.getState('currentSpec');
        
        if (!spec) {
            throw new Error('No API specification found. Run designAPI first.');
        }

        try {
            // Generate API documentation
            const docsPath = path.join(projectPath, 'docs', 'api');
            await fs.mkdir(docsPath, { recursive: true });
            
            // Generate markdown documentation
            const markdown = this.generateMarkdownDocs(spec);
            await fs.writeFile(path.join(docsPath, 'api.md'), markdown);

            return {
                success: true,
                details: {
                    docsPath,
                    format: 'markdown',
                    coverage: this.calculateDocsCoverage(spec)
                }
            };
        } catch (error) {
            throw new Error(`Failed to generate documentation: ${error.message}`);
        }
    }

    // Helper methods
    generateDefaultSpec() {
        return {
            openapi: '3.0.0',
            info: {
                title: 'Generated API',
                version: '1.0.0',
                description: 'Auto-generated API specification'
            },
            paths: {},
            components: {
                schemas: {},
                responses: {},
                parameters: {}
            }
        };
    }

    extractEndpoints(spec) {
        const endpoints = [];
        for (const [path, methods] of Object.entries(spec.paths || {})) {
            for (const [method, definition] of Object.entries(methods)) {
                endpoints.push({
                    path,
                    method: method.toUpperCase(),
                    operationId: definition.operationId,
                    summary: definition.summary
                });
            }
        }
        return endpoints;
    }

    generateMockServerCode(spec) {
        // Generate Express.js mock server code based on OpenAPI spec
        return `
const express = require('express');
const app = express();
app.use(express.json());

${this.generateMockEndpoints(spec)}

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(\`Mock server running on port \${port}\`);
});`;
    }

    generateMockEndpoints(spec) {
        let code = '';
        for (const [path, methods] of Object.entries(spec.paths || {})) {
            for (const [method, definition] of Object.entries(methods)) {
                code += this.generateMockEndpoint(path, method, definition);
            }
        }
        return code;
    }

    generateMockEndpoint(path, method, definition) {
        const expressPath = path.replace(/{([^}]+)}/g, ':$1');
        return `
app.${method.toLowerCase()}('${expressPath}', (req, res) => {
    res.json({
        message: 'Mock response for ${method.toUpperCase()} ${path}',
        operationId: '${definition.operationId || 'unknown'}'
    });
});`;
    }

    generateMarkdownDocs(spec) {
        let markdown = `# ${spec.info.title}\n\n`;
        markdown += `${spec.info.description || ''}\n\n`;
        markdown += `Version: ${spec.info.version}\n\n`;
        markdown += `## Endpoints\n\n`;

        for (const [path, methods] of Object.entries(spec.paths || {})) {
            for (const [method, definition] of Object.entries(methods)) {
                markdown += this.generateEndpointDocs(path, method, definition);
            }
        }

        return markdown;
    }

    generateEndpointDocs(path, method, definition) {
        return `### ${method.toUpperCase()} ${path}\n\n` +
               `${definition.summary || ''}\n\n` +
               `${definition.description || ''}\n\n`;
    }

    calculateDocsCoverage(spec) {
        let documented = 0;
        let total = 0;

        for (const methods of Object.values(spec.paths || {})) {
            for (const definition of Object.values(methods)) {
                total++;
                if (definition.description || definition.summary) {
                    documented++;
                }
            }
        }

        return total === 0 ? 100 : Math.round((documented / total) * 100);
    }
}

// Create and export the plugin instance
const openAPIGenerator = new OpenAPIGeneratorPlugin();

module.exports = {
    name: openAPIGenerator.config.name,
    version: openAPIGenerator.config.version,
    type: openAPIGenerator.config.type,
    capabilities: openAPIGenerator.config.capabilities,
    initialize: context => openAPIGenerator.initialize(context),
    execute: context => openAPIGenerator.execute(context),
    cleanup: () => openAPIGenerator.cleanup()
};
