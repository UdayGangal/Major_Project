
import { useCallback, useEffect, useState } from "react";

const API = "/api/canary/adaptive";

const cardStyle = {
  background: "#111827",
  border: "1px solid #263247",
  borderRadius: "12px",
  padding: "18px",
  color: "#f1f5f9",
};

const muted = { color: "#94a3b8", fontSize: "13px" };

function Metric({ label, value, suffix = "" }) {
  return (
    <div style={cardStyle}>
      <div style={muted}>{label}</div>
      <div style={{
        fontSize: "25px",
        fontWeight: 700,
        marginTop: "9px",
      }}>
        {value}{suffix}
      </div>
    </div>
  );
}

function TrafficBar({ status }) {
  const v1 = Number(status.v1_weight) || 0;
  const v2 = Number(status.v2_weight) || 0;

  const totalRps =
    Number(status.observed_v1_requests_per_second || 0) +
    Number(status.observed_v2_requests_per_second || 0);

  const actualV2 = totalRps > 0
    ? Number(status.observed_v2_requests_per_second || 0)
      / totalRps * 100
    : 0;

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Live Canary Traffic Distribution</h3>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "10px",
      }}>
        <strong style={{ color: "#60a5fa" }}>
          v1: {v1}%
        </strong>
        <strong style={{ color: "#34d399" }}>
          v2: {v2}%
        </strong>
      </div>

      <div style={{
        display: "flex",
        height: "22px",
        overflow: "hidden",
        borderRadius: "8px",
        background: "#263247",
      }}>
        <div style={{
          width: `${v1}%`,
          background: "#438cf5",
          transition: "width 0.6s ease",
        }} />
        <div style={{
          width: `${v2}%`,
          background: "#16a078",
          transition: "width 0.6s ease",
        }} />
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: "18px",
      }}>
        <span style={muted}>Configured Istio weights</span>
        <strong>{v1}/{v2}</strong>
      </div>

      <div style={{
        marginTop: "15px",
        paddingTop: "14px",
        borderTop: "1px solid #263247",
      }}>
        <div style={muted}>Observed request distribution</div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "8px",
        }}>
          <span>v1: {(100 - actualV2).toFixed(2)}%</span>
          <span>v2: {actualV2.toFixed(2)}%</span>
        </div>

        <div style={muted}>
          Based on observed requests per second, not configured weights.
        </div>
      </div>
    </div>
  );
}

