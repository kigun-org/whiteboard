import { Server } from "@hocuspocus/server";

const PORT = 14123;

const server = new Server({
  port: PORT,
  quiet: true,
  async onAuthenticate() {
    return { user: { id: 1, name: "Ada", color: "#2563eb" } };
  },
  async onRequest({ request, response }) {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Accept",
      });
      response.end();
      throw null;
    }
    if (path === "/health") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("ok");
      throw null;
    }
    if (path === "/token") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(JSON.stringify({ token: "test" }));
      throw null;
    }
  },
});

await server.listen();
