
import { useState } from "react";

const API = "/api/traffic";

export default function TrafficControl({ strategy }) {
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function startTraffic() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: strategy || null }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Failed to start traffic");
      }

      setSessionId(result.session_id);
      setMessage(`Traffic running: ${result.strategies.join(", ")}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function stopTraffic() {
    if (!sessionId) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${API}/stop/${sessionId}`,
        { method: "POST" }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Failed to stop traffic");
      }

      setSessionId(null);
      setMessage("Traffic stopped");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="traffic-control">
      <button
        type="button"
        onClick={sessionId ? stopTraffic : startTraffic}
        disabled={loading}
        style={{
          padding: "10px 16px",
          borderRadius: "8px",
          border: "none",
          color: "white",
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
          background: sessionId ? "#dc4545" : "#16865b",
          opacity: loading ? 0.65 : 1,
        }}
      >
        {loading
          ? "Please wait..."
          : sessionId
            ? "■ Stop Traffic"
            : "▶ Generate Traffic"}
      </button>

      {message && <small>{message}</small>}
    </div>
  );
}
