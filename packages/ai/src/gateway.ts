import { createOpenAI } from '@ai-sdk/openai';

const gatewayToken = process.env.AI_GATEWAY_API_KEY;
const gatewayBaseUrl = process.env.AI_GATEWAY_BASE_URL;

if (!gatewayToken) {
  throw new Error('AI_GATEWAY_API_KEY is required');
}

if (!gatewayBaseUrl) {
  throw new Error('AI_GATEWAY_BASE_URL is required');
}

export const ailaGateway = createOpenAI({
  apiKey: gatewayToken,
  baseURL: gatewayBaseUrl,
});
