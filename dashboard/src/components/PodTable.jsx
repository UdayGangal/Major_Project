
const STRATEGY_NAMES = {
  rolling: 'Rolling Update',
  recreate: 'Recreate',
  'blue-green': 'Blue-Green',
  canary: 'Canary'
};

export default function PodTable({ pods = [] }) {
  const healthyCount = pods.filter(pod => pod.healthy).length;
  const unhealthyCount = pods.length - healthyCount;

  return (
    <section className="panel pod-panel">

      <div className="panel-heading">
        <div>
          <p className="panel-kicker">KUBERNETES INFRASTRUCTURE</p>
          <h2>Application Pod Inventory</h2>
          <p className="panel-description">
            Health and version status of discovered application Pods.
          </p>
        </div>

        <span className="pod-total-badge">
          {pods.length} Pods
        </span>
      </div>

      <div className="pod-summary">
        <div>
          <span className="pod-summary-dot healthy-dot" />
          <span>Healthy</span>
          <strong>{healthyCount}</strong>
        </div>

        <div>
          <span className="pod-summary-dot unhealthy-dot" />
          <span>Unhealthy / Unknown</span>
          <strong>{unhealthyCount}</strong>
        </div>
      </div>

      {pods.length > 0 ? (
        <div className="table-scroll">

          <table className="professional-pod-table">

            <thead>
              <tr>
                <th>APPLICATION POD</th>
                <th>STRATEGY</th>
                <th>VERSION</th>
                <th>HEALTH STATUS</th>
              </tr>
            </thead>

            <tbody>
              {pods.map((pod, index) => (
                <tr key={`${pod.strategy}-${pod.name || index}`}>

                  <td>
                    <div className="pod-name-cell">
                      <span className="pod-avatar">P</span>

                      <div>
                        <strong title={pod.name}>
                          {pod.name || 'Unknown Pod'}
                        </strong>
                        <small>Application instance</small>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className={`strategy-chip strategy-${pod.strategy}`}>
                      {STRATEGY_NAMES[pod.strategy] || pod.strategy || '—'}
                    </span>
                  </td>

                  <td>
                    <span className={`version-chip version-${pod.version}`}>
                      {pod.version || 'Unknown'}
                    </span>
                  </td>

                  <td>
                    <span className={`pod-health ${pod.healthy ? 'is-healthy' : 'is-unhealthy'}`}>
                      <i />
                      {pod.healthy ? 'Healthy' : 'Not Ready'}
                    </span>
                  </td>

                </tr>
              ))}
            </tbody>

          </table>

        </div>
      ) : (
        <div className="pod-empty-state">
          <div className="pod-empty-icon">◈</div>
          <strong>No application Pods discovered</strong>
          <p>
            Pods will appear when matching Kubernetes monitoring
            metrics become available in Prometheus.
          </p>
        </div>
      )}

      <div className="pod-table-footer">
        <span>Source: Prometheus Kubernetes metrics</span>
        <span>{pods.length} discovered instances</span>
      </div>

    </section>
  );
}
