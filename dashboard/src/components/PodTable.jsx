
export default function PodTable({ pods }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">KUBERNETES</p>
          <h2>All Application Pods</h2>
        </div>
        <span>{pods.length} discovered</span>
      </div>

      {pods.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Pod</th>
                <th>Strategy</th>
                <th>Version</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {pods.map(pod => (
                <tr key={`${pod.strategy}-${pod.name}`}>
                  <td><code>{pod.name}</code></td>
                  <td>{pod.strategy}</td>
                  <td>{pod.version || '—'}</td>
                  <td>
                    <span className={pod.healthy ? 'ready' : 'failed'}>
                      {pod.healthy ? 'HEALTHY' : 'DOWN'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No application pods discovered yet.</p>
      )}
    </section>
  );
}
