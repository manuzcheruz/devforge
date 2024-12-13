const defaultConfig = {
    version: '1.0.0',
    templates: {
        'express-api': {
            dependencies: {
                'express': '^4.18.2',
                'cors': '^2.8.5',
                'dotenv': '^16.3.1',
                'helmet': '^7.1.0',
                'compression': '^1.7.4',
                'express-rate-limit': '^7.1.5',
                'swagger-ui-express': '^5.0.0',
                'express-openapi-validator': '^5.0.6',
                'prom-client': '^15.0.0',
                'morgan': '^1.10.0',
                'prisma': '^5.7.0',
                '@prisma/client': '^5.7.0'
            },
            devDependencies: {
                'nodemon': '^3.0.2',
                'jest': '^29.7.0',
                'supertest': '^6.3.3',
                '@types/jest': '^29.5.11',
                'eslint': '^8.56.0',
                'eslint-config-airbnb-base': '^15.0.0',
                'eslint-plugin-jest': '^27.6.0',
                'prettier': '^3.1.1',
                'husky': '^8.0.3',
                'lint-staged': '^15.2.0'
            }
        },
        'fastify-api': {
            dependencies: {
                'fastify': '^4.24.3',
                'fastify-cors': '^6.0.3',
                'fastify-swagger': '^8.12.1',
                'env-schema': '^5.0.0'
            },
            devDependencies: {
                'nodemon': '^3.0.2',
                'jest': '^29.7.0',
                'tap': '^18.6.1',
                'eslint': '^8.56.0',
                'prettier': '^3.1.1'
            }
        },
        'graphql-api': {
            dependencies: {
                'apollo-server-express': '^3.13.0',
                'express': '^4.18.2',
                'graphql': '^16.8.1',
                'type-graphql': '^2.0.0-beta.3'
            },
            devDependencies: {
                'nodemon': '^3.0.2',
                'jest': '^29.7.0',
                'typescript': '^5.3.3',
                '@types/node': '^20.10.5',
                'ts-node': '^10.9.2',
                'ts-jest': '^29.1.1'
            }
        },
        'cli-tool': {
            dependencies: {
                'commander': '^11.1.0',
                'inquirer': '^9.2.12',
                'chalk': '^4.1.2',
                'ora': '^5.4.1',
                'conf': '^12.0.0'
            },
            devDependencies: {
                'jest': '^29.7.0',
                'eslint': '^8.56.0',
                'prettier': '^3.1.1'
            }
        }
    },
    defaultTemplate: 'express-api',
    features: {
        typescript: {
            enabled: false,
            version: '^5.3.3',
            config: {
                strict: true,
                esModuleInterop: true
            }
        },
        testing: {
            framework: 'jest',
            coverage: true,
            e2e: true
        },
        linting: {
            eslint: true,
            prettier: true,
            husky: true,
            commitlint: true
        },
        documentation: {
            swagger: true,
            jsdoc: true
        },
        ci: {
            provider: 'github-actions',
            tasks: ['lint', 'test', 'build']
        }
    }
};

module.exports = { defaultConfig };
