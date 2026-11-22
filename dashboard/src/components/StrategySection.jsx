
import StatCard from './StatCard';
import DeploymentTimeline from './DeploymentTimeline';

const STRATEGIES = {
  rolling: {
    name: 'Rolling Update',
    number: '01',
    status: 'IMPLEMENTED',
    description:
      'Application Pods are replaced gradually while Kubernetes maintains the required service capacity.',
    color: '#438cf5',
    stages: [
      'Existing V1 Pods serve traffic',
      'New V2 Pod is created',
      'Readiness check is performed',
      'Old Pod is terminated',
      'Process continues until all Pods run V2'
    ],
    configuration: [
      ['Replica count', '4'],
      ['Deployment strategy', 'RollingUpdate'],
      ['Max surge', '1'],
      ['Max unavailable', '0'],
      ['Health check', '/health']
    ]
  },

  recreate: {
    name: 'Recreate',
    number: '02',
    status: 'EXPERIMENT COMPLETED',
    description:
      'All existing V1 Pods are terminated before Kubernetes creates the replacement V2 Pods.',
    color: '#e5a34b',
    stages: [
      'V1 Pods serve incoming traffic',
      'All V1 Pods are terminated',
      'Application temporarily has no ready Pods',
      'Four V2 Pods are created',
      'Readiness probes pass and V2 serves traffic'
    ],
    configuration: [
      ['Replica count', '4'],
      ['Deployment strategy', 'Recreate'],
      ['V1 image', 'swain15/rolling-demo:v1'],
      ['V2 image', 'swain15/rolling-demo:v2'],
      ['Health check', '/health']
    ]
  },

  'blue-green': {
    name: 'Blue-Green',
    number: '03',
    status: 'EXPERIMENT PENDING',
    description:
      'Two application environments are maintained so that traffic can be switched from the active environment to the new environment.',
    color: '#2eae91',
    stages: [
      'Blue environment serves production traffic',
      'Green environment is deployed separately',
      'Green environment health is verified',
      'Service selector is switched to Green',
      'Blue remains available for potential rollback'
    ],
    configuration: [
      ['Active environment', 'To be verified'],
      ['Standby environment', 'To be verified'],
      ['Traffic switching', 'Service selector'],
      ['Rollback', 'To be tested'],
      ['Experiment results', 'Pending']
    ]
  }
};

const RECORDED_RESULTS = {
  rolling: {
    title: 'Initial Rolling Update Baseline',
    note:
      'Recorded during the initial mid-evaluation baseline. This was not the same workload as the later Recreate experiment.',
    values: [
      ['HTTP requests', '18,720'],
      ['Request rate', '233.86 req/s'],
      ['Failure rate', '0.00%'],
      ['Average latency', '2.09 ms'],
      ['P95 latency', '3.55 ms'],
      ['Peak virtual users', '49'],
      ['Interrupted iterations', '0']
    ]
  },

  recreate: {
    title: 'Completed Recreate Experiment — Run 1',
    note:
      'One 15-minute test with 20 virtual users. The HTTP failure rate covers the full test window, not just the deployment interruption.',
    values: [
      ['HTTP requests', '68,832'],
      ['Request rate', '76.44 req/s'],
      ['Failed requests', '222'],
      ['Failure rate', '0.32%'],
      ['Average latency', '2.32 ms'],
      ['Median latency', '1.83 ms'],
      ['P95 latency', '4.34 ms'],
      ['Maximum latency', '1.1 s'],
      ['Successful checks', '99.67%'],
      ['Completed iterations', '34,416'],
      ['Interrupted iterations', '0'],
      ['Virtual users', '20'],
      ['Test duration', '15 minutes'],
      ['V1 to V2 rollout', '196.87 seconds']
    ]
  }
};

function LiveMetric({ label, value, detail, tone }) {
  return (
    <StatCard
      label={label}
      value={value}
      detail={detail}
      tone={tone}
    />
  );
}

