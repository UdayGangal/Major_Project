
import { useCallback, useEffect, useState } from 'react';

import StatCard from './components/StatCard';
import ComparisonChart from './components/ComparisonChart';
import StrategySection from './components/StrategySection';
import PodTable from './components/PodTable';
import K6Metrics from './components/K6Metrics';

import {
  query,
  queryRange,
  valueOf,
  seriesValues,
  historyValues
} from './services/prometheus';

const STRATEGIES = ['rolling', 'recreate', 'blue-green'];

const STRATEGY_NAMES = {
  rolling: 'Rolling Update',
  recreate: 'Recreate',
  'blue-green': 'Blue-Green'
};

function metricQueries(strategy) {
  const selector = `{strategy="${strategy}"}`;

  return {
    healthy: `sum(up${selector})`,
    total: `count(up${selector})`,

    rps: `
      sum(rate(rolling_demo_http_requests_total${selector}[1m]))
    `,

    errors: `
      100 *
      sum(rate(rolling_demo_http_requests_total{strategy="${strategy}",status=~"5.."}[1m]))
      /
      clamp_min(
        sum(rate(rolling_demo_http_requests_total${selector}[1m])),
        0.000001
      )
    `,

    p95: `
      histogram_quantile(
        0.95,
        sum by (le) (
          rate(rolling_demo_http_request_duration_seconds_bucket${selector}[1m])
        )
      )
    `,

    podHealth: `max by (pod) (up${selector})`,

    podInfo: `
      max by (pod, version) (
        rolling_demo_application_info${selector}
      )
    `
  };
}

const format = (value, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits);

export default function App() {
  const [data, setData] = useState({});
  const [pods, setPods] = useState([]);
  const [k6Metrics, setK6Metrics] = useState([]);

  const [requestHistory, setRequestHistory] = useState([]);
  const [latencyHistory, setLatencyHistory] = useState([]);
  const [healthHistory, setHealthHistory] = useState([]);

  const [status, setStatus] = useState('Connecting to Prometheus...');
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 300;

    try {
      const strategyResults = await Promise.all(
        STRATEGIES.map(async strategy => {
          const q = metricQueries(strategy);

          const [
            healthy,
            total,
            rps,
            errors,
            p95,
            podHealth,
            podInfo
          ] = await Promise.all([
            query(q.healthy),
            query(q.total),
            query(q.rps),
            query(q.errors),
            query(q.p95),
            query(q.podHealth),
            query(q.podInfo)
          ]);

          const versions = new Map(
            podInfo.map(series => [
              series.metric.pod,
              series.metric.version
            ])
          );

          return {
            strategy,
            stats: {
              healthy: valueOf(healthy),
              total: valueOf(total),
              rps: valueOf(rps),
              errors: valueOf(errors),
              p95: valueOf(p95)
            },
            pods: podHealth.map(series => ({
              name: series.metric.pod,
              strategy,
              version: versions.get(series.metric.pod) || '—',
              healthy: Number(series.value[1]) === 1
            }))
          };
        })
      );

      const [
        requests,
        latency,
        health,
        k6
      ] = await Promise.all([
        queryRange(
          'sum by (strategy) (rate(rolling_demo_http_requests_total[30s]))',
          start,
          end
        ),

        queryRange(
          'histogram_quantile(0.95, sum by (strategy, le) (rate(rolling_demo_http_request_duration_seconds_bucket[1m])))',
          start,
          end
        ),

        queryRange(
          'sum by (strategy) (up{strategy=~"rolling|recreate|blue-green"})',
          start,
          end
        ),

        query('k6_vus')
      ]);

      setData(
        Object.fromEntries(
          strategyResults.map(item => [item.strategy, item])
        )
      );

      setPods(strategyResults.flatMap(item => item.pods));

      setRequestHistory(
        historyValues(requests).map(item => ({
          strategy: item.labels.strategy,
          values: item.values
        }))
      );

      setLatencyHistory(
        historyValues(latency).map(item => ({
          strategy: item.labels.strategy,
          values: item.values
        }))
      );

      setHealthHistory(
        historyValues(health).map(item => ({
          strategy: item.labels.strategy,
          values: item.values
        }))
      );

      setK6Metrics(seriesValues(k6));

      setStatus('Live');
      setLastUpdated(new Date());

    } catch (error) {
      console.error(error);
      setStatus(`Connection error: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    refresh();

    const timer = setInterval(refresh, 5000);

    return () => clearInterval(timer);
  }, [refresh]);

  const totals = STRATEGIES.reduce((result, strategy) => {
    const stats = data[strategy]?.stats;

    if (!stats) return result;

    result.healthy += stats.healthy || 0;
    result.total += stats.total || 0;

    return result;
  }, { healthy: 0, total: 0 });

  const totalRps = STRATEGIES.reduce(
    (sum, strategy) => sum + (data[strategy]?.stats.rps || 0),
    0
  );

  return (
    <main>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">CLOUD-NATIVE DEPLOYMENT MONITORING</p>
          <h1>Unified Deployment Dashboard</h1>
          <p className="subtitle">
            Real-time monitoring of Rolling, Recreate and Blue-Green deployments
          </p>
        </div>

        <div className={`connection ${status === 'Live' ? 'online' : ''}`}>
          <i />
          {status}
          <small>
            {lastUpdated
              ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
              : 'Waiting for metrics'}
          </small>
        </div>
      </header>

      <section className="overview-heading">
        <p className="panel-kicker">GLOBAL OVERVIEW</p>
        <h2>All deployment techniques at a glance</h2>
      </section>

      <section className="stats">
        <StatCard
          label="Healthy Pods"
          value={`${totals.healthy} / ${totals.total}`}
          detail="Across all strategies"
          tone="green"
        />

        <StatCard
          label="Total Requests / Sec"
          value={format(totalRps)}
          detail="Combined application traffic"
        />

        <StatCard
          label="Active k6 Series"
          value={k6Metrics.length}
          detail="Existing remote-write series"
          tone="orange"
        />
      </section>

      <ComparisonChart
        title="Request Rate Comparison"
        unit="requests / second"
        series={requestHistory}
      />

      <ComparisonChart
        title="P95 Latency Comparison"
        unit="milliseconds"
        series={latencyHistory.map(item => ({
          ...item,
          values: item.values.map(point => ({
            ...point,
            value: point.value * 1000
          }))
        }))}
      />

      <ComparisonChart
        title="Healthy Pods Comparison"
        unit="healthy pods"
        series={healthHistory}
      />

      <section className="overview-heading">
        <p className="panel-kicker">INDIVIDUAL STRATEGY METRICS</p>
        <h2>Deployment-wise performance</h2>
      </section>

      {STRATEGIES.map(strategy => (
        <StrategySection
          key={strategy}
          strategy={strategy}
          data={data[strategy] || {
            stats: {},
            pods: []
          }}
        />
      ))}

      <PodTable pods={pods} />

      <K6Metrics metrics={k6Metrics} />

      <footer>
        <p>Unified monitoring powered by Prometheus and React.</p>
        <p>Refresh interval: 5 seconds</p>
      </footer>
    </main>
  );
}
