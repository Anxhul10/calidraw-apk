import { X } from "lucide-react";

export default function CollaborationDialog({ onClose }) {
  return (
    <div className="collaboration-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="collaboration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collaboration-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="collaboration-dialog-header">
          <h2 id="collaboration-dialog-title">Live collaboration</h2>
          <button type="button" onClick={onClose} aria-label="Close collaboration dialog">
            <X size={18} />
          </button>
        </div>
        <p>
          Live collaboration is not configured for this application yet. Your drawing
          remains local and unchanged.
        </p>
        <div className="collaboration-dialog-actions">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
