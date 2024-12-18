const express = require('express');
const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');
const prometheus = require('prom-client');
const morgan = require('morgan');
const app = express();
const port = process.env.PORT || 3000;

// Performance monitoring
const collectDefaultMetrics = prometheus.collectDefaultMetrics;
collectDefaultMetrics();

// Logging middleware
app.use(morgan('combined'));
app.use(express.json());

// API Documentation
const swaggerDocument = require('./swagger.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API Validation
app.use(OpenApiValidator.middleware({
    apiSpec: './swagger.json',
    validateRequests: true,
    validateResponses: true
}));

// Metrics endpoint for monitoring
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', prometheus.register.contentType);
    const metrics = await prometheus.register.metrics();
    res.send(metrics);
});

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the API' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
        message: err.message,
        errors: err.errors
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`API Documentation available at http://localhost:${port}/api-docs`);
});