export default function AdaptiveCanaryPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API}/status`);

      if (!response.ok) {
        throw new Error(`Status API returned ${response.status}`);
      }

      const result = await response.json();
      setStatus(result);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();

    const timer = setInterval(refresh, 2000);

    return () => clearInterval(timer);
  }, [refresh]);

  async function controllerAction(action) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(action === "start"
          ? {
              body: JSON.stringify({
                initial_v2_weight: 10,
              }),
            }
          : {}),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Controller request failed");
      }

      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!status) {
    return (
      <section style={cardStyle}>
        <h2>Adaptive Canary</h2>
        <p style={muted}>Connecting to adaptive controller...</p>
        {error && <p style={{ color: "#f87171" }}>{error}</p>}
      </section>
    );
  }

  const history = [...(status.history || [])].reverse();

  return (
    <section style={{
      display: "grid",
      gap: "18px",
      marginTop: "22px",
      color: "#f1f5f9",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
      }}>
        <div>
          <h2 style={{ marginBottom: "5px" }}>
            Adaptive Canary Traffic Controller
          </h2>
          <span style={muted}>
            Live Istio traffic management and version monitoring
          </span>
        </div>

        <span style={{
          padding: "7px 12px",
          borderRadius: "20px",
          background: status.running ? "#064e3b" : "#374151",
          color: status.running ? "#6ee7b7" : "#d1d5db",
          fontWeight: 700,
          fontSize: "12px",
        }}>
          {status.running ? "● RUNNING" : "● STOPPED"}
        </span>
      </div>

      <TrafficBar status={status} />

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: "12px",
      }}>
        <Metric
          label="v1 Requests / Sec"
          value={Number(status.observed_v1_requests_per_second || 0).toFixed(2)}
        />

        <Metric
          label="v2 Requests / Sec"
          value={Number(status.observed_v2_requests_per_second || 0).toFixed(2)}
        />

        <Metric
          label="v1 Error Rate"
          value={Number(status.v1_error_rate || 0).toFixed(2)}
          suffix="%"
        />

        <Metric
          label="v2 Error Rate"
          value={Number(status.v2_error_rate || 0).toFixed(2)}
          suffix="%"
        />

        <Metric
          label="v1 P95 Latency"
          value={Number(status.v1_p95_ms || 0).toFixed(2)}
          suffix=" ms"
        />

        <Metric
          label="v2 P95 Latency"
          value={Number(status.v2_p95_ms || 0).toFixed(2)}
          suffix=" ms"
        />
      </div>

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
      }}>
        <button
          type="button"
          disabled={loading || status.running}
          onClick={() => controllerAction("start")}
          style={{
            padding: "11px 18px",
            border: 0,
            borderRadius: "8px",
            color: "white",
            background: "#16865b",
            cursor: loading || status.running ? "not-allowed" : "pointer",
            opacity: loading || status.running ? 0.55 : 1,
          }}
        >
          {loading ? "Please wait..." : "▶ Start Adaptive Canary"}
        </button>

        <button
          type="button"
          disabled={loading || !status.running}
          onClick={() => controllerAction("stop")}
          style={{
            padding: "11px 18px",
            border: 0,
            borderRadius: "8px",
            color: "white",
            background: "#dc4545",
            cursor: loading || !status.running ? "not-allowed" : "pointer",
            opacity: loading || !status.running ? 0.55 : 1,
          }}
        >
          ■ Stop Controller
        </button>

        <button
          type="button"
          onClick={refresh}
          style={{
            padding: "11px 18px",
            border: "1px solid #475569",
            borderRadius: "8px",
            color: "white",
            background: "#263247",
            cursor: "pointer",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ color: "#f87171" }}>
          {error}
        </div>
      )}

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Controller Decision</h3>

        <div style={{
          fontSize: "20px",
          fontWeight: 700,
          color: "#60a5fa",
        }}>
          {status.decision}
        </div>

        <p>{status.reason}</p>

        <div style={muted}>
          Next calculated traffic increment: {status.next_weight_step || 0}%
        </div>

        <div style={muted}>
          Last evaluation: {status.last_evaluated_at || "Not evaluated"}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Traffic Shift History</h3>

        {history.length === 0 ? (
          <p style={muted}>No traffic decisions recorded yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "13px",
            }}>
              <thead>
                <tr style={{ color: "#94a3b8" }}>
                  <th style={{ padding: "10px" }}>Time</th>
                  <th style={{ padding: "10px" }}>Decision</th>
                  <th style={{ padding: "10px" }}>v1</th>
                  <th style={{ padding: "10px" }}>v2</th>
                  <th style={{ padding: "10px" }}>Reason</th>
                </tr>
              </thead>

              <tbody>
                {history.map((item, index) => (
                  <tr key={`${item.timestamp}-${index}`}>
                    <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: "10px", fontWeight: 700 }}>
                      {item.decision}
                    </td>
                    <td style={{ padding: "10px" }}>
                      {item.v1_weight}%
                    </td>
                    <td style={{ padding: "10px" }}>
                      {item.v2_weight}%
                    </td>
                    <td style={{ padding: "10px", minWidth: "220px" }}>
                      {item.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={muted}>
        Dashboard refreshes every 2 seconds.
        {lastUpdated && ` Last refreshed at ${lastUpdated.toLocaleTimeString()}.`}
      </p>
    </section>
  );
}
