import { useCallback, useEffect, useState } from 'react';
import StatCard from './components/StatCard';
import LineChart from './components/LineChart';
import TrafficChart from './components/TrafficChart';
import PodTable from './components/PodTable';
import { matrixValues, query, queryRange, sampleValue } from './services/prometheus';

const QUERIES = {
  healthyPods: 'sum(up{job="rolling-demo"})',
  totalPods: 'count(up{job="rolling-demo"})',
  rps: 'sum(rate(rolling_demo_http_requests_total[1m]))',
  errorRate: '100 * sum(rate(rolling_demo_http_requests_total{status=~"5.."}[1m])) / clamp_min(sum(rate(rolling_demo_http_requests_total[1m])), 1)',
  p95: 'histogram_quantile(0.95, sum by (le) (rate(rolling_demo_http_request_duration_seconds_bucket[1m])))',
  activeVus: 'sum(k6_vus)',
  podTraffic: 'sum by (pod) (rate(rolling_demo_http_requests_total[1m]))',
  podHealth: 'max by (pod) (up{job="rolling-demo"})',
  podInfo: 'max by (pod, version) (rolling_demo_application_info)',
  requestHistory: 'sum(rate(rolling_demo_http_requests_total[30s]))',
  healthHistory: 'sum(up{job="rolling-demo"})',
};

const number = (value, digits = 0) => value === null || !Number.isFinite(value) ? null : value.toFixed(digits);
const podsSummary = (healthy, total) => Number.isFinite(healthy) && Number.isFinite(total) ? `${number(healthy)} / ${number(total)}` : null;
const withUnit = (value, multiplier, suffix, digits = 2) => {
  const formatted = number(value * multiplier, digits);
  return formatted === null ? null : `${formatted} ${suffix}`;
};

export default function App() {
  const [data, setData] = useState({ stats: {}, traffic: [], pods: [], requestHistory: [], healthHistory: [] });
  const [status, setStatus] = useState('Connecting to Prometheus…');
  const [updatedAt, setUpdatedAt] = useState(null);

  const refresh = useCallback(async () => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 120;
    try {
      const [healthy, total, rps, errors, p95, vus, traffic, podHealth, podInfo, requestHistory, healthHistory] = await Promise.all([
        query(QUERIES.healthyPods), query(QUERIES.totalPods), query(QUERIES.rps), query(QUERIES.errorRate), query(QUERIES.p95), query(QUERIES.activeVus),
        query(QUERIES.podTraffic), query(QUERIES.podHealth), query(QUERIES.podInfo), queryRange(QUERIES.requestHistory, start, end), queryRange(QUERIES.healthHistory, start, end),
      ]);
      const trafficByPod = traffic.map((series) => ({ name: series.metric.pod, rate: Number(series.value[1]) }));
      const podVersions = new Map(podInfo.map((series) => [series.metric.pod, series.metric.version]));
      setData({
        stats: { healthy: sampleValue(healthy), total: sampleValue(total), rps: sampleValue(rps), errors: sampleValue(errors), p95: sampleValue(p95), vus: sampleValue(vus) },
        traffic: trafficByPod,
        pods: podHealth.map((series) => ({ name: series.metric.pod || series.metric.instance, version: podVersions.get(series.metric.pod), healthy: Number(series.value[1]) === 1 })),
        requestHistory: matrixValues(requestHistory), healthHistory: matrixValues(healthHistory),
      });
      setStatus('Live');
      setUpdatedAt(new Date());
    } catch (error) {
      setStatus(`Disconnected: ${error.message}`);
    }
  }, []);

  useEffect(() => { refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [refresh]);
  const { stats } = data;

  return <main>
    <header className="dashboard-header">
      <div className="brand"><div className="brand-mark">RD</div><div><p className="eyebrow">CLOUD-NATIVE DELIVERY LAB</p><h1>Rolling Deployment <em>Dashboard</em></h1></div></div>
      <div className="header-meta"><span className="refresh">AUTO-REFRESH | 5 SEC</span><div className={`connection ${status === 'Live' ? 'online' : ''}`}><i />{status}<small>{updatedAt ? `Last synced ${updatedAt.toLocaleTimeString()}` : 'Awaiting first sample'}</small></div></div>
    </header>
    <section className="overview"><div><p className="eyebrow">REAL-TIME OPERATIONS</p><h2>Traffic, availability, and rollout health in one view.</h2></div><p>All dashboard values are queried from Prometheus. No sample metrics are stored in the interface.</p></section>
    <section className="stats">
      <StatCard index="1" label="Healthy Pods" value={podsSummary(stats.healthy, stats.total)} detail="live Prometheus scrape targets" tone="green" />
      <StatCard index="2" label="Requests / Sec" value={number(stats.rps, 2)} detail="application request counter" />
      <StatCard index="3" label="Error Rate" value={withUnit(stats.errors, 1, '%')} detail="HTTP 5xx in the last minute" tone="red" />
      <StatCard index="4" label="P95 Latency" value={withUnit(stats.p95, 1000, 'ms')} detail="application latency histogram" tone="purple" />
      <StatCard index="5" label="Active VUs" value={number(stats.vus)} detail="k6 Prometheus remote write" tone="orange" />
    </section>
    <LineChart title="Request Rate" unit="requests / second" points={data.requestHistory} />
    <section className="two-column"><TrafficChart pods={data.traffic} /><PodTable pods={data.pods} /></section>
    <LineChart title="Healthy Pods During Rollout" unit="healthy targets" points={data.healthHistory} />
  </main>;
}
