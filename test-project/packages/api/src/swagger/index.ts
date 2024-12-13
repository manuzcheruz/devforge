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
};
