import { useEffect, useRef, useState } from "react";
import { exportToSvg } from "@excalidraw/excalidraw";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  MousePointerClick,
  Paperclip,
  SendHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { aiKeys, maskKey } from "../aiKeys";
import { askGemini, prepareAttachment } from "../gemini";
import { focusDrawingEditor } from "../editorState";
import "./AIAssistPanel.css";

const PROVIDER = { id: "gemini", name: "Gemini" };

/**
 * Non-modal Gemini chat panel. It floats over the canvas without a backdrop and
 * never takes focus on its own, so the drawing editor stays usable and focused
 * until you tap into the panel.
 */
export default function AIAssistPanel({
  messages,
  setMessages,
  selection,
  theme,
  onClose,
}) {
  const [savedKey, setSavedKey] = useState(() => aiKeys.get(PROVIDER.id));
  const [showKeySettings, setShowKeySettings] = useState(false);

  const close = () => {
    onClose();
    focusDrawingEditor();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };

  const keyView = !savedKey || showKeySettings;

  return (
    <section
      className="ai-panel"
      role="complementary"
      aria-label="AI Assist chat"
      onKeyDown={onKeyDown}
    >
      <header className="ai-panel-header">
        {keyView && savedKey ? (
          <button
            type="button"
            className="ai-panel-icon-button"
            onClick={() => setShowKeySettings(false)}
            aria-label="Back to chat"
            title="Back to chat"
          >
            <ArrowLeft size={16} />
          </button>
        ) : (
          <Sparkles size={16} className="ai-panel-accent" />
        )}
        <div className="ai-panel-title">
          <h2>AI Assist</h2>
          <span className={`ai-panel-chip ${savedKey ? "is-ready" : ""}`}>
            {PROVIDER.name}
          </span>
        </div>
        {!keyView && messages.length > 0 && (
          <button
            type="button"
            className="ai-panel-icon-button"
            onClick={() => setMessages([])}
            aria-label="Clear chat"
            title="Clear chat"
          >
            <Trash2 size={16} />
          </button>
        )}
        {!keyView && (
          <button
            type="button"
            className="ai-panel-icon-button"
            onClick={() => setShowKeySettings(true)}
            aria-label="Gemini API key"
            title="Gemini API key"
          >
            <KeyRound size={16} />
          </button>
        )}
        <button
          type="button"
          className="ai-panel-icon-button"
          onClick={close}
          aria-label="Close"
          title="Close"
        >
          <X size={16} />
        </button>
      </header>

      {keyView ? (
        <KeySettings
          savedKey={savedKey}
          onSave={(key) => {
            aiKeys.set(PROVIDER.id, key);
            setSavedKey(key.trim());
            setShowKeySettings(false);
          }}
          onDelete={() => {
            aiKeys.remove(PROVIDER.id);
            setSavedKey(null);
            setShowKeySettings(false);
          }}
        />
      ) : (
        <Chat
          apiKey={savedKey}
          messages={messages}
          setMessages={setMessages}
          selection={selection}
          theme={theme}
        />
      )}
    </section>
  );
}

function Chat({ apiKey, messages, setMessages, selection, theme }) {
  const [draft, setDraft] = useState("");
  // The selection object the user detached (or that was already sent). A new
  // selection is a new object, so it is attached again automatically.
  const [detached, setDetached] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const listRef = useRef(null);

  const attachment = selection && selection !== detached ? selection : null;
  const waiting = preparing || messages.some((m) => m.status === "pending");

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const canSend = Boolean(draft.trim() || attachment) && !waiting;

  const updateMessage = (id, patch) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );

  const send = async (event) => {
    event?.preventDefault();
    if (!canSend) return;
    const text = draft.trim();

    // Excalidraw elements are immutable (edits create new objects), so keeping
    // these references is a snapshot of what was selected at send time.
    let sent = null;
    if (attachment) {
      setPreparing(true);
      try {
        sent = {
          elements: attachment.elements,
          files: attachment.files,
          count: countShapes(attachment.elements),
          summary: describeElements(attachment.elements),
          gemini: await prepareAttachment(attachment), // PNG + element JSON
        };
      } catch (error) {
        console.error("[AI Assist] could not prepare the selection", error);
      } finally {
        setPreparing(false);
      }
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      attachment: sent,
    };
    const replyId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: replyId, role: "assistant", status: "pending", text: "" },
    ]);
    setDraft("");
    if (attachment) setDetached(attachment); // sent; don't attach it twice

    // The reply lands in DrawingEditor's state, so it still arrives if the
    // panel is closed while Gemini is answering.
    try {
      const reply = await askGemini({
        apiKey,
        messages: [...messages, userMessage],
      });
      updateMessage(replyId, { status: "done", text: reply });
    } catch (error) {
      updateMessage(replyId, {
        status: "error",
        text: error.message || "Something went wrong.",
      });
    }
  };

  const onComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) send(event);
  };

  return (
    <>
      <div className="ai-panel-messages" ref={listRef}>
        {messages.length === 0 ? (
          <div className="ai-panel-empty">
            <Sparkles size={20} className="ai-panel-accent" />
            <p>Ask Gemini about your drawing.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`ai-panel-message is-${m.role} ${
                m.status ? `is-${m.status}` : ""
              }`}
            >
              {m.attachment && (
                <div className="ai-panel-attachment">
                  <ElementsThumb
                    className="ai-panel-attachment-thumb"
                    elements={m.attachment.elements}
                    files={m.attachment.files}
                    theme={theme}
                  />
                  <span className="ai-panel-attachment-text">
                    {m.attachment.count} selected · {m.attachment.summary}
                  </span>
                </div>
              )}
              {m.status === "pending" ? (
                <span
                  className="ai-panel-typing"
                  aria-label="Gemini is thinking"
                >
                  <span />
                  <span />
                  <span />
                </span>
              ) : m.status === "error" ? (
                <span className="ai-panel-error">
                  <AlertCircle size={14} />
                  {m.text}
                </span>
              ) : (
                m.text
              )}
            </div>
          ))
        )}
      </div>

      <SelectionPreview
        selection={selection}
        attached={Boolean(attachment)}
        onDetach={() => setDetached(selection)}
        onAttach={() => setDetached(null)}
        theme={theme}
      />

      <form className="ai-panel-composer" onSubmit={send}>
        <textarea
          className="ai-panel-textarea"
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={
            attachment ? "Ask about the selected shapes" : "Message Gemini"
          }
          aria-label="Message Gemini"
        />
        <button
          type="submit"
          className="ai-panel-send"
          disabled={!canSend}
          aria-label="Send"
          title="Send"
        >
          <SendHorizontal size={16} />
        </button>
      </form>
    </>
  );
}