function Lifecycle({ stages }) {
  return (
    <section className="panel lifecycle-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">DEPLOYMENT LIFECYCLE</p>
          <h2>How this strategy works</h2>
        </div>
        <span>{stages.length} stages</span>
      </div>

      <div className="lifecycle-list">
        {stages.map((stage, index) => (
          <div className="lifecycle-step" key={stage}>
            <div className="lifecycle-step-number">
              {String(index + 1).padStart(2, '0')}
            </div>

            <div className="lifecycle-step-content">
              <strong>{stage}</strong>
            </div>

            {index !== stages.length - 1 && (
              <span className="lifecycle-arrow">↓</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Configuration({ items }) {
  return (
    <section className="panel configuration-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">IMPLEMENTATION DETAILS</p>
          <h2>Deployment configuration</h2>
        </div>
      </div>

      <div className="configuration-list">
        {items.map(([label, value]) => (
          <div className="configuration-row" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecordedResults({ result }) {
  if (!result) return null;

  return (
    <section className="panel recorded-results">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">SAVED EXPERIMENT EVIDENCE</p>
          <h2>{result.title}</h2>
        </div>

        <span className="evidence-badge">RECORDED</span>
      </div>

      <p className="evidence-note">{result.note}</p>

      <div className="evidence-grid">
        {result.values.map(([label, value]) => (
          <div className="evidence-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function PendingResults({ strategy }) {
  return (
    <section className="panel pending-results">
      <div className="pending-icon">i</div>

      <div>
        <p className="panel-kicker">EXPERIMENT STATUS</p>
        <h2>No verified experiment results yet</h2>

        <p>
          The {strategy} workspace is prepared. Runtime performance,
          deployment duration, failure rate and latency measurements
          will appear here after its experiment is executed and verified.
        </p>
      </div>
    </section>
  );
}

export default function StrategySection({ strategy, data = {} }) {
  const config = STRATEGIES[strategy];

  if (!config) {
    return (
      <section className="panel">
        <h2>Strategy not found</h2>
        <p>Please select a valid deployment strategy.</p>
      </section>
    );
  }

  const stats = data.stats || {};
  const liveAvailable = Object.values(stats).some(
    value => value !== null && value !== undefined
  );

  const recorded = RECORDED_RESULTS[strategy];

  return (
    <div className="strategy-workspace">

      {/* STRATEGY INTRODUCTION */}

      <section
        className="strategy-section strategy-intro"
        style={{ '--strategy-color': config.color }}
      >
        <div className="strategy-intro-main">
          <div className="strategy-number">{config.number}</div>

          <div>
            <p className="panel-kicker">DEPLOYMENT STRATEGY WORKSPACE</p>
            <h2>{config.name}</h2>
            <p className="strategy-description">
              {config.description}
            </p>
          </div>
        </div>

        <span className="strategy-tag">
          {config.status}
        </span>
      </section>

      {/* LIVE PROMETHEUS METRICS */}

      <section className="workspace-heading">
        <div>
          <p className="panel-kicker">LIVE MONITORING</p>
          <h2>Current application performance</h2>
          <p>
            Values retrieved from the existing Prometheus connection.
          </p>
        </div>

        <span className={liveAvailable ? 'live-label' : 'pending-label'}>
          {liveAvailable ? '● LIVE DATA' : '○ NO MATCHING SERIES'}
        </span>
      </section>

      <div className="stats strategy-live-stats">
        <LiveMetric
          label="Healthy Pods"
          value={
            stats.healthy == null || stats.total == null
              ? '—'
              : `${stats.healthy} / ${stats.total}`
          }
          detail="Healthy / total scrape targets"
          tone="green"
        />

        <LiveMetric
          label="Request Rate"
          value={
            stats.rps == null
              ? '—'
              : `${stats.rps.toFixed(2)}`
          }
          detail="Requests per second"
          tone="blue"
        />

        <LiveMetric
          label="HTTP Error Rate"
          value={
            stats.errors == null
              ? '—'
              : `${stats.errors.toFixed(2)}%`
          }
          detail="HTTP 5xx responses"
          tone="red"
        />

        <LiveMetric
          label="P95 Latency"
          value={
            stats.p95 == null
              ? '—'
              : `${(stats.p95 * 1000).toFixed(2)} ms`
          }
          detail="95th percentile response time"
          tone="purple"
        />
      </div>

      {!liveAvailable && (
        <div className="metric-info">
          <strong>Live data is not currently available.</strong>
          <span>
            This does not mean the deployment is unhealthy.
            Prometheus must expose matching strategy-labelled metrics
            for this workspace.
          </span>
        </div>
      )}

      {/* DEPLOYMENT WORKFLOW */}

      <DeploymentTimeline strategy={strategy} />

      {/* CONFIGURATION */}

      <Configuration items={config.configuration} />

      {/* EXPERIMENT EVIDENCE */}

      {recorded
        ? <RecordedResults result={recorded} />
        : <PendingResults strategy={config.name} />
      }

    </div>
  );
}
