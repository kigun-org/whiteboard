import { expect, test } from "@playwright/test";

const RECTANGLE = {
  id: "rect-1",
  type: "rectangle",
  x: 80,
  y: 80,
  width: 140,
  height: 90,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  index: "a0",
  roundness: null,
  seed: 1,
  version: 2,
  versionNonce: 3,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
};

test("two pages draw on one board", async ({ browser }) => {
  const room = `board-${Date.now()}`;
  const url =
    `/?room=${room}` +
    "&ws=ws://127.0.0.1:14123&token=http://127.0.0.1:14123/token";
  const context = await browser.newContext();
  const left = await context.newPage();
  const right = await context.newPage();

  await left.goto(url);
  await right.goto(url);
  await left.waitForFunction(
    () => document.querySelector("whiteboard-editor")?.api,
  );
  await right.waitForFunction(
    () => document.querySelector("whiteboard-editor")?.api,
  );

  await left.evaluate((element) => {
    const board = document.querySelector("whiteboard-editor");
    board?.api?.updateScene({
      elements: [element],
      captureUpdate: "IMMEDIATELY",
    });
  }, RECTANGLE);

  await expect
    .poll(
      () =>
        right.evaluate(
          () =>
            document
              .querySelector("whiteboard-editor")
              ?.api?.getSceneElements()
              .some((element) => element.id === "rect-1") ?? false,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);

  await context.close();
});

test("an in-place edit of a received shape reaches the other page", async ({
  browser,
}) => {
  const room = `board-edit-${Date.now()}`;
  const url =
    `/?room=${room}` +
    "&ws=ws://127.0.0.1:14123&token=http://127.0.0.1:14123/token";
  const context = await browser.newContext();
  const left = await context.newPage();
  const right = await context.newPage();

  await left.goto(url);
  await right.goto(url);
  for (const page of [left, right]) {
    await page.waitForFunction(
      () => document.querySelector("whiteboard-editor")?.api,
    );
  }

  await left.evaluate((element) => {
    document.querySelector("whiteboard-editor")?.api?.updateScene({
      elements: [element],
      captureUpdate: "IMMEDIATELY",
    });
  }, RECTANGLE);

  const widthOn = (page: typeof left) =>
    page.evaluate(
      () =>
        document
          .querySelector("whiteboard-editor")
          ?.api?.getSceneElements()
          .find((element) => element.id === "rect-1")?.width ?? null,
    );
  await expect.poll(() => widthOn(right), { timeout: 15_000 }).toBe(140);

  // Excalidraw resizes and restyles by changing the element object in place.
  await right.evaluate(() => {
    const api = document.querySelector("whiteboard-editor")?.api;
    if (!api) return;
    const element = api
      .getSceneElementsIncludingDeleted()
      .find((item) => item.id === "rect-1") as unknown as {
      width: number;
      strokeColor: string;
      version: number;
      versionNonce: number;
    };
    element.width = 300;
    element.strokeColor = "#e03131";
    element.version += 1;
    element.versionNonce += 1;
    api.updateScene({
      elements: api.getSceneElementsIncludingDeleted(),
      captureUpdate: "IMMEDIATELY",
    });
  });

  await expect.poll(() => widthOn(left), { timeout: 15_000 }).toBe(300);

  await context.close();
});
