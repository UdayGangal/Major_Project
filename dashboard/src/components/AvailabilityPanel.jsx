
import { useCallback, useEffect, useState } from 'react';

const STRATEGIES = [
  'rolling',
  'recreate',
  'blue-green',
  'canary'
];

const STRATEGY_NAMES = {
  rolling: 'Rolling Update',
  recreate: 'Recreate',
  'blue-green': 'Blue-Green',
  canary: 'Canary'
};

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) {
    return '—';
  }

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
  const [statuses, setStatuses] = useState({});
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
        fetch(`/api/availability/status?${params.toString()}`),
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

      setStatuses(statusData || {});
      setOutages(Array.isArray(outagesData) ? outagesData : []);
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

    const timer = setInterval(fetchAvailability, 2000);

    return () => clearInterval(timer);
  }, [fetchAvailability]);

  const visibleStrategies = strategy ? [strategy] : STRATEGIES;

  return (
    <section className="availability-panel">
      <div className="availability-header">
        <div>
          <p className="panel-kicker">HTTP AVAILABILITY MONITOR</p>
          <h2>Service Availability & Downtime</h2>
          <p className="availability-subtitle">
            Independent live health monitoring for each deployment strategy
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

      {error && (
        <div className="availability-error">
          Could not load availability data: {error}
        </div>
      )}

      <div className="availability-strategy-grid">
        {visibleStrategies.map(currentStrategy => {
          const item = statuses[currentStrategy] || {};
          const isDown = item.is_down === true;

          const activeDuration =
            isDown && item.outage_started_at
              ? Math.max(
                  0,
                  (Date.now() - new Date(item.outage_started_at).getTime()) / 1000
                )
              : 0;

          const totalDowntime = Number(
            item.total_downtime_seconds || 0
          );

          const strategyOutages = outages.filter(
            outage => outage.strategy === currentStrategy
          );

          return (
            <div
              className="availability-strategy-card"
              key={currentStrategy}
            >
              <div className="availability-header">
                <div>
                  <p className="panel-kicker">
                    {STRATEGY_NAMES[currentStrategy]}
                  </p>
                  <h3>
                    {loading
                      ? 'Checking...'
                      : isDown
                        ? 'SERVICE DOWN'
                        : item.monitoring_active
                          ? 'SERVICE UP'
                          : item.status === 'COMPLETED'
                            ? 'MONITORING COMPLETED'
                            : 'NOT MONITORED'}
                  </h3>
                </div>

                <span
                  className={`availability-status ${isDown ? 'down' : 'up'}`}
                >
                  <span className="availability-status-dot" />
                  {isDown ? 'DOWN' : 'UP'}
                </span>
              </div>

              <div className="availability-stats">
                <div className="availability-stat">
                  <span>Current Status</span>
                  <strong className={isDown ? 'text-down' : 'text-up'}>
                    {isDown ? 'DOWN' : 'UP'}
                  </strong>
                  <small>
                    {item.monitoring_active
                      ? 'Live monitoring'
                      : item.status === 'COMPLETED'
                        ? 'Last run completed'
                        : 'No active run'}
                  </small>
                </div>

                <div className="availability-stat">
                  <span>Total Outages</span>
                  <strong>{item.outage_count ?? 0}</strong>
                  <small>For this deployment run</small>
                </div>

                <div className="availability-stat">
                  <span>Total Downtime</span>
                  <strong>
                    {formatDuration(totalDowntime)}
                  </strong>
                  <small>Recorded for this run</small>
                </div>

                <div className="availability-stat">
                  <span>Current Outage</span>
                  <strong>
                    {isDown
                      ? formatDuration(activeDuration)
                      : '—'}
                  </strong>
                  <small>
                    {isDown
                      ? `Since ${formatDate(item.outage_started_at)}`
                      : 'No active outage'}
                  </small>
                </div>

                <div className="availability-stat">
                  <span>Health Checks</span>
                  <strong>{item.total_checks ?? 0}</strong>
                  <small>
                    {item.failed_checks ?? 0} failed checks
                  </small>
                </div>

                <div className="availability-stat">
                  <span>Last Recovery</span>
                  <strong>
                    {formatDate(item.last_recovered_at)}
                  </strong>
                  <small>Most recent recovery in this run</small>
                </div>
              </div>

              <div className="availability-history">
                <h3>Outage History</h3>

                {strategyOutages.length === 0 ? (
                  <div className="availability-empty">
                    No outage records for this strategy.
                  </div>
                ) : (
                  <div className="availability-table-wrap">
                    <table className="availability-table">
                      <thead>
                        <tr>
                          <th>Outage Started</th>
                          <th>Recovered At</th>
                          <th>Duration</th>
                          <th>Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {strategyOutages.map(outage => {
                          const active =
                            outage.status === 'DOWN' ||
                            !outage.recovered_at;

                          const duration = active
                            ? (
                                Date.now() -
                                new Date(outage.outage_started_at).getTime()
                              ) / 1000
                            : outage.downtime_seconds;

                          return (
                            <tr key={outage.id}>
                              <td>
                                {formatDate(outage.outage_started_at)}
                              </td>
                              <td>
                                {formatDate(outage.recovered_at)}
                              </td>
                              <td>{formatDuration(duration)}</td>
                              <td>
                                <span
                                  className={`outage-badge ${
                                    active
                                      ? 'outage-active'
                                      : 'outage-recovered'
                                  }`}
                                >
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
