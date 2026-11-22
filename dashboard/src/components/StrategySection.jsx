
import StatCard from './StatCard';

const NAMES = {
  rolling: 'Rolling Update',
  recreate: 'Recreate',
  'blue-green': 'Blue-Green'
};

const format = (value, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits);

export default function StrategySection({ strategy, data }) {
  const stats = data.stats;

  return (
    <section className="strategy-section">
      <div className="section-title">
        <div>
          <p className="panel-kicker">DEPLOYMENT STRATEGY</p>
          <h2>{NAMES[strategy]}</h2>
        </div>
        <span className="strategy-tag">{strategy}</span>
      </div>

      <div className="stats">
        <StatCard
          label="Healthy Pods"
          value={
            stats.healthy == null || stats.total == null
              ? '—'
              : `${format(stats.healthy, 0)} / ${format(stats.total, 0)}`
          }
          detail="Healthy / total scrape targets"
          tone="green"
        />

        <StatCard
          label="Requests / Sec"
          value={format(stats.rps)}
          detail="Application request rate"
        />

        <StatCard
          label="Error Rate"
          value={stats.errors == null ? '—' : `${format(stats.errors)}%`}
          detail="HTTP 5xx responses"
          tone="red"
        />

        <StatCard
          label="P95 Latency"
          value={stats.p95 == null ? '—' : `${format(stats.p95 * 1000)} ms`}
          detail="95th percentile"
          tone="purple"
        />
      </div>
    </section>
  );
}
