import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  SendHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { aiKeys, maskKey } from "../aiKeys";
import { focusDrawingEditor } from "../editorState";
import "./AIAssistPanel.css";

const PROVIDER = { id: "gemini", name: "Gemini" };

/**
 * Non-modal Gemini chat panel. It floats over the canvas without a backdrop and
 * never takes focus on its own, so the drawing editor stays usable and focused
 * until you tap into the panel.
 */
export default function AIAssistPanel({ messages, setMessages, onClose }) {
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
        <Chat messages={messages} setMessages={setMessages} />
      )}
    </section>
  );
}

function Chat({ messages, setMessages }) {
  const [draft, setDraft] = useState("");
  const listRef = useRef(null);
  const replyTimer = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => () => window.clearTimeout(replyTimer.current), []);

  const send = (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setDraft("");

    // UI stage: Gemini is not called yet, so answer with a placeholder.
    replyTimer.current = window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Gemini isn't connected yet. This chat is a UI preview.",
        },
      ]);
    }, 500);
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
            <div key={m.id} className={`ai-panel-message is-${m.role}`}>
              {m.text}
            </div>
          ))
        )}
      </div>

      <form className="ai-panel-composer" onSubmit={send}>
        <textarea
          className="ai-panel-textarea"
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="Message Gemini"
          aria-label="Message Gemini"
        />
        <button
          type="submit"
          className="ai-panel-send"
          disabled={!draft.trim()}
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
