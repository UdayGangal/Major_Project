
import { useCallback, useEffect, useState } from 'react';

import Sidebar from './components/Sidebar';
import StatCard from './components/StatCard';
import ComparisonChart from './components/ComparisonChart';
import StrategySection from './components/StrategySection';
import PodTable from './components/PodTable';
import K6Metrics from './components/K6Metrics';
import AdvancedAnalytics from './components/AdvancedAnalytics';
import ExperimentComparison from './components/ExperimentComparison';
import InfrastructureMonitor from './components/InfrastructureMonitor';
import AlertCentre from './components/AlertCentre';
import ReportExport from './components/ReportExport';
import AdaptiveAIConsole from './components/AdaptiveAIConsole';
import TrafficControl from './components/TrafficControl';
import RunHistory from './components/RunHistory';
import AvailabilityPanel from './components/AvailabilityPanel';

import {
  query,
  queryRange,
  valueOf,
  seriesValues,
  historyValues
} from './services/prometheus';

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
  canary: 'Canary Deployment'
};

const STRATEGY_DESCRIPTIONS = {
  rolling: 'Gradually replaces old application Pods with new Pods while maintaining service capacity.',
  recreate: 'Terminates the existing application Pods before starting the new application version.',
  'blue-green': 'Maintains two application environments and switches traffic between Blue and Green.',
  canary: 'Gradually exposes a new application version to a controlled percentage of traffic.'
};

const STRATEGY_STATUS = {
  rolling: 'IMPLEMENTED',
  recreate: 'EXPERIMENT COMPLETED',
  'blue-green': 'EXPERIMENT PENDING',
  canary: 'IMPLEMENTED'
};

const STRATEGY_COLORS = {
  rolling: '#438cf5',
  recreate: '#e5a34b',
  'blue-green': '#2eae91',
  canary: '#9b7bea'
};

// Canary uses the same Flask metric family as the other strategies.
// Prometheus must attach strategy="canary" to the canary-app scrape target.
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

