import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { expect, test } from "@playwright/test";

const root = join(import.meta.dirname, "..", "dist");

function contentType(file: string): string | null {
  if (extname(file) === ".js") return "text/javascript";
  if (extname(file) === ".css") return "text/css";
  if (extname(file) === ".woff2") return "font/woff2";
  return null;
}

function serveDist(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    if (pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<!doctype html><whiteboard-editor></whiteboard-editor>" +
          '<script type="module" src="./whiteboard.js"></script>',
      );
      return;
    }
    const file = normalize(join(root, pathname));
    if (
      (file !== root && !file.startsWith(root + sep)) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const type = contentType(file);
    if (type) res.setHeader("Content-Type", type);
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The font test server has no port."));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        close: () =>
          new Promise((done, fail) => {
            server.closeAllConnections();
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

test("built fonts load from this origin", async ({ page }) => {
  expect(existsSync(join(root, "whiteboard.js"))).toBe(true);
  const remote: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("esm.sh")) remote.push(request.url());
  });

  const dist = await serveDist();
  try {
    const localFont = page.waitForResponse(
      (response) =>
        response.url().includes("/fonts/Nunito/") &&
        response.url().endsWith(".woff2") &&
        response.status() === 200,
    );
    await page.goto(dist.url);
    await page.waitForFunction(
      () => document.querySelector("whiteboard-editor")?.api,
    );
    await page.evaluate(() => document.fonts.load("20px Nunito", "Hello"));
    await localFont;
    expect(remote).toEqual([]);
  } finally {
    await dist.close();
  }
});
