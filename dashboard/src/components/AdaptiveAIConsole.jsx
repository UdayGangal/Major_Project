const MCP_TOOLS = [
  {
    name: 'Kubernetes Monitor',
    description: 'Inspect Pods, Deployments and rollout health.',
    category: 'CLUSTER MANAGEMENT'
  },
  {
    name: 'Prometheus Query',
    description: 'Retrieve latency, error rate and throughput metrics.',
    category: 'OBSERVABILITY'
  },
  {
    name: 'Istio Traffic Manager',
    description: 'Manage traffic distribution between versions.',
    category: 'TRAFFIC CONTROL'
  },
  {
    name: 'Deployment Controller',
    description: 'Support rollout, promotion and rollback operations.',
    category: 'DEPLOYMENT'
  }
];

const PIPELINE = [
  ['01', 'Observe', 'Collect application and cluster metrics.'],
  ['02', 'Evaluate', 'Analyse health, latency and error thresholds.'],
  ['03', 'Recommend', 'Propose a suitable deployment action.'],
  ['04', 'Approve', 'Require operator approval before execution.'],
  ['05', 'Execute', 'Send an approved action through MCP tools.']
];

function metric(value, suffix = '') {
  return value == null || !Number.isFinite(Number(value))
    ? 'Unavailable'
    : `${Number(value).toFixed(2)}${suffix}`;
}

export default function AdaptiveAIConsole({ stats = {} }) {
  return (
    <section className="panel adaptive-console">

      <div className="panel-heading">
        <div>
          <p className="panel-kicker">INTELLIGENT DEPLOYMENT CONTROL</p>
          <h2>Adaptive AI & MCP Console</h2>
          <p className="adaptive-subtitle">
            Agent-assisted deployment monitoring and decision workflow
          </p>
        </div>

        <span className="adaptive-prototype-badge">
          FRONTEND PREVIEW
        </span>
      </div>

      <div className="adaptive-hero">
        <div className="adaptive-hero-symbol">✳</div>

        <div className="adaptive-hero-content">
          <span className="adaptive-overline">AGENT RUNTIME STATUS</span>
          <h3>Awaiting AI Agent Integration</h3>
          <p>
            The console is ready for future integration with an
            AI decision engine and MCP-connected infrastructure tools.
          </p>
        </div>

        <span className="adaptive-runtime-status">
          NOT CONNECTED
        </span>
      </div>

      <div className="adaptive-section-heading">
        <div>
          <span className="panel-kicker">OBSERVED APPLICATION CONTEXT</span>
          <h3>Runtime Metrics</h3>
        </div>
        <span className="adaptive-context-tag">ROLLING UPDATE</span>
      </div>

      <div className="adaptive-metrics">
        <div className="adaptive-metric">
          <span>P95 Latency</span>
          <strong>{metric(stats.p95, ' ms')}</strong>
        </div>

        <div className="adaptive-metric">
          <span>Request Throughput</span>
          <strong>{metric(stats.rps, ' req/s')}</strong>
        </div>

        <div className="adaptive-metric">
          <span>5xx Error Rate</span>
          <strong>{metric(stats.errors, '%')}</strong>
        </div>
      </div>

      <div className="adaptive-section-heading">
        <div>
          <span className="panel-kicker">AGENT DECISION PIPELINE</span>
          <h3>Adaptive Deployment Workflow</h3>
        </div>
      </div>

      <div className="adaptive-pipeline">
        {PIPELINE.map((step, index) => (
          <div className="adaptive-pipeline-step" key={step[0]}>
            <div className="adaptive-step-number">{step[0]}</div>

            <div className="adaptive-step-content">
              <strong>{step[1]}</strong>
              <p>{step[2]}</p>
            </div>

            {index !== PIPELINE.length - 1 && (
              <span className="adaptive-step-arrow">→</span>
            )}
          </div>
        ))}
      </div>

      <div className="adaptive-section-heading">
        <div>
          <span className="panel-kicker">MODEL CONTEXT PROTOCOL</span>
          <h3>MCP Tool Registry</h3>
        </div>
        <span className="adaptive-context-tag">INTEGRATION PENDING</span>
      </div>

      <div className="mcp-tool-grid">
        {MCP_TOOLS.map(tool => (
          <article className="mcp-tool-card" key={tool.name}>
            <div className="mcp-tool-top">
              <span className="mcp-tool-icon">⌘</span>
              <span className="mcp-tool-status">NOT CONNECTED</span>
            </div>

            <span className="mcp-tool-category">{tool.category}</span>
            <h4>{tool.name}</h4>
            <p>{tool.description}</p>
          </article>
        ))}
      </div>

      <div className="adaptive-guardrails">
        <strong>Execution & Safety Controls</strong>
        <ul>
          <li>AI recommendations require a configured agent.</li>
          <li>MCP tools require a connected MCP server.</li>
          <li>Deployment changes require operator approval.</li>
          <li>No infrastructure actions are executed by this preview.</li>
        </ul>
      </div>

      <div className="adaptive-footer">
        Adaptive AI and MCP execution will become available
        after backend integration.
      </div>

    </section>
  );
}