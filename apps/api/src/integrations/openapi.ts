export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Job Compliance Audit Agent API',
    version: '1.0.0',
    description: 'Stable external API for job posting compliance audit integrations.',
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Local development' },
    { url: 'https://sandbox.example.com', description: 'Sandbox' },
  ],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
      },
    },
  },
  paths: {
    '/v1/audit/job': {
      post: {
        summary: 'Audit one job posting',
        responses: {
          '200': { description: 'Audit result' },
          '401': { description: 'Invalid API key' },
          '429': { description: 'Rate limited' },
        },
      },
    },
    '/v1/audit/batch': {
      post: {
        summary: 'Create an async batch audit job',
        responses: {
          '202': { description: 'Batch accepted' },
        },
      },
    },
    '/v1/audit/runs/{id}': {
      get: {
        summary: 'Get audit run',
        responses: {
          '200': { description: 'Audit result' },
          '404': { description: 'Audit run not found' },
        },
      },
    },
    '/v1/audit/batch/{id}': {
      get: {
        summary: 'Get batch audit job',
        responses: {
          '200': { description: 'Batch status' },
          '404': { description: 'Batch not found' },
        },
      },
    },
    '/v1/webhooks/test': {
      post: {
        summary: 'Generate and optionally deliver a signed webhook test event',
        responses: {
          '200': { description: 'Webhook test payload and signature' },
        },
      },
    },
    '/v1/webhooks': {
      post: {
        summary: 'Register a signed webhook endpoint',
        responses: {
          '201': { description: 'Webhook endpoint created' },
        },
      },
    },
    '/v1/webhooks/deliveries': {
      get: {
        summary: 'List webhook delivery attempts',
        responses: {
          '200': { description: 'Webhook delivery logs' },
        },
      },
    },
    '/v1/usage': {
      get: {
        summary: 'Get usage and quota information',
        responses: {
          '200': { description: 'Usage summary' },
        },
      },
    },
  },
} as const;
