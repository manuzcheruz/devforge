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
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log(`API Documentation available at http://0.0.0.0:${port}/api-docs`);
    console.log(`Metrics available at http://0.0.0.0:${port}/metrics`);
});
