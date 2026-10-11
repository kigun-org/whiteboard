import "./asset-path";
import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { bindScene, elementsFromMap, type SceneElement } from "./binding";
import {
  useHocuspocusSession,
  type HocuspocusSession,
  type RealtimeConfig,
} from "./collab/useHocuspocusSession";
import "./whiteboard.css";

const UI_OPTIONS = { tools: { image: false } };

type Collaborator = {
  username?: string;
  pointer?: { x: number; y: number; tool: "pointer" | "laser" };
  button?: "up" | "down";
  selectedElementIds?: Record<string, true>;
  color?: { background: string; stroke: string };
};

type AwarenessLike = {
  clientID: number;
  getStates: () => Map<number, Record<string, unknown>>;
  on: (event: "change", handler: () => void) => void;
  off: (event: "change", handler: () => void) => void;
};

function currentTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-bs-theme") === "dark"
    ? "dark"
    : "light";
}

function readScene(host: HTMLElement): SceneElement[] {
  const script = host.querySelector('script[type="application/json"]');
  if (!script?.textContent?.trim()) return [];
  try {
    const data = JSON.parse(script.textContent) as {
      elements?: SceneElement[];
    } | null;
    return Array.isArray(data?.elements) ? data.elements : [];
  } catch {
    return [];
  }
}

function collaboratorsOf(awareness: AwarenessLike) {
  const collaborators = new Map<string, Collaborator>();
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    const user = state.user as { name?: string; color?: string } | undefined;
    if (!user) return;
    const color = user.color || "#2563eb";
    collaborators.set(String(clientId), {
      username: user.name,
      pointer: state.pointer as Collaborator["pointer"],
      button: state.button as Collaborator["button"],
      selectedElementIds:
        state.selectedElementIds as Collaborator["selectedElementIds"],
      color: { background: color, stroke: color },
    });
  });
  return collaborators;
}

function Board({
  host,
  elements,
  roomId,
  realtime,
  readonly,
}: {
  host: WhiteboardEditorElement;
  elements: SceneElement[];
  roomId: string;
  realtime: RealtimeConfig | null;
  readonly: boolean;
}) {
  const live = Boolean(roomId && realtime);
  const sessionState = useHocuspocusSession(live ? roomId : "", live ? realtime : null);
  const session = sessionState.status === "ready" ? sessionState.session : null;
  const viewMode = readonly || (live && (
    sessionState.status !== "ready" || !session || !sessionState.writable
  ));

  return (
    <BoardCanvas
      key={session?.doc.guid ?? "preview"}
      host={host}
      elements={elements}
      session={session}
      live={live}
      viewMode={viewMode}
    />
  );
}

// A new document gets a fresh canvas, including a fresh undo history.
function BoardCanvas({ host, elements, session, live, viewMode }: {
  host: WhiteboardEditorElement;
  elements: SceneElement[];
  session: HocuspocusSession | null;
  live: boolean;
  viewMode: boolean;
}) {
  const [theme, setTheme] = useState(currentTheme);
  const [collaborators, setCollaborators] = useState(
    () => new Map<string, Collaborator>(),
  );
  const binding = useRef<ReturnType<typeof bindScene> | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [bindingReady, setBindingReady] = useState(false);
  const lastScene = useRef<string | null>(null);
  const [initial] = useState(() =>
    session ? elementsFromMap(session.doc.getMap("elements")) : elements,
  );

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-bs-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const awareness = session?.provider.awareness as AwarenessLike | null | undefined;
    if (!awareness) return;
    const update = () => setCollaborators(collaboratorsOf(awareness));
    awareness.on("change", update);
    update();
    return () => awareness.off("change", update);
  }, [session]);

  useEffect(() => {
    if (!api || !session) return;
    binding.current = bindScene(
      session.doc,
      {
        updateScene: (scene) => api.updateScene(scene as never),
        getSceneElementsIncludingDeleted: () =>
          api.getSceneElementsIncludingDeleted() as unknown as SceneElement[],
      },
      { writable: !viewMode },
    );
    setBindingReady(true);
    return () => {
      binding.current?.destroy();
      binding.current = null;
      setBindingReady(false);
    };
  }, [api, session, viewMode]);

  useEffect(() => () => {
    if (host.api === api) host.api = null;
  }, [api, host]);

  useEffect(() => {
    if (!api) return;
    api.updateScene({
      collaborators: collaborators as never,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [collaborators, api]);

  return (
    <div data-whiteboard-root="">
      <Excalidraw
        theme={theme}
        initialData={{ elements: initial as never }}
        viewModeEnabled={viewMode || (live && !bindingReady)}
        isCollaborating={Boolean(session)}
        UIOptions={UI_OPTIONS}
        validateEmbeddable={false}
        excalidrawAPI={(next: ExcalidrawImperativeAPI) => {
          host.api = next;
          setApi(next);
        }}
        onChange={(next, appState) => {
          if (!viewMode) {
            binding.current?.onChange(next as unknown as SceneElement[]);
          }
          if (!live) {
            const scene = JSON.stringify({ elements: next });
            const changed = lastScene.current !== null && lastScene.current !== scene;
            lastScene.current = scene;
            host.sceneInput.value = scene;
            if (changed && !viewMode) {
              host.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          if (!session || viewMode) return;
          session.provider.setAwarenessField(
            "selectedElementIds",
            appState.selectedElementIds,
          );
        }}
        onPointerUpdate={({ pointer, button }) => {
          if (!session || viewMode) return;
          session.provider.setAwarenessField("pointer", pointer);
          session.provider.setAwarenessField("button", button);
        }}
      />
    </div>
  );
}

class WhiteboardEditorElement extends HTMLElement {
  api: ExcalidrawImperativeAPI | null = null;
  get sceneInput(): HTMLInputElement {
    let input = this.querySelector<HTMLInputElement>(':scope > input[type="hidden"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.value = JSON.stringify({ elements: readScene(this) });
      this.append(input);
    }
    return input;
  }
  private root: Root | null = null;
  private mountPoint: HTMLElement | null = null;

  connectedCallback() {
    if (this.root) return;
    this.mountPoint = document.createElement("div");
    this.mountPoint.setAttribute("data-whiteboard-root", "");
    this.append(this.mountPoint);
    this.root = createRoot(this.mountPoint);
    const realtimeUrl = this.getAttribute("realtime-url");
    const tokenUrl = this.getAttribute("token-url");
    this.root.render(
      <Board
        host={this}
        elements={readScene(this)}
        roomId={this.getAttribute("room-id") || ""}
        realtime={
          realtimeUrl && tokenUrl ? { url: realtimeUrl, tokenUrl } : null
        }
        readonly={this.hasAttribute("readonly")}
      />,
    );
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = null;
    this.api = null;
    this.mountPoint?.remove();
    this.mountPoint = null;
  }
}

if (!customElements.get("whiteboard-editor")) {
  customElements.define("whiteboard-editor", WhiteboardEditorElement);
}
