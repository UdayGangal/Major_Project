export default function LineChart({ title, unit, points }) {
  const valid = points.filter((point) => Number.isFinite(point.value));
  const max = Math.max(...valid.map((point) => point.value), 0);
  const min = Math.min(...valid.map((point) => point.value), 0);
  const span = max - min || 1;
  const polyline = valid.map((point, index) => {
    const x = valid.length === 1 ? 50 : (index / (valid.length - 1)) * 100;
    const y = 90 - ((point.value - min) / span) * 78;
    return `${x},${y}`;
  }).join(' ');
  const area = valid.length ? `0,90 ${polyline} 100,90` : '';

  return (
    <section className="panel chart-panel">
      <div className="panel-heading"><div><p className="panel-kicker">LIVE TIME SERIES</p><h2>{title}</h2></div><span>{unit}</span></div>
      {valid.length ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={title} role="img">
          <line x1="0" y1="90" x2="100" y2="90" className="axis" />
          <line x1="0" y1="50" x2="100" y2="50" className="grid" />
          <polygon points={area} className="area" />
          <polyline points={polyline} className="trend" />
        </svg>
      ) : <p className="empty">Waiting for live Prometheus samples.</p>}
    </section>
  );
}
