import { useEffect, useState } from 'react';
import { query, valueOf } from '../services/prometheus';

const QUERIES = {
  healthy: 'sum(up{job="rolling-demo"})',
  total: 'count(up{job="rolling-demo"})',
  errors: '100 * sum(rate(rolling_demo_http_requests_total{job="rolling-demo",status=~"5.."}[1m])) / clamp_min(sum(rate(rolling_demo_http_requests_total{job="rolling-demo"}[1m])), 0.000001)',
  p95: 'histogram_quantile(0.95, sum by (le) (rate(rolling_demo_http_request_duration_seconds_bucket{job="rolling-demo"}[1m]))) * 1000'
};

const RULES = [
  {
    id: 'targets',
    title: 'Prometheus Target Health',
    description: 'Checks whether all application targets are healthy.',
    threshold: 'All targets should be healthy'
  },
  {
    id: 'errors',
    title: 'HTTP 5xx Error Rate',
    description: 'Warns when the server error rate exceeds 1%.',
    threshold: 'Warning above 1%'
  },
  {
    id: 'latency',
    title: 'P95 Response Latency',
    description: 'Warns when P95 response latency exceeds 500 ms.',
    threshold: 'Warning above 500 ms'
  }
];

function evaluate(values) {
  const alerts = [];

  const healthy = values.healthy;
  const total = values.total;

  let targetStatus = 'UNKNOWN';
  let targetMessage = 'Waiting for target metrics';

  if (healthy != null && total != null && total > 0) {
    if (healthy === total) {
      targetStatus = 'NORMAL';
      targetMessage = `${healthy} of ${total} targets are healthy`;
    } else if (healthy === 0) {
      targetStatus = 'CRITICAL';
      targetMessage = 'All monitored targets are unavailable';
    } else {
      targetStatus = 'WARNING';
      targetMessage = `${healthy} of ${total} targets are healthy`;
    }
  }

  alerts.push({
    ...RULES[0],
    status: targetStatus,
    message: targetMessage
  });

  const errorRate = values.errors;

  alerts.push({
    ...RULES[1],
    status:
      errorRate == null
        ? 'UNKNOWN'
        : errorRate > 1
          ? 'WARNING'
          : 'NORMAL',
    message:
      errorRate == null
        ? 'Waiting for request metrics'
        : `Current error rate: ${errorRate.toFixed(2)}%`
  });

  const latency = values.p95;

  alerts.push({
    ...RULES[2],
    status:
      latency == null
        ? 'UNKNOWN'
        : latency > 500
          ? 'WARNING'
          : 'NORMAL',
    message:
      latency == null
        ? 'Waiting for latency metrics'
        : `Current P95 latency: ${latency.toFixed(2)} ms`
  });

  return alerts;
}

export default function AlertCentre() {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const results = await Promise.all(
          Object.entries(QUERIES).map(async ([key, promql]) => [
            key,
            valueOf(await query(promql))
          ])
        );

        if (active) {
          setValues(Object.fromEntries(results));
          setError('');
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to evaluate alert conditions');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    refresh();

    const timer = setInterval(refresh, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const alerts = evaluate(values);
  const activeAlerts = alerts.filter(
    alert => ['WARNING', 'CRITICAL'].includes(alert.status)
  );

  const criticalCount = alerts.filter(
    alert => alert.status === 'CRITICAL'
  ).length;

  const unknownCount = alerts.filter(
    alert => alert.status === 'UNKNOWN'
  ).length;

  const overallStatus =
    criticalCount > 0
      ? 'CRITICAL'
      : activeAlerts.length > 0
        ? 'ATTENTION REQUIRED'
        : unknownCount === alerts.length
          ? 'AWAITING DATA'
          : unknownCount > 0
            ? 'PARTIAL DATA'
            : 'ALL CLEAR';

  return (
    <section className="panel alert-centre">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">SYSTEM ALERTS</p>
          <h2>Alert Centre</h2>
          <p className="alert-subtitle">
            Live evaluation of application health conditions
          </p>
        </div>

        <span className={`alert-overall ${criticalCount ? 'critical' : activeAlerts.length ? 'warning' : ''}`}>
          {overallStatus}
        </span>
      </div>

      <div className="alert-summary-grid">
        <div className="alert-summary-card">
          <span>Active Alerts</span>
          <strong>{activeAlerts.length}</strong>
        </div>

        <div className="alert-summary-card">
          <span>Critical</span>
          <strong>{criticalCount}</strong>
        </div>

        <div className="alert-summary-card">
          <span>Awaiting Data</span>
          <strong>{unknownCount}</strong>
        </div>
      </div>

      {error && (
        <p className="alert-error-message">
          Prometheus query error: {error}
        </p>
      )}

      <div className="alert-list">
        {alerts.map(alert => (
          <article
            className={`alert-item ${alert.status.toLowerCase()}`}
            key={alert.id}
          >
            <div className="alert-indicator" />

            <div className="alert-item-content">
              <div className="alert-item-heading">
                <h3>{alert.title}</h3>
                <span className={`alert-status ${alert.status.toLowerCase()}`}>
                  {alert.status}
                </span>
              </div>

              <p>{alert.description}</p>
              <strong>{alert.message}</strong>
              <small>{alert.threshold}</small>
            </div>
          </article>
        ))}
      </div>

      <div className="alert-footer">
        {loading
          ? 'Loading monitoring data...'
          : 'Frontend evaluation · Auto refresh every 5 seconds'}
      </div>

      <p className="alert-disclaimer">
        These are dashboard-side threshold checks, not configured
        Prometheus Alertmanager notifications.
      </p>
    </section>
  );
}