function KeySettings({ savedKey, onSave, onDelete }) {
  const [draft, setDraft] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (savedKey) {
    return (
      <div className="ai-panel-body">
        <div className="ai-panel-status is-ready">
          <KeyRound size={16} />
          <span>Gemini API key added</span>
        </div>
        <div className="ai-panel-masked" aria-label="Saved API key, hidden">
          {maskKey(savedKey)}
        </div>

        {confirmDelete ? (
          <div className="ai-panel-confirm">
            <p>Delete the saved Gemini API key?</p>
            <div className="ai-panel-actions">
              <button
                type="button"
                className="ai-panel-button"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ai-panel-button is-danger"
                onClick={onDelete}
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="ai-panel-actions">
            <button
              type="button"
              className="ai-panel-button is-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} />
              Delete API key
            </button>
          </div>
        )}
      </div>
    );
  }

  const save = (event) => {
    event.preventDefault();
    if (draft.trim()) onSave(draft);
  };

  return (
    <form className="ai-panel-body" onSubmit={save}>
      <div className="ai-panel-status">
        <KeyRound size={16} />
        <span>Add your Gemini API key to start chatting.</span>
      </div>

      <label className="ai-panel-label" htmlFor="ai-panel-key">
        Gemini API key
      </label>
      <div className="ai-panel-input-row">
        <input
          id="ai-panel-key"
          className="ai-panel-input"
          type={showDraft ? "text" : "password"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Paste your API key"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="ai-panel-icon-button"
          onClick={() => setShowDraft((v) => !v)}
          aria-label={showDraft ? "Hide key" : "Show key"}
        >
          {showDraft ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      <div className="ai-panel-actions">
        <button
          type="submit"
          className="ai-panel-button is-primary"
          disabled={!draft.trim()}
        >
          Save API key
        </button>
      </div>
    </form>
  );
}

const TYPE_LABELS = {
  rectangle: "rectangle",
  diamond: "diamond",
  ellipse: "ellipse",
  arrow: "arrow",
  line: "line",
  freedraw: "drawing",
  text: "text",
  image: "image",
  frame: "frame",
  magicframe: "frame",
  embeddable: "embed",
  iframe: "embed",
};

/** "rectangle, 2 text, arrow" */
function describeElements(elements) {
  const counts = new Map();
  for (const el of elements) {
    const label = TYPE_LABELS[el.type] ?? el.type;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, n]) => (n > 1 ? `${n} ${label}` : label))
    .join(", ");
}

/** Shapes that count as "selected" (a label inside a shape comes with it). */
function countShapes(elements) {
  return elements.filter((el) => !el.containerId).length;
}

/** SVG thumbnail of some Excalidraw elements, in the current theme. */
function ElementsThumb({ elements, files, theme, className, delay = 0 }) {
  const thumbRef = useRef(null);

  useEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const svg = await exportToSvg({
          elements,
          files,
          exportPadding: 8,
          appState: {
            exportBackground: false,
            exportWithDarkMode: theme === "dark",
          },
        });
        if (cancelled) return;
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        thumb.replaceChildren(svg);
      } catch (error) {
        console.error("[AI Assist] thumbnail failed", error);
      }
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [elements, files, theme, delay]);

  return <div className={className} ref={thumbRef} />;
}

/** The canvas selection, above the composer: attached to the next message unless detached. */
function SelectionPreview({ selection, attached, onDetach, onAttach, theme }) {
  if (!selection) {
    return (
      <div className="ai-panel-selection is-empty">
        <MousePointerClick size={14} />
        <span>Select shapes on the canvas to ask about them.</span>
      </div>
    );
  }

  const count = countShapes(selection.elements);

  if (!attached) {
    return (
      <div className="ai-panel-selection is-empty">
        <Paperclip size={14} />
        <span>{count} selected, not attached.</span>
        <button
          type="button"
          className="ai-panel-link-button"
          onClick={onAttach}
        >
          Attach
        </button>
      </div>
    );
  }

  return (
    <div
      className="ai-panel-selection"
      aria-label="Selected on canvas, attached"
    >
      {/* Debounced: dragging a selected shape changes it on every pointer move. */}
      <ElementsThumb
        className="ai-panel-selection-thumb"
        elements={selection.elements}
        files={selection.files}
        theme={theme}
        delay={150}
      />
      <div className="ai-panel-selection-text">
        <span className="ai-panel-selection-title">
          <Paperclip size={12} /> {count} selected
        </span>
        <span className="ai-panel-selection-types">
          {describeElements(selection.elements)}
        </span>
      </div>
      <button
        type="button"
        className="ai-panel-icon-button"
        onClick={onDetach}
        aria-label="Don't attach selection"
        title="Don't attach selection"
      >
        <X size={14} />
      </button>
    </div>
  );
}