function StrategyCard({ strategy, data, onOpen }) {
  const stats = data?.stats || {};

  return (
    <button
      type="button"
      className="strategy-overview-card"
      onClick={onOpen}
      style={{ '--strategy-color': STRATEGY_COLORS[strategy] }}
    >
      <div className="strategy-card-top">
        <span className="strategy-card-indicator" />
        <span className="strategy-card-status">
          {STRATEGY_STATUS[strategy]}
        </span>
      </div>

      <h3>{STRATEGY_NAMES[strategy]}</h3>

      <p>{STRATEGY_DESCRIPTIONS[strategy]}</p>

      <div className="strategy-card-metrics">
        <div>
          <span>Healthy Pods</span>
          <strong>
            {stats.healthy == null
              ? '—'
              : `${format(stats.healthy, 0)} / ${format(stats.total, 0)}`}
          </strong>
        </div>

        <div>
          <span>Requests / Sec</span>
          <strong>{format(stats.rps)}</strong>
        </div>
      </div>

      <span className="strategy-card-action">
        Open workspace <span>→</span>
      </span>
    </button>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState('overview');

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
          'sum by (strategy) (up{strategy=~"rolling|recreate|blue-green|canary"})',
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

  const totals = STRATEGIES.reduce(
    (result, strategy) => {
      const stats = data[strategy]?.stats;

      if (!stats) return result;

      result.healthy += stats.healthy || 0;
      result.total += stats.total || 0;

      return result;
    },
    { healthy: 0, total: 0 }
  );

  const totalRps = STRATEGIES.reduce(
    (sum, strategy) => sum + (data[strategy]?.stats.rps || 0),
    0
  );

  const selectedStrategy = STRATEGIES.includes(activePage)
    ? activePage
    : null;


  const selectedData = selectedStrategy
    ? data[selectedStrategy] || { stats: {}, pods: [] }
    : null;

  const selectedPods = selectedStrategy
    ? pods.filter(pod => pod.strategy === selectedStrategy)
    : pods;

  const selectedRequests = selectedStrategy
    ? requestHistory.filter(item => item.strategy === selectedStrategy)
    : requestHistory;

  const selectedLatency = selectedStrategy
    ? latencyHistory.filter(item => item.strategy === selectedStrategy)
    : latencyHistory;

  const selectedHealth = selectedStrategy
    ? healthHistory.filter(item => item.strategy === selectedStrategy)
    : healthHistory;

  const pageTitle = selectedStrategy
    ? STRATEGY_NAMES[selectedStrategy]
    : activePage === 'canary'
      ? 'Canary Deployment'
      : 'Deployment Overview';

  return (
    <div className="app-shell">

      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
      />

      <main className="main-content">

        <header className="dashboard-header">
          <div className="header-title">
            <p className="eyebrow">
              CLOUD-NATIVE DEPLOYMENT MONITORING
            </p>

            <h1>{pageTitle}</h1>

            <p className="subtitle">
              {selectedStrategy
                ? STRATEGY_DESCRIPTIONS[selectedStrategy]
                : activePage === 'canary'
                  ? 'Progressive traffic management and controlled release monitoring.'
                  : 'Monitor, analyse and compare Kubernetes deployment strategies.'}
            </p>
          </div>

          <div className="header-actions">

            <div className={`connection ${status === 'Live' ? 'online' : ''}`}>
              <i />
              <span>{status}</span>

              <small>
                {lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString()}`
                  : 'Waiting for metrics'}
              </small>
            </div>

            <TrafficControl strategy={selectedStrategy} />

            <button
              type="button"
              className="refresh-button"
              onClick={refresh}
            >
              ↻ Refresh
            </button>

          </div>
        </header>

        {activePage === 'overview' && (
          <div className="page-stack">

            <section className="welcome-banner">
              <div>
                <span>PROJECT MONITORING CENTER</span>
                <h2>Deployment Operations Overview</h2>
                <p>
                  A unified view of your application deployment
                  lifecycle and operational performance.
                </p>
              </div>

              <div className="welcome-decoration">D</div>
            </section>

            <section className="overview-heading">
              <div>
                <p className="panel-kicker">SYSTEM SUMMARY</p>
                <h2>Platform health at a glance</h2>
              </div>
            </section>

            <section className="stats">
              <StatCard
                label="Healthy Pods"
                value={`${totals.healthy} / ${totals.total}`}
                detail="Across monitored strategies"
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
                detail="Prometheus remote-write series"
                tone="orange"
              />
            </section>

            <InfrastructureMonitor />

            <AlertCentre />

            <AvailabilityPanel />

            <section className="overview-heading">
              <div>
                <p className="panel-kicker">DEPLOYMENT WORKSPACES</p>
                <h2>Explore each deployment technique</h2>
              </div>
            </section>

            <section className="strategy-overview-grid">
              {STRATEGIES.map(strategy => (
                <StrategyCard
                  key={strategy}
                  strategy={strategy}
                  data={data[strategy]}
                  onOpen={() => setActivePage(strategy)}
                />
              ))}

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

            <ExperimentComparison />

            <PodTable pods={pods} />

            <K6Metrics metrics={k6Metrics} />

            <ReportExport
              data={data}
              pods={pods}
              k6Metrics={k6Metrics}
              lastUpdated={lastUpdated}
            />

            <AdaptiveAIConsole stats={data.rolling?.stats || {}} />

          </div>
        )}

        {selectedStrategy && (
          <div className="page-stack">

            <section
              className={`strategy-hero ${selectedStrategy}-hero`}
              style={{
                '--strategy-color': STRATEGY_COLORS[selectedStrategy]
              }}
            >
              <div className="strategy-hero-content">
                <span className="strategy-hero-label">
                  DEPLOYMENT STRATEGY WORKSPACE
                </span>

                <h2>{STRATEGY_NAMES[selectedStrategy]}</h2>

                <p>{STRATEGY_DESCRIPTIONS[selectedStrategy]}</p>

                <span className="strategy-status-badge">
                  {STRATEGY_STATUS[selectedStrategy]}
                </span>
              </div>

              <div className="strategy-hero-symbol">
                {selectedStrategy === 'rolling'
                  ? '↻'
                  : selectedStrategy === 'recreate'
                    ? '⟳'
                    : selectedStrategy === 'canary'
                      ? '◉'
                      : '◈'}
              </div>
            </section>

            {selectedStrategy === 'canary' ? (
              <section className="stats">
                <StatCard
                  label="Healthy Pods"
                  value={`${format(selectedData.stats.healthy, 0)} / ${format(selectedData.stats.total, 0)}`}
                  detail="Canary V1 and V2 application pods"
                  tone="green"
                />
                <StatCard
                  label="Requests / Sec"
                  value={format(selectedData.stats.rps)}
                  detail="Live Canary application traffic"
                />
                <StatCard
                  label="5xx Error Rate"
                  value={`${format(selectedData.stats.errors)}%`}
                  detail="Canary application responses"
                  tone="orange"
                />
                <StatCard
                  label="P95 Latency"
                  value={`${format(selectedData.stats.p95 * 1000)} ms`}
                  detail="95th percentile response latency"
                />
              </section>
            ) : (
              <StrategySection
                strategy={selectedStrategy}
                data={selectedData}
              />
            )}

            <ComparisonChart
              title="Request Rate"
              unit="requests / second"
              series={selectedRequests}
            />

            <ComparisonChart
              title="P95 Response Latency"
              unit="milliseconds"
              series={selectedLatency.map(item => ({
                ...item,
                values: item.values.map(point => ({
                  ...point,
                  value: point.value * 1000
                }))
              }))}
            />

            <ComparisonChart
              title="Healthy Pod History"
              unit="healthy pods"
              series={selectedHealth}
            />

            <PodTable pods={selectedPods} />
            <AvailabilityPanel strategy={selectedStrategy} />
            {selectedStrategy === 'rolling' && <AdvancedAnalytics />}

          </div>
        )}


        <footer className="dashboard-footer">
          <p>
            DeployOps · Cloud-Native Deployment Research Platform
          </p>

          <p>
            Prometheus monitoring · 5-second refresh interval
          </p>
        </footer>

      </main>
    </div>
  );
}
