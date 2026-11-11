import { useRef, useState } from "react";
import {
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import {
  Check,
  Download,
  FileImage,
  FileJson,
  FileText,
  FolderOpen,
  HelpCircle,
  Moon,
  Pencil,
  Plus,
  Sun,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";

import ActionRow from "./ActionRow";
import { cleanName, downloadBlob, downloadText, editor } from "../editorState";
import { workspaceName } from "../storage";

export default function Explorer({
  files,
  activeFile,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onClose,
  api,
  theme,
  onThemeChange,
  onCollaborate,
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingFile, setRenamingFile] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteFile, setDeleteFile] = useState(null);
  const importInputRef = useRef(null);

  const getScene = () => {
    if (!api) return null;
    return {
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    };
  };

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

  const importScene = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !api) return;

    try {
      const data = JSON.parse(await file.text());
      api.updateScene({
        elements: data.elements ?? [],
        appState: { ...data.appState, collaborators: [] },
        files: data.files ?? {},
      });
      onClose();
    } catch (error) {
      console.error("Unable to import drawing:", error);
      window.alert("This file is not a valid Excalidraw scene.");
    } finally {
      event.target.value = "";
    }
  };

  const exportJson = () => {
    const scene = getScene();
    if (!scene) return;
    const json = serializeAsJSON(
      scene.elements,
      scene.appState,
      scene.files,
      "local",
    );
    downloadText(json, `${cleanName(activeFile)}.excalidraw`);
    onClose();
  };

  const exportPng = async () => {
    const scene = getScene();
    if (!scene) return;
    try {
      const blob = await exportToBlob({
        elements: scene.elements,
        appState: scene.appState,
        files: scene.files,
        mimeType: "image/png",
        exportPadding: 16,
      });
      downloadBlob(blob, `${cleanName(activeFile)}.png`);
      onClose();
    } catch (error) {
      console.error("PNG export failed:", error);
      window.alert("Could not export this drawing as an image.");
    }
  };

  const exportSvgFile = async () => {
    const scene = getScene();
    if (!scene) return;
    try {
      const svg = await exportToSvg({
        elements: scene.elements,
        appState: scene.appState,
        files: scene.files,
      });
      downloadBlob(
        new Blob([svg.outerHTML], { type: "image/svg+xml" }),
        `${cleanName(activeFile)}.svg`,
      );
      onClose();
    } catch (error) {
      console.error("SVG export failed:", error);
      window.alert("Could not export this drawing as SVG.");
    }
  };

  const clearCanvas = () => {
    if (!api) return;
    if (window.confirm("Clear the current canvas? This cannot be undone.")) {
      api.resetScene();
      editor.flush();
      onClose();
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    api?.updateScene({ appState: { theme: nextTheme } });
    onThemeChange(nextTheme);
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

        <section className="explorer-actions-section" aria-label="Editor actions">
          <div className="explorer-actions-heading">EDITOR ACTIONS</div>
          <div className="explorer-actions-list">
            <ActionRow
              icon={Upload}
              label="Open drawing…"
              onClick={() => importInputRef.current?.click()}
            />
            <ActionRow icon={FileJson} label="Export as Excalidraw" onClick={exportJson} />
            <ActionRow icon={FileImage} label="Export as PNG" onClick={exportPng} />
            <ActionRow
              icon={UsersRound}
              label="Live collaboration"
              onClick={onCollaborate}
            />
            <ActionRow icon={Download} label="Export as SVG" onClick={exportSvgFile} />
            <ActionRow icon={Trash2} label="Clear canvas" onClick={clearCanvas} />
          </div>

          <div className="explorer-actions-heading explorer-appearance-heading">
            APPEARANCE
          </div>
          <div className="explorer-actions-list">
            <ActionRow
              icon={theme === "dark" ? Sun : Moon}
              label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              onClick={toggleTheme}
            />
          </div>

          <div className="explorer-actions-heading explorer-appearance-heading">
            SUPPORT
          </div>
          <div className="explorer-actions-list">
            <ActionRow
              icon={HelpCircle}
              label="Help & documentation"
              onClick={() => {
                const url = "https://github.com/Anxhul10/excalidraw-apk";
                if (window.Android?.openExternalUrl) {
                  window.Android.openExternalUrl(url);
                } else {
                  window.open(url, "_blank", "noopener,noreferrer");
                }
              }}
            />
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".excalidraw,.json,application/json"
            hidden
            onChange={importScene}
          />
        </section>
      </aside>
    </>
  );
}
