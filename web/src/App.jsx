import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import {
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
} from "lucide-react";

import "@excalidraw/excalidraw/index.css";
import "./App.css";
import { storage, workspaceName } from "./storage";

const editor = {
  flush: () => {},
};

function parseScene(raw) {
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

function cleanName(value) {
  return value.trim().replace(/\.excalidraw$/i, "");
}

function uniqueName(value, existingNames, ignoredName = null) {
  const base = cleanName(value);
  if (!base) return "";

  const occupied = new Set(
    existingNames.filter((name) => name !== ignoredName),
  );

  let candidate = `${base}.excalidraw`;
  let suffix = 1;

  while (occupied.has(candidate)) {
    candidate = `${base} (${suffix}).excalidraw`;
    suffix += 1;
  }

  return candidate;
}

function initializeFiles() {
  let names = storage.list();

  if (names.length === 0) {
    storage.create("Untitled 1.excalidraw");
    names = storage.list();
  }

  return names;
}

function DrawingEditor({ fileName, onThemeChange }) {
  const initialData = useMemo(
    () => parseScene(storage.read(fileName)),
    [fileName],
  );

  const timerRef = useRef(null);
  const latestRef = useRef(null);
  const flushRef = useRef(() => {});

  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timerRef.current);

      const latest = latestRef.current;
      if (!latest) return;

      const serialized = serializeAsJSON(
        latest.elements,
        latest.appState,
        latest.files,
        "local",
      );

      storage.write(fileName, serialized);
      latestRef.current = null;
    };

    flushRef.current = flush;
    editor.flush = flush;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      flush();
    };
  }, [fileName]);

  const handleChange = (elements, appState, files) => {
    if (appState?.theme) onThemeChange(appState.theme);

    latestRef.current = { elements, appState, files };
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => flushRef.current(), 800);
  };

  return (
    <Excalidraw
      initialData={initialData}
      onChange={handleChange}
    />
  );
}

