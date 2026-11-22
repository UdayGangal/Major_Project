import { useEffect, useState } from 'react';
import { query, valueOf } from '../services/prometheus';

const QUERIES = {
  healthyTargets: 'sum(up{job="rolling-demo"})',
  totalTargets: 'count(up{job="rolling-demo"})',
  throughput: 'sum(rate(rolling_demo_http_requests_total{job="rolling-demo"}[1m]))',
  latency: 'histogram_quantile(0.95, sum by (le) (rate(rolling_demo_http_request_duration_seconds_bucket{job="rolling-demo"}[1m]))) * 1000',
  errors: '100 * sum(rate(rolling_demo_http_requests_total{job="rolling-demo",status=~"5.."}[1m])) / clamp_min(sum(rate(rolling_demo_http_requests_total{job="rolling-demo"}[1m])), 0.000001)',
  vus: 'sum(k6_vus)'
};

const CARDS = [
  { key: 'targetHealth', label: 'Healthy Targets', unit: '', description: 'Prometheus scrape target availability' },
  { key: 'throughput', label: 'Request Throughput', unit: 'req/s', description: 'Application traffic per second' },
  { key: 'latency', label: 'P95 Latency', unit: 'ms', description: '95th percentile response time' },
  { key: 'errors', label: '5xx Error Rate', unit: '%', description: 'Server error percentage' },
  { key: 'vus', label: 'Active k6 Users', unit: 'VUs', description: 'Observed virtual users' }
];

function format(value, digits = 2) {
  return value == null || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits);
}

export default function InfrastructureMonitor() {
  const [metrics, setMetrics] = useState({});
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

        if (!active) return;

        const values = Object.fromEntries(results);
        const healthy = values.healthyTargets;
        const total = values.totalTargets;

        setMetrics({
          ...values,
          targetHealth:
            healthy == null || total == null
              ? null
              : `${format(healthy, 0)} / ${format(total, 0)}`
        });

        setError('');
      } catch (err) {
        if (active) setError(err.message || 'Unable to load infrastructure metrics');
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

  return (
    <section className="panel infrastructure-monitor">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">INFRASTRUCTURE OBSERVABILITY</p>
          <h2>Infrastructure Monitoring</h2>
          <p className="infrastructure-subtitle">
            Live application and Prometheus target health
          </p>
        </div>

        <span className="infrastructure-refresh">
          AUTO REFRESH · 5 SEC
        </span>
      </div>

      {error && (
        <p className="infrastructure-message">
          Metrics unavailable: {error}
        </p>
      )}

      <div className="infrastructure-grid">
        {CARDS.map(card => (
          <article className="infrastructure-card" key={card.key}>
            <span>{card.label}</span>
            <strong>
              {card.key === 'targetHealth'
                ? metrics.targetHealth || '—'
                : format(metrics[card.key])}
              {card.unit && <small>{card.unit}</small>}
            </strong>
            <p>{card.description}</p>
          </article>
        ))}
      </div>

      <div className="infrastructure-limits">
        <div>
          <strong>CPU Utilisation</strong>
          <span>Not exposed by the current monitored metrics</span>
        </div>
        <div>
          <strong>Memory Utilisation</strong>
          <span>Not exposed by the current monitored metrics</span>
        </div>
      </div>

      {!error && !loading && Object.values(metrics).every(value => value == null) && (
        <p className="infrastructure-message">
          No metric samples are currently available from this Prometheus job.
        </p>
      )}
    </section>
  );
}