import { X } from "lucide-react";
import { useState } from "react";

export default function CollaborationDialog({
  onClose,
  onJoin,
  onLeave,
  roomId,
  status,
  error,
}) {
  const [roomValue, setRoomValue] = useState(roomId ?? "");

  const submit = (event) => {
    event.preventDefault();
    onJoin(roomValue);
  };

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
        {status === "connected" ? (
          <>
            <p>Connected to room <strong>{roomId}</strong>.</p>
            <div className="collaboration-dialog-actions">
              <button type="button" onClick={onLeave}>Leave room</button>
              <button type="button" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <p>Share a room ID with another user to edit the same drawing together.</p>
            <label className="collaboration-dialog-label" htmlFor="collaboration-room">
              Room ID
            </label>
            <input
              id="collaboration-room"
              value={roomValue}
              onChange={(event) => setRoomValue(event.target.value)}
              placeholder="e.g. project-sketch"
              autoComplete="off"
            />
            {status === "connecting" ? <p>Connecting…</p> : null}
            {error ? <p className="collaboration-dialog-error">{error}</p> : null}
            <div className="collaboration-dialog-actions">
              <button type="submit" disabled={!roomValue.trim() || status === "connecting"}>
                Join room
              </button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
