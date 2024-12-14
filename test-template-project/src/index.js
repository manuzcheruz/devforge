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
    console.log(`Server running on http://0.0.0.0:${port}`);
    console.log(`API Documentation available at http://0.0.0.0:${port}/api-docs`);
});