function Explorer({
  files,
  activeFile,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onClose,
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingFile, setRenamingFile] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteFile, setDeleteFile] = useState(null);

  const submitCreate = (event) => {
    event.preventDefault();
    if (!newName.trim()) return;

    onCreate(newName);
    setNewName("");
    setCreating(false);
  };

  const beginRename = (name) => {
    setRenamingFile(name);
    setRenameValue(cleanName(name));
    setCreating(false);
    setDeleteFile(null);
  };

  const submitRename = (event) => {
    event.preventDefault();
    if (!renamingFile || !renameValue.trim()) return;

    onRename(renamingFile, renameValue);
    setRenamingFile(null);
    setRenameValue("");
  };

  return (
    <>
      <button
        className="explorer-backdrop"
        type="button"
        aria-label="Close Explorer"
        onClick={onClose}
      />

      <aside className="vscode-explorer" aria-label="Drawing Explorer">
        <header className="explorer-header">
          <div className="explorer-title">
            <FolderOpen size={17} />
            <span>EXPLORER</span>
          </div>

          <button
            className="explorer-icon-button"
            type="button"
            title="Close Explorer"
            aria-label="Close Explorer"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="explorer-workspace">
          <span className="explorer-section-label">WORKSPACE</span>
          <span className="explorer-workspace-name">{workspaceName}</span>
        </div>

        <div className="explorer-files-heading">
          <span>DRAWINGS</span>
          <button
            className="explorer-icon-button"
            type="button"
            title="New drawing"
            aria-label="Create new drawing"
            onClick={() => {
              setCreating(true);
              setRenamingFile(null);
              setDeleteFile(null);
            }}
          >
            <Plus size={18} />
          </button>
        </div>

        {creating && (
          <form className="explorer-inline-form" onSubmit={submitCreate}>
            <FileText size={16} />
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Drawing name"
              aria-label="New drawing name"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
            />
            <button type="submit" title="Create drawing" aria-label="Create drawing">
              <Check size={17} />
            </button>
            <button
              type="button"
              title="Cancel"
              aria-label="Cancel"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
            >
              <X size={17} />
            </button>
          </form>
        )}

        <div className="explorer-file-list">
          {files.map((name) => (
            <div
              key={name}
              className={`explorer-file-row ${activeFile === name ? "active" : ""}`}
            >
              {renamingFile === name ? (
                <form className="explorer-inline-form rename-form" onSubmit={submitRename}>
                  <FileText size={16} />
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    aria-label={`Rename ${name}`}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setRenamingFile(null);
                        setRenameValue("");
                      }
                    }}
                  />
                  <button type="submit" title="Save rename" aria-label="Save rename">
                    <Check size={17} />
                  </button>
                  <button
                    type="button"
                    title="Cancel rename"
                    aria-label="Cancel rename"
                    onClick={() => {
                      setRenamingFile(null);
                      setRenameValue("");
                    }}
                  >
                    <X size={17} />
                  </button>
                </form>
              ) : deleteFile === name ? (
                <div className="explorer-delete-confirm">
                  <span>Delete this drawing?</span>
                  <button
                    type="button"
                    title="Confirm delete"
                    aria-label="Confirm delete"
                    onClick={() => {
                      onDelete(name);
                      setDeleteFile(null);
                    }}
                  >
                    <Check size={17} />
                  </button>
                  <button
                    type="button"
                    title="Cancel delete"
                    aria-label="Cancel delete"
                    onClick={() => setDeleteFile(null)}
                  >
                    <X size={17} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="explorer-file-open"
                    type="button"
                    title={name}
                    onClick={() => onOpen(name)}
                  >
                    <FileText size={16} />
                    <span>{cleanName(name)}</span>
                  </button>

                  <div className="explorer-file-actions">
                    <button
                      className="explorer-icon-button file-action"
                      type="button"
                      title="Rename drawing"
                      aria-label={`Rename ${name}`}
                      onClick={() => beginRename(name)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="explorer-icon-button file-action delete-action"
                      type="button"
                      title="Delete drawing"
                      aria-label={`Delete ${name}`}
                      onClick={() => {
                        setDeleteFile(name);
                        setRenamingFile(null);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {files.length === 0 && (
            <p className="explorer-empty">No drawings yet. Press + to create one.</p>
          )}
        </div>

        <footer className="explorer-footer">
          {files.length} {files.length === 1 ? "drawing" : "drawings"}
        </footer>
      </aside>
    </>
  );
}

export default function App() {
  const [files, setFiles] = useState(initializeFiles);
  const [activeFile, setActiveFile] = useState(
    () => storage.list()[0] ?? null,
  );
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [theme, setTheme] = useState("light");

  const refreshFiles = useCallback(() => {
    setFiles(storage.list());
  }, []);

  useEffect(() => {
    const handleMainMenuClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const trigger = target.closest(".main-menu-trigger");
      if (!trigger) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setExplorerOpen((isOpen) => !isOpen);
    };

    document.addEventListener("click", handleMainMenuClick, true);

    return () => {
      document.removeEventListener("click", handleMainMenuClick, true);
    };
  }, []);

  const openDrawing = (name) => {
    if (name !== activeFile) {
      editor.flush();
      setActiveFile(name);
    }
    setExplorerOpen(false);
  };

  const createDrawing = (requestedName) => {
    const name = uniqueName(requestedName, files);
    if (!name) return;

    editor.flush();

    if (!storage.create(name)) {
      window.alert("Could not create drawing. Check whether this name already exists.");
      refreshFiles();
      return;
    }

    refreshFiles();
    setActiveFile(name);
    setExplorerOpen(false);
  };

  const renameDrawing = (oldName, requestedName) => {
    const newName = uniqueName(requestedName, files, oldName);
    if (!newName || newName === oldName) return;

    editor.flush();

    if (!storage.rename(oldName, newName)) {
      window.alert("Could not rename drawing.");
      refreshFiles();
      return;
    }

    refreshFiles();
    if (activeFile === oldName) setActiveFile(newName);
  };

  const removeDrawing = (name) => {
    if (name === activeFile) editor.flush();

    if (!storage.remove(name)) {
      window.alert("Could not delete drawing.");
      refreshFiles();
      return;
    }

    let remaining = storage.list();

    if (name === activeFile) {
      if (remaining.length === 0) {
        storage.create("Untitled 1.excalidraw");
        remaining = storage.list();
      }
      setActiveFile(remaining[0] ?? null);
    }

    setFiles(remaining);
  };

  const updateTheme = (nextTheme) => {
    if (nextTheme === "light" || nextTheme === "dark") {
      setTheme(nextTheme);
    }
  };

  return (
    <div className={`excalidraw-container app-theme-${theme}`}>
      {explorerOpen && (
        <Explorer
          files={files}
          activeFile={activeFile}
          onOpen={openDrawing}
          onCreate={createDrawing}
          onRename={renameDrawing}
          onDelete={removeDrawing}
          onClose={() => setExplorerOpen(false)}
        />
      )}

      <main className="excalidraw-editor">
        {activeFile ? (
          <DrawingEditor
            key={activeFile}
            fileName={activeFile}
            onThemeChange={updateTheme}
          />
        ) : (
          <div className="empty-editor">Create a drawing to get started.</div>
        )}
      </main>
    </div>
  );
}
