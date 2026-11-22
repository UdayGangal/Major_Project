const EXPERIMENTS = [
  {
    name: 'Rolling Update',
    status: 'RECORDED BASELINE',
    tone: 'rolling',
    requests: '18,720',
    throughput: '233.86',
    avgLatency: '2.09',
    p95: '3.55',
    failed: '0%',
    load: 'Maximum 49 VUs'
  },
  {
    name: 'Recreate',
    status: 'EXPERIMENT COMPLETED',
    tone: 'recreate',
    requests: '68,832',
    throughput: '76.443',
    avgLatency: '2.32',
    p95: '4.34',
    failed: '0.32%',
    load: '20 VUs · 15 minutes'
  },
  {
    name: 'Blue-Green',
    status: 'PENDING',
    tone: 'blue-green',
    requests: '—',
    throughput: '—',
    avgLatency: '—',
    p95: '—',
    failed: '—',
    load: 'Experiment pending'
  }
];

const METRICS = [
  ['Total Requests', 'requests'],
  ['Throughput', 'throughput'],
  ['Average Latency', 'avgLatency'],
  ['P95 Latency', 'p95'],
  ['Failed Requests', 'failed']
];

export default function ExperimentComparison() {
  return (
    <section className="panel experiment-comparison">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">EXPERIMENT LAB</p>
          <h2>Experiment Comparison Centre</h2>
          <p className="comparison-subtitle">
            Recorded performance across deployment strategies
          </p>
        </div>
        <span className="comparison-count">3 STRATEGIES</span>
      </div>

      <div className="experiment-grid">
        {EXPERIMENTS.map(experiment => (
          <article
            className={`experiment-card ${experiment.tone}`}
            key={experiment.name}
          >
            <div className="experiment-card-heading">
              <h3>{experiment.name}</h3>
              <span>{experiment.status}</span>
            </div>

            <div className="experiment-table">
              {METRICS.map(([label, key]) => (
                <div className="experiment-metric" key={key}>
                  <span>{label}</span>
                  <strong>
                    {experiment[key]}
                    {key === 'throughput' && experiment[key] !== '—'
                      ? ' req/s'
                      : ''}
                    {key === 'avgLatency' || key === 'p95'
                      ? experiment[key] === '—' ? '' : ' ms'
                      : ''}
                  </strong>
                </div>
              ))}
            </div>

            <div className="experiment-load">
              <span>LOAD PROFILE</span>
              <strong>{experiment.load}</strong>
            </div>
          </article>
        ))}
      </div>

      <div className="comparison-disclaimer">
        <span>i</span>
        <p>
          These are separately recorded experiments with different load
          profiles. They should not be treated as a controlled
          head-to-head benchmark. Missing results are shown as pending,
          not estimated.
        </p>
      </div>
    </section>
  );
}