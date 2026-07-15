export default function handler(request, response) {
  response.status(200).json({
    ok: true,
    name: "ai-second-brain-mcp",
    transport: "streamable-http"
  });
}
