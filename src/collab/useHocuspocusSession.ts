import { useEffect, useState } from "react";
import * as Y from "yjs";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";

export type RealtimeConfig = {
  url: string;
  tokenUrl: string;
};

export type HocuspocusSession = {
  doc: Y.Doc;
  provider: HocuspocusProvider;
};

export type HocuspocusState =
  | { status: "connecting" }
  | { status: "reloading" }
  | { status: "denied" }
  | { status: "ready"; session: HocuspocusSession | null; writable: boolean };

// The server refuses a known generation after it discarded or reset the room
// document. The client then starts over with an empty Y.Doc, so stale Yjs
// updates never merge into the new document.
const RELOAD_REASONS = new Set(["stale-generation", "resetting"]);
const RELOAD_DELAY_MS = 500;

// One WebSocket per server URL. All editors on the page attach to it.
const sockets = new Map<string, HocuspocusProviderWebsocket>();

function socketUrl(value: string) {
  if (/^wss?:\/\//.test(value)) return value;
  const url = new URL(value, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

function socketFor(value: string) {
  const url = socketUrl(value);
  let socket = sockets.get(url);
  if (!socket) {
    socket = new HocuspocusProviderWebsocket({ url });
    sockets.set(url, socket);
  }
  return socket;
}

async function fetchToken(tokenUrl: string) {
  const response = await fetch(new URL(tokenUrl, window.location.href), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Realtime token: HTTP ${response.status}`);
  }
  return (await response.json()).token as string;
}

/**
 * Connect a Y.Doc to a whiteboard room. The server loads the scene from
 * Django and stores it, so the client never seeds the document.
 * With no room, the state is ready and session is null.
 */
export function useHocuspocusSession(
  roomId: string,
  config: RealtimeConfig | null,
): HocuspocusState {
  const [state, setState] = useState<HocuspocusState>({ status: "connecting" });
  const [attempt, setAttempt] = useState(0);
  const url = config?.url ?? "";
  const tokenUrl = config?.tokenUrl ?? "";

  useEffect(() => {
    if (!roomId || !url || !tokenUrl) {
      setState({ status: "ready", session: null, writable: true });
      return;
    }

    const doc = new Y.Doc();
    let generation = "";
    let writable = true;
    let closed = false;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;

    const reload = () => {
      if (closed) return;
      closed = true;
      setState({ status: "reloading" });
      reloadTimer = setTimeout(
        () => setAttempt((value) => value + 1),
        RELOAD_DELAY_MS,
      );
    };

    setState({ status: "connecting" });
    const provider = new HocuspocusProvider({
      websocketProvider: socketFor(url),
      name: roomId,
      // View replacement can briefly overlap providers for the same room.
      sessionAwareness: true,
      document: doc,
      token: async () =>
        JSON.stringify({ token: await fetchToken(tokenUrl), generation }),
      onSynced: () => {
        generation = String(doc.getMap("meta").get("generation") ?? "");
        if (!closed) {
          setState({ status: "ready", session: { doc, provider }, writable });
        }
      },
      onAuthenticated: ({ scope }) => {
        writable = scope !== "readonly";
        if (closed) return;
        setState((current) =>
          current.status === "ready" ? { ...current, writable } : current,
        );
      },
      onAuthenticationFailed: ({ reason }) => {
        if (closed) return;
        if (RELOAD_REASONS.has(reason)) {
          reload();
        } else {
          setState({ status: "denied" });
        }
      },
      onClose: ({ event }) => {
        // A room reset leaves the shared WebSocket open. Start a new room
        // session rather than waiting for the socket to reconnect.
        if (event.reason === "Reset Connection") reload();
      },
    });
    provider.attach();

    return () => {
      closed = true;
      clearTimeout(reloadTimer);
      provider.destroy();
      doc.destroy();
    };
  }, [roomId, url, tokenUrl, attempt]);

  return state;
}
