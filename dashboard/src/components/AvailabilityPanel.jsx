
import { useCallback, useEffect, useState } from 'react';

const STRATEGY_NAMES = {
  rolling: 'Rolling Update',
  recreate: 'Recreate',
  'blue-green': 'Blue-Green',
  canary: 'Canary'
};

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';

  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString();
}

export default function AvailabilityPanel({ strategy = null }) {
  const [monitor, setMonitor] = useState(null);
  const [outages, setOutages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAvailability = useCallback(async () => {
    try {
      const params = new URLSearchParams();

      if (strategy) {
        params.set('strategy', strategy);
      }

      const [statusResponse, outagesResponse] = await Promise.all([
        fetch('/api/availability/status'),
        fetch(`/api/availability/outages?${params.toString()}`)
      ]);

      if (!statusResponse.ok) {
        throw new Error(`Status API returned ${statusResponse.status}`);
      }

      if (!outagesResponse.ok) {
        throw new Error(`Outages API returned ${outagesResponse.status}`);
      }

      const statusData = await statusResponse.json();
      const outagesData = await outagesResponse.json();

      setMonitor(statusData);
      setOutages(
        Array.isArray(outagesData)
          ? outagesData
          : outagesData.outages || []
      );

      setError('');
    } catch (err) {
      console.error('Availability fetch failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [strategy]);

  useEffect(() => {
    setLoading(true);
    fetchAvailability();

    const timer = setInterval(fetchAvailability, 3000);

    return () => clearInterval(timer);
  }, [fetchAvailability]);

  const isDown =
    monitor?.is_down === true ||
    monitor?.status === 'DOWN';

  const currentStartedAt =
    monitor?.outage_started_at ||
    monitor?.current_outage_started_at;

  const activeDuration = isDown && currentStartedAt
    ? Math.max(
        0,
        (Date.now() - new Date(currentStartedAt).getTime()) / 1000
      )
    : 0;

  const completedDowntime = outages.reduce(
    (total, outage) => total + Number(outage.downtime_seconds || 0),
    0
  );

  const totalDowntime = completedDowntime + activeDuration;

  const downCount = outages.length ;

  const filteredOutages = outages.filter(outage => {
    return !strategy || !outage.strategy || outage.strategy === strategy;
  });

  return (
    <section className="availability-panel">
      <div className="availability-header">
        <div>
          <p className="panel-kicker">HTTP AVAILABILITY MONITOR</p>
          <h2>Service Availability & Downtime</h2>
          <p className="availability-subtitle">
            Actual application HTTP health checks and recorded outages
          </p>
        </div>

        <div className={`availability-status ${isDown ? 'down' : 'up'}`}>
          <span className="availability-status-dot" />
          {loading
            ? 'Checking...'
            : isDown
              ? 'SERVICE DOWN'
              : 'SERVICE AVAILABLE'}
        </div>
      </div>

      {error && (
        <div className="availability-error">
          Could not load availability data: {error}
        </div>
      )}

      <div className="availability-stats">
        <div className="availability-stat">
          <span>Current Status</span>
          <strong className={isDown ? 'text-down' : 'text-up'}>
            {loading ? '—' : isDown ? 'DOWN' : 'UP'}
          </strong>
          <small>
            {monitor?.strategy
              ? STRATEGY_NAMES[monitor.strategy] || monitor.strategy
              : strategy
                ? STRATEGY_NAMES[strategy]
                : 'Currently monitored strategy'}
          </small>
        </div>

        <div className="availability-stat">
          <span>Total Outages</span>
          <strong>{loading ? '—' : downCount}</strong>
          <small>Recorded incidents</small>
        </div>

        <div className="availability-stat">
          <span>Total Downtime</span>
          <strong>{loading ? '—' : formatDuration(totalDowntime)}</strong>
          <small>Including an ongoing outage</small>
        </div>

        <div className="availability-stat">
          <span>Current Outage</span>
          <strong>{isDown ? formatDuration(activeDuration) : '—'}</strong>
          <small>{isDown ? 'Ongoing downtime' : 'No active outage'}</small>
        </div>
      </div>

      <div className="availability-history">
        <div className="availability-history-heading">
          <div>
            <h3>Outage History</h3>
            <p>
              {strategy
                ? `Incidents for ${STRATEGY_NAMES[strategy] || strategy}`
                : 'Incidents across monitored strategies'}
            </p>
          </div>

          <button
            type="button"
            className="availability-refresh"
            onClick={fetchAvailability}
          >
            ↻ Refresh
          </button>
        </div>

        {filteredOutages.length === 0 ? (
          <div className="availability-empty">
            {loading
              ? 'Loading outage records...'
              : 'No outage records found.'}
          </div>
        ) : (
          <div className="availability-table-wrap">
            <table className="availability-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Outage Started</th>
                  <th>Recovered At</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredOutages.map(outage => {
                  const active =
                    outage.status === 'DOWN' ||
                    !outage.recovered_at;

                  const duration = active && outage.outage_started_at
                    ? (Date.now() - new Date(outage.outage_started_at).getTime()) / 1000
                    : outage.downtime_seconds;

                  return (
                    <tr key={outage.id}>
                      <td>
                        {STRATEGY_NAMES[outage.strategy] ||
                          outage.strategy ||
                          '—'}
                      </td>
                      <td>{formatDate(outage.outage_started_at)}</td>
                      <td>{formatDate(outage.recovered_at)}</td>
                      <td>{formatDuration(duration)}</td>
                      <td>
                        <span className={`outage-badge ${active ? 'outage-active' : 'outage-recovered'}`}>
                          {active ? 'DOWN' : 'RECOVERED'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
