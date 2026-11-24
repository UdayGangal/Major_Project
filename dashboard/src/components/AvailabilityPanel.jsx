import { useCallback, useEffect, useState } from 'react';

const STRATEGIES = ['rolling', 'recreate', 'blue-green', 'canary'];
const NAMES = { rolling: 'Rolling Update', recreate: 'Recreate', 'blue-green': 'Blue-Green', canary: 'Canary' };
const PORTS = { rolling: 8081, recreate: 8082, 'blue-green': 8083, canary: 8084 };

function duration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function AvailabilityPanel({ strategy = null }) {
  const [statuses, setStatuses] = useState({});
  const [outages, setOutages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const visibleStrategies = strategy ? [strategy] : STRATEGIES;

  const fetchAvailability = useCallback(async () => {
    try {
      const params = strategy ? `?strategy=${encodeURIComponent(strategy)}` : '';
      const [statusResponse, outageResponse] = await Promise.all([
        fetch(`/api/availability/status${params}`),
        fetch(`/api/availability/outages${params}`),
      ]);
      if (!statusResponse.ok) throw new Error(`Status API error: ${statusResponse.status}`);
      if (!outageResponse.ok) throw new Error(`Outage API error: ${outageResponse.status}`);
      const statusData = await statusResponse.json();
      const outageData = await outageResponse.json();
      setStatuses(statusData || {});
      setOutages(Array.isArray(outageData) ? outageData : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [strategy]);

  // Opening a strategy workspace automatically starts (or reuses) its run.
  // No PowerShell POST command is needed. The API endpoint is idempotent.
  useEffect(() => {
    if (!strategy) return; // Overview remains read-only; don't launch 4 experiments.
    let cancelled = false;
    const ensureMonitoring = async () => {
      setStarting(true);
      try {
        const response = await fetch('/api/runs/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ technique: strategy }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.detail || `Could not start ${strategy} monitoring`);
        if (!cancelled) {
          setError('');
          await fetchAvailability();
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setStarting(false);
      }
    };
    ensureMonitoring();
    return () => { cancelled = true; };
  }, [strategy, fetchAvailability]);

  useEffect(() => {
    fetchAvailability();
    const interval = setInterval(fetchAvailability, 1000);
    return () => clearInterval(interval);
  }, [fetchAvailability]);

  return (
    <section className="availability-panel">
      <div className="availability-header"><div>
        <p className="panel-kicker">INDEPENDENT HTTP MONITORING</p>
        <h2>Service Availability &amp; Downtime</h2>
        <p className="availability-subtitle">Live checks follow each Kubernetes Service route, including the active Blue-Green selector and the Canary Istio ingress route.</p>
        {starting && <small>Starting availability monitoring automatically…</small>}
      </div></div>
      {error && <div className="availability-error">Unable to start/load availability: {error}</div>}
      <div className="availability-strategy-grid">
        {visibleStrategies.map((current) => {
          const item = statuses[current] || {};
          const active = item.monitoring_active === true;
          const down = item.site_status === 'DOWN';
          const checking = item.site_status === 'CHECKING';
          const hasChecks = Number(item.total_checks || 0) > 0;
          const siteLabel = loading ? 'LOADING' : down ? 'SERVICE DOWN' : checking ? 'CHECKING' : hasChecks ? 'SERVICE UP' : 'NOT MONITORED';
          const activeDowntime = down && item.outage_started_at ? Math.max(0, (Date.now() - new Date(item.outage_started_at).getTime()) / 1000) : 0;
          const totalDowntime = Number(item.total_downtime_seconds || 0);
          const strategyOutages = outages.filter((outage) => outage.strategy === current).sort((a, b) => new Date(b.outage_started_at) - new Date(a.outage_started_at));
          return (
            <article className="availability-strategy-card" key={current}>
              <div className="availability-header"><div>
                <p className="panel-kicker">{NAMES[current]}</p>
                <h3>{siteLabel}</h3>
                <small>Health endpoint: localhost:{PORTS[current]}/health</small>
              </div><span className={`availability-status ${down ? 'down' : hasChecks && !checking ? 'up' : 'checking'}`}>
                <span className="availability-status-dot" />{down ? 'DOWN' : hasChecks ? 'UP' : '—'}
              </span></div>
              <div className="availability-stats">
                <div className="availability-stat"><span>Current Status</span><strong className={down ? 'text-down' : hasChecks ? 'text-up' : ''}>{down ? 'DOWN' : hasChecks ? 'UP' : 'NOT MONITORED'}</strong><small>{active ? 'Live monitoring' : starting ? 'Starting monitor' : item.status === 'COMPLETED' ? 'Last run completed' : 'No active monitoring run'}</small></div>
                <div className="availability-stat"><span>Total Outages</span><strong>{item.outage_count ?? 0}</strong><small>This strategy only</small></div>
                <div className="availability-stat"><span>Total Downtime</span><strong>{duration(totalDowntime)}</strong><small>Recorded for this run</small></div>
                <div className="availability-stat"><span>Current Outage</span><strong>{down ? duration(activeDowntime) : '—'}</strong><small>{down ? `Since ${formatDate(item.outage_started_at)}` : 'No active outage'}</small></div>
                <div className="availability-stat"><span>Health Checks</span><strong>{item.total_checks ?? 0}</strong><small>{item.failed_checks ?? 0} failed checks</small></div>
                <div className="availability-stat"><span>Last Recovery</span><strong>{formatDate(item.last_recovered_at)}</strong><small>Most recent recovery</small></div>
              </div>
              <div className="availability-history"><h3>{NAMES[current]} — Outage History</h3>
                {strategyOutages.length === 0 ? <div className="availability-empty">No outage records for this strategy.</div> :
                  <div className="availability-table-wrap"><table className="availability-table"><thead><tr><th>Outage Started</th><th>Recovered At</th><th>Downtime</th><th>Status</th></tr></thead><tbody>
                    {strategyOutages.map((outage) => {
                      const ongoing = !outage.recovered_at || outage.status === 'DOWN';
                      const elapsed = ongoing ? Math.max(0, (Date.now() - new Date(outage.outage_started_at).getTime()) / 1000) : outage.downtime_seconds;
                      return <tr key={outage.id}><td>{formatDate(outage.outage_started_at)}</td><td>{formatDate(outage.recovered_at)}</td><td>{duration(elapsed)}</td><td><span className={`outage-badge ${ongoing ? 'outage-active' : 'outage-recovered'}`}>{ongoing ? 'DOWN' : 'RECOVERED'}</span></td></tr>;
                    })}
                  </tbody></table></div>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
