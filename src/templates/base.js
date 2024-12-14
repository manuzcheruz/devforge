function getBaseTemplate(templateName) {
    const templates = {
        'monorepo': {
            files: {
                'packages/shared/package.json': `{
  "name": "@monorepo/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "eslint .",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "zod": "^3.22.4",
    "date-fns": "^2.30.0",
    "pino": "^8.16.2"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/jest": "^29.5.11",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0"
  }
}`,
                'packages/shared/src/index.ts': `
export * from './validation';
export * from './logger';
export * from './monitoring';`,
                'packages/shared/src/validation.ts': `import { z } from 'zod';

export const userSchema = z.object({
    id: z.number().optional(),
    email: z.string().email(),
    name: z.string().min(1),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export type User = z.infer<typeof userSchema>;

export const validateUser = (data: unknown): User => {
    return userSchema.parse(data);
};`,
                'packages/shared/src/logger.ts': `import pino from 'pino';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true
        }
    }
});`,
                'packages/shared/src/monitoring.ts': `import { Counter, Histogram } from 'prom-client';

export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5],
});

export const httpRequestTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
});`,
                'packages/shared/tsconfig.json': `{
  "compilerOptions": {
    "target": "es2019",
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`,
                'packages/shared/.eslintrc.js': `module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  plugins: ['@typescript-eslint'],
  root: true
};`,
                'package.json': `{
  "name": "monorepo-root",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  }
}`,
                'turbo.json': `{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "docs:generate": {
      "outputs": ["docs/**"],
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "analyze": {
      "dependsOn": ["build"],
      "outputs": ["stats/**"]
    }
  },
  "globalEnv": ["NODE_ENV", "DATABASE_URL", "API_KEY"]
}`,
                'packages/api/package.json': `{
  "name": "@monorepo/api",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest",
    "lint": "eslint . --ext .ts",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "ts-node prisma/seed.ts",
    "docs:generate": "ts-node scripts/generate-docs.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.7.0",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "prom-client": "^15.0.0",
    "swagger-ui-express": "^5.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.11",
    "@types/node": "^20.10.5",
    "@types/swagger-ui-express": "^4.1.6",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "eslint": "^8.56.0",
    "jest": "^29.7.0",
    "prisma": "^5.7.0",
    "ts-jest": "^29.1.1",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.3.3"
  }
}`,
                'packages/api/src/index.ts': `
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { OpenAPIV3 } from 'openapi-types';
import { rateLimit } from 'express-rate-limit';
import prometheus from 'prom-client';
import { PrismaClient } from '@prisma/client';
import { router } from './routes';
import { errorHandler } from './middleware/error';
import { validateRequest } from './middleware/validation';
import { swaggerDocument } from './swagger';

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

// Metrics setup
const collectDefaultMetrics = prometheus.collectDefaultMetrics;
collectDefaultMetrics();

// Basic security and performance middleware
app.use(express.json());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
}));

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Metrics endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', prometheus.register.contentType);
    const metrics = await prometheus.register.metrics();
    res.send(metrics);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API routes with validation
app.use('/api/v1', validateRequest, router);

// Error handling
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

app.listen(port, '0.0.0.0', () => {
    console.log(\`Server running at http://0.0.0.0:\${port}\`);
    console.log(\`API Documentation available at http://0.0.0.0:\${port}/api-docs\`);
    console.log(\`Metrics available at http://0.0.0.0:\${port}/metrics\`);
});`,
                'packages/api/src/routes/index.ts': `
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Example route with TypeScript and Prisma
router.get('/users', async (req, res, next) => {
    try {
        const users = await prisma.user.findMany();
        res.json(users);
    } catch (error) {
        next(error);
    }
});

export { router };`,
                'packages/api/src/middleware/error.ts': `
import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../utils/errors';

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (err instanceof CustomError) {
        return res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
            errors: err.errors
        });
    }

    console.error(err);
    return res.status(500).json({
        status: 'error',
        message: 'Internal server error'
    });
};`,
                'packages/api/prisma/schema.prisma': `
generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
}

model User {
    id        Int      @id @default(autoincrement())
    email     String   @unique
    name      String?
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}`,
                'packages/api/src/swagger/index.ts': `
import { OpenAPIV3 } from 'openapi-types';

export const swaggerDocument: OpenAPIV3.Document = {
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
    paths: {
        '/users': {
            get: {
                summary: 'Get all users',
                responses: {
                    '200': {
                        description: 'List of users',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: {
                                        $ref: '#/components/schemas/User'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    components: {
        schemas: {
            User: {
                type: 'object',
                properties: {
                    id: {
                        type: 'integer'
                    },
                    email: {
                        type: 'string',
                        format: 'email'
                    },
                    name: {
                        type: 'string'
                    },
                    createdAt: {
                        type: 'string',
                        format: 'date-time'
                    },
                    updatedAt: {
                        type: 'string',
                        format: 'date-time'
                    }
                }
            }
        }
    }
};`
            }
        },
        'express-api': {
            files: {
                'src/index.js': `
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');
const prometheus = require('prom-client');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
}));

// Performance monitoring
const collectDefaultMetrics = prometheus.collectDefaultMetrics;
collectDefaultMetrics();

// Logging middleware
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));

// API Documentation
const swaggerDocument = require('./swagger.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API Validation
app.use(OpenApiValidator.middleware({
    apiSpec: './swagger.json',
    validateRequests: true,
    validateResponses: true
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Metrics endpoint for monitoring
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', prometheus.register.contentType);
    const metrics = await prometheus.register.metrics();
    res.send(metrics);
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'Welcome to the API',
        version: process.env.npm_package_version,
        documentation: '/api-docs'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    // Don't expose internal error details in production
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(err.status || 500).json({
        status: 'error',
        message: isProduction ? 'Internal server error' : err.message,
        ...(isProduction ? {} : { errors: err.errors })
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    server.close(() => {
        console.log('Server closed. Exiting process.');
        process.exit(0);
    });
});

const server = app.listen(port, '0.0.0.0', () => {
    console.log(\`Server running on http://0.0.0.0:\${port}\`);
    console.log(\`API Documentation available at http://0.0.0.0:\${port}/api-docs\`);
});`,
                'src/routes/index.js': `
const express = require('express');
const router = express.Router();

module.exports = router;`,
                'package.json': `{
  "name": "express-api",
  "version": "1.0.0",
  "description": "Express API with security, monitoring, and development best practices",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest --coverage",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write '**/*.{js,json,md}'",
    "prepare": "husky install",
    "audit": "npm audit --audit-level=high",
    "docs": "jsdoc -c jsdoc.json"
  },
  "dependencies": {
    "express": "^4.18.2",
    "swagger-ui-express": "^5.0.0",
    "express-openapi-validator": "^5.0.6",
    "prom-client": "^15.0.0",
    "morgan": "^1.10.0",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.1.5",
    "winston": "^3.11.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "eslint": "^8.56.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.1.1",
    "husky": "^8.0.3",
    "jsdoc": "^4.0.2",
    "@commitlint/cli": "^18.4.3",
    "@commitlint/config-conventional": "^18.4.3"
  }
}`,
                '.env.example': `
PORT=3000
NODE_ENV=development
`,
                '.gitignore': `
node_modules
.env
coverage
`,
                'jest.config.js': `
module.exports = {
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};`
            }
        },
        'react-app': {
            files: {
                'src/App.js': `
import React from 'react';

function App() {
    return (
        <div>
            <h1>Welcome to React</h1>
        </div>
    );
}

export default App;`,
                'src/index.js': `
import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    document.getElementById('root')
);`
            }
        },
        'cli-tool': {
            files: {
                'bin/cli.js': `
#!/usr/bin/env node
const { program } = require('commander');

program
    .version('1.0.0')
    .description('CLI Tool')
    .parse(process.argv);`,
                'src/index.js': `
// Main CLI logic here
console.log('CLI Tool initialized');`
            }
        }
    };

    return templates[templateName] || templates['express-api'];
}

module.exports = { getBaseTemplate };