import { storage } from "./storage";

export const editor = { flush: () => {} };

export function parseScene(raw) {
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    return {
      elements: data.elements ?? [],
      appState: {
        ...data.appState,
        collaborators: [],
      },
      files: data.files ?? {},
    };
  } catch (error) {
    console.error("Failed to load drawing:", error);
    return null;
  }
}

export function cleanName(value) {
  return value.trim().replace(/\.excalidraw$/i, "");
}

export function uniqueName(value, existingNames, ignoredName = null) {
  const base = cleanName(value);
  if (!base) return "";

  const occupied = new Set(existingNames.filter((name) => name !== ignoredName));
  let candidate = `${base}.excalidraw`;
  let suffix = 1;

  while (occupied.has(candidate)) {
    candidate = `${base} (${suffix}).excalidraw`;
    suffix += 1;
  }

  return candidate;
}

export function initializeFiles() {
  let names = storage.list();
  if (names.length === 0) {
    storage.create("Untitled 1.excalidraw");
    names = storage.list();
  }
  return names;
}

export function downloadBlob(blob, fileName) {
  if (window.Android?.saveFile) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      if (comma === -1) return;
      window.Android.saveFile(
        fileName,
        blob.type || "application/octet-stream",
        dataUrl.slice(comma + 1),
      );
    };
    reader.onerror = () => console.error("Unable to prepare file for Android save");
    reader.readAsDataURL(blob);
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(text, fileName, mimeType = "application/json") {
  downloadBlob(new Blob([text], { type: mimeType }), fileName);
}
