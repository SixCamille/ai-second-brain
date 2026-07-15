import { createMcpHandler } from "../src/mcp-handler.js";

const handler = createMcpHandler();

export default async function mcp(request, response) {
  await handler(request, response);
}
