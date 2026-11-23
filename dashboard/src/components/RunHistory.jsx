import { useEffect, useState } from 'react';

const API = 'http://127.0.0.1:8000';

function format(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) {
    return '—';
  }

  return Number(value).toFixed(digits);
}

export default function RunHistory() {
  const [technique, setTechnique] = useState('rolling');
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  async function loadRuns() {
    try {
      const response = await fetch(
        `${API}/api/history/${technique}`
      );

      if (!response.ok) {
        throw new Error('Unable to load run history');
      }

      setRuns(await response.json());
      setSelected(null);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadDetails(runId) {
    try {
      const response = await fetch(
        `${API}/api/history/run/${runId}`
      );

      if (!response.ok) {
        throw new Error('Unable to load experiment details');
      }

      setSelected(await response.json());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadRuns();
  }, [technique]);

  const samples = selected?.samples || [];

  const latest = samples.length
    ? samples[samples.length - 1]
    : null;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">POSTGRESQL EXPERIMENT RECORDS</p>
          <h2>Historical Experiment Results</h2>
        </div>

        <select
          value={technique}
          onChange={event => setTechnique(event.target.value)}
        >
          <option value="rolling">Rolling Update</option>
          <option value="recreate">Recreate</option>
          <option value="blue-green">Blue-Green</option>
          <option value="canary">Canary</option>
        </select>
      </div>

      {error && <p>{error}</p>}

      <div className="history-run-list">
        {runs.map(run => (
          <button
            type="button"
            key={run.run_id}
            onClick={() => loadDetails(run.run_id)}
          >
            <strong>{run.run_id.slice(0, 8)}</strong>
            <span>{run.status}</span>
            <span>
              {new Date(run.started_at).toLocaleString()}
            </span>
          </button>
        ))}

        {!runs.length && <p>No saved runs for this strategy yet.</p>}
      </div>

      {selected && (
        <>
          <h3>Selected experiment</h3>

          <div className="analytics-grid">
            <article className="analytics-card">
              <span>Total Requests</span>
              <strong>{format(latest?.total_requests, 0)}</strong>
            </article>

            <article className="analytics-card">
              <span>Failed Requests</span>
              <strong>{format(latest?.failed_requests, 0)}</strong>
            </article>

            <article className="analytics-card">
              <span>Error Rate</span>
              <strong>{format(latest?.error_rate)}%</strong>
            </article>

            <article className="analytics-card">
              <span>Average Latency</span>
              <strong>{format(latest?.avg_latency_ms)} ms</strong>
            </article>

            <article className="analytics-card">
              <span>P95 Latency</span>
              <strong>{format(latest?.p95_latency_ms)} ms</strong>
            </article>

            <article className="analytics-card">
              <span>P99 Latency</span>
              <strong>{format(latest?.p99_latency_ms)} ms</strong>
            </article>

            <article className="analytics-card">
              <span>CPU Cores</span>
              <strong>{format(latest?.cpu_cores)}</strong>
            </article>

            <article className="analytics-card">
              <span>Memory</span>
              <strong>
                {latest?.memory_bytes == null
                  ? '—'
                  : `${format(latest.memory_bytes / 1024 / 1024)} MB`}
              </strong>
            </article>
          </div>

          <h3>Availability and rollback</h3>

          <p>
            Downtime: {
              selected.evaluation?.downtime_seconds == null
                ? 'Not recorded'
                : `${format(selected.evaluation.downtime_seconds)} seconds`
            }
          </p>

          <p>
            Rollback time: {
              selected.evaluation?.rollback_time_seconds == null
                ? 'Not recorded'
                : `${format(selected.evaluation.rollback_time_seconds)} seconds`
            }
          </p>
        </>
      )}
    </section>
  );
}