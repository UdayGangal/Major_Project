export default function PodTable({ pods }) {
  return (
    <section className="panel">
      <div className="panel-heading"><div><p className="panel-kicker">KUBERNETES WORKLOAD</p><h2>Pod Health</h2></div><span>Prometheus targets</span></div>
      {pods.length ? <table>
        <thead><tr><th>Pod</th><th>Version</th><th>Status</th></tr></thead>
        <tbody>{pods.map((pod) => <tr key={pod.name}>
          <td><code>{pod.name}</code></td><td>{pod.version || 'unknown'}</td>
          <td><span className={pod.healthy ? 'status ready' : 'status failed'}>{pod.healthy ? 'HEALTHY' : 'UNREACHABLE'}</span></td>
        </tr>)}</tbody>
      </table> : <p className="empty">Waiting for application scrape targets.</p>}
    </section>
  );
}
