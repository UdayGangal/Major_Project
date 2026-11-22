import { useEffect, useState } from 'react';
import { query, valueOf } from '../services/prometheus';

const JOB = 'job="rolling-demo"';

const QUERIES = {
  p50: `histogram_quantile(0.50, sum by (le) (rate(rolling_demo_http_request_duration_seconds_bucket{${JOB}}[1m]))) * 1000`,
  p95: `histogram_quantile(0.95, sum by (le) (rate(rolling_demo_http_request_duration_seconds_bucket{${JOB}}[1m]))) * 1000`,
  p99: `histogram_quantile(0.99, sum by (le) (rate(rolling_demo_http_request_duration_seconds_bucket{${JOB}}[1m]))) * 1000`,
  throughput: `sum(rate(rolling_demo_http_requests_total{${JOB}}[1m]))`,
  errors: `100 * sum(rate(rolling_demo_http_requests_total{${JOB},status=~"5.."}[1m])) / clamp_min(sum(rate(rolling_demo_http_requests_total{${JOB}}[1m])), 0.000001)`
};

const METRICS = [
  { key: 'p50', label: 'P50 Latency', unit: 'ms', description: 'Median request latency' },
  { key: 'p95', label: 'P95 Latency', unit: 'ms', description: '95% of requests are faster' },
  { key: 'p99', label: 'P99 Latency', unit: 'ms', description: '99% of requests are faster' },
  { key: 'throughput', label: 'Throughput', unit: 'req/s', description: 'Requests handled per second' },
  { key: 'errors', label: '5xx Error Rate', unit: '%', description: 'Percentage of server errors' }
];

function display(value, digits = 2) {
  return value == null || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits);
}

export default function AdvancedAnalytics() {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const entries = await Promise.all(
          Object.entries(QUERIES).map(async ([key, promql]) => [
            key,
            valueOf(await query(promql))
          ])
        );

        if (active) {
          setValues(Object.fromEntries(entries));
          setError('');
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to load analytics');
          setLoading(false);
        }
      }
    };

    refresh();
    const timer = setInterval(refresh, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const hasData = Object.values(values).some(value => value != null);

  return (
    <section className="panel advanced-analytics">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">PERFORMANCE INTELLIGENCE</p>
          <h2>Advanced Analytics</h2>
          <p className="analytics-subtitle">
            Live Rolling Update workload metrics
          </p>
        </div>
        <span className="analytics-live">
          <i />
          AUTO REFRESH · 5 SEC
        </span>
      </div>

      {error && (
        <p className="analytics-message">
          Metrics unavailable: {error}
        </p>
      )}

      {!error && !loading && !hasData && (
        <p className="analytics-message">
          No metric samples available from the current Prometheus target.
        </p>
      )}

      <div className="analytics-grid">
        {METRICS.map(metric => (
          <article className="analytics-card" key={metric.key}>
            <span className="analytics-label">{metric.label}</span>
            <strong>
              {display(values[metric.key])}
              <small>{metric.unit}</small>
            </strong>
            <p>{metric.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}