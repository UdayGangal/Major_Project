
const STRATEGIES = ['rolling', 'recreate', 'blue-green'];

const LABELS = {
  rolling: 'Rolling',
  recreate: 'Recreate',
  'blue-green': 'Blue-Green'
};

export default function ComparisonChart({ title, unit, series }) {
  const width = 700;
  const height = 220;
  const padding = 25;

  const values = series.flatMap(item =>
    item.values.map(point => point.value)
  );

  const max = Math.max(...values, 1);

  const colors = {
    rolling: '#60a5fa',
    recreate: '#f59e0b',
    'blue-green': '#4ade80'
  };

  function pointsFor(item) {
    return item.values.map((point, index) => {
      const x = padding +
        (index / Math.max(item.values.length - 1, 1)) *
        (width - padding * 2);

      const y = height - padding -
        (point.value / max) * (height - padding * 2);

      return `${x},${y}`;
    }).join(' ');
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">STRATEGY COMPARISON</p>
          <h2>{title}</h2>
        </div>
        <span>{unit}</span>
      </div>

      {series.some(item => item.values.length) ? (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} className="comparison-svg">
            {[0, 1, 2, 3].map(i => {
              const y = padding +
                i * ((height - padding * 2) / 3);

              return (
                <line
                  key={i}
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  className="chart-grid"
                />
              );
            })}

            {series.map(item => item.values.length > 0 && (
              <polyline
                key={item.strategy}
                points={pointsFor(item)}
                fill="none"
                stroke={colors[item.strategy]}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>

          <div className="chart-legend">
            {STRATEGIES.map(strategy => (
              <span key={strategy}>
                <i style={{ background: colors[strategy] }} />
                {LABELS[strategy]}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="empty">Waiting for Prometheus samples.</p>
      )}
    </section>
  );
}
