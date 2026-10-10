import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type * as Y from "yjs";

type SceneApi = {
  updateScene: (scene: {
    elements: readonly SceneElement[];
    captureUpdate: (typeof CaptureUpdateAction)["NEVER"];
  }) => void;
  getSceneElementsIncludingDeleted: () => readonly SceneElement[];
};

const LOCAL = "local";

export type SceneElement = {
  id: string;
  type: string;
  version?: number;
  versionNonce?: number;
  index?: string;
  isDeleted?: boolean;
};

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isNewer(next: SceneElement, current: SceneElement | undefined) {
  if (!current) return true;
  const nextVersion = next.version ?? 0;
  const currentVersion = current.version ?? 0;
  if (nextVersion !== currentVersion) return nextVersion > currentVersion;
  return (next.versionNonce ?? 0) > (current.versionNonce ?? 0);
}

// Returns copies. Excalidraw edits elements in place (resize, style), so it
// must never hold the objects that the Y.Map stores.
export function elementsFromMap(map: Y.Map<SceneElement>) {
  const elements: SceneElement[] = [];
  map.forEach((element) => {
    if (element && typeof element === "object" && element.id) {
      elements.push(plain(element));
    }
  });
  elements.sort((left, right) => {
    const a = left.index ?? "";
    const b = right.index ?? "";
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  return elements;
}

export function bindScene(doc: Y.Doc, api: SceneApi) {
  const map = doc.getMap<SceneElement>("elements");
  let applying = false;

  function write(elements: readonly SceneElement[]) {
    doc.transact(() => {
      for (const element of elements) {
        if (!element?.id) continue;
        const current = map.get(element.id);
        if (isNewer(element, current)) map.set(element.id, plain(element));
      }
    }, LOCAL);
  }

  function applyRemote() {
    applying = true;
    try {
      api.updateScene({
        elements: elementsFromMap(map),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    } finally {
      applying = false;
    }
  }

  const observer = (
    _event: Y.YMapEvent<SceneElement>,
    transaction: Y.Transaction,
  ) => {
    if (transaction.origin === LOCAL) return;
    // A remote write can lose to Yjs last-write-wins. Put the newer local
    // element back, then render whatever the map holds.
    write(api.getSceneElementsIncludingDeleted() as SceneElement[]);
    applyRemote();
  };

  // Keep strokes made before the room connected. A newer copy in the
  // document wins.
  write(api.getSceneElementsIncludingDeleted() as SceneElement[]);
  map.observe(observer);
  applyRemote();

  return {
    onChange(elements: readonly SceneElement[]) {
      if (applying) return;
      write(elements);
    },
    destroy() {
      map.unobserve(observer);
    },
  };
}
