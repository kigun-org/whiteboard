import "../whiteboard-editor";

const params = new URLSearchParams(window.location.search);
const board = document.createElement("whiteboard-editor");
const room = params.get("room");
if (room) {
  board.setAttribute("room-id", room);
  board.setAttribute("realtime-url", params.get("ws") || "ws://127.0.0.1:14123");
  board.setAttribute("token-url", params.get("token") || "http://127.0.0.1:14123/token");
}
const scene = document.createElement("script");
scene.type = "application/json";
scene.textContent = params.get("scene") || '{"elements":[]}';
board.append(scene);
document.querySelector("#root")?.append(board);
