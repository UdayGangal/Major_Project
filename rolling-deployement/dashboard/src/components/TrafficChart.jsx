export default function TrafficChart({ pods }) {
  const total = pods.reduce((sum, pod) => sum + pod.rate, 0);
  return (
    <section className="panel">
      <div className="panel-heading"><div><p className="panel-kicker">LOAD BALANCING</p><h2>Traffic by Pod</h2></div><span>last 1 min</span></div>
      {pods.length ? pods.map((pod) => {
        const percentage = total ? (pod.rate / total) * 100 : 0;
        return <div className="traffic-row" key={pod.name}>
          <div><code>{pod.name}</code><span>{percentage.toFixed(1)}%</span></div>
          <i><b style={{ width: `${percentage}%` }} /></i>
        </div>;
      }) : <p className="empty">No request-rate series yet.</p>}
    </section>
  );
}
