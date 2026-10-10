// Excalidraw reads this when it loads a font. The directory of this module is
// the built bundle directory, which also holds the font files.
const assetPath = new URL(/* @vite-ignore */ ".", import.meta.url).href;

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

window.EXCALIDRAW_ASSET_PATH = assetPath;

// Excalidraw lists the local file and then https://esm.sh as one FontFace
// source. The browser checks every URL in that source against font-src.
// Keep same-origin and data URLs. Drop the CDN URL before FontFace sees it.
const NativeFontFace = window.FontFace;

function withoutRemoteFonts(source: string): string {
  const pieces = source.split(/,(?=\s*url\()/);
  const kept = pieces.filter((piece) => {
    const match = /url\(\s*(['"]?)([^'")]+)\1/.exec(piece);
    if (!match) return true;
    const raw = match[2].trim();
    if (raw.startsWith("data:")) return true;
    try {
      return new URL(raw, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  });
  return kept.join(",");
}

function LocalFontFace(
  family: string,
  source: string | BufferSource,
  descriptors?: FontFaceDescriptors,
): FontFace {
  const local = typeof source === "string" ? withoutRemoteFonts(source) : source;
  return new NativeFontFace(family, local, descriptors);
}

LocalFontFace.prototype = NativeFontFace.prototype;
window.FontFace = LocalFontFace as unknown as typeof FontFace;
