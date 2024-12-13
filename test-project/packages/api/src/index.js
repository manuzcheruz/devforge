const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const app = express();
const port = process.env.PORT || 3000;

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'API is running' });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
