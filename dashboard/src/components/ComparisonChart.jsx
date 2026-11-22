
const STRATEGIES = {
  rolling: {
    label: 'Rolling Update',
    color: '#438CF5'
  },
  recreate: {
    label: 'Recreate',
    color: '#E5A34B'
  },
  'blue-green': {
    label: 'Blue-Green',
    color: '#2EAE91'
  },
  canary: {
    label: 'Canary',
    color: '#9B7BEA'
  }
};

const WIDTH = 1000;
const HEIGHT = 330;

const MARGIN = {
  top: 24,
  right: 28,
  bottom: 55,
  left: 72
};

const CHART_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const CHART_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

function formatNumber(value) {
  if (!Number.isFinite(value)) return '—';

  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 0
    });
  }

  return value.toFixed(2);
}

function formatTime(timestamp) {
  if (!timestamp) return '';

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function prepareSeries(series) {
  return series
    .map(item => ({
      ...item,
      values: (item.values || [])
        .filter(point =>
          Number.isFinite(point.time) &&
          Number.isFinite(point.value)
        )
        .sort((a, b) => a.time - b.time)
    }))
    .filter(item => item.values.length > 0);
}

export default function ComparisonChart({
  title,
  unit = '',
  series = []
}) {
  const visibleSeries = prepareSeries(series);

  if (!visibleSeries.length) {
    return (
      <section className="panel comparison-chart">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">PERFORMANCE ANALYTICS</p>
            <h2>{title}</h2>
          </div>

          <span className="chart-unit">{unit}</span>
        </div>

        <div className="chart-empty-state">
          <div className="chart-empty-icon">⌁</div>

          <strong>No monitoring data available</strong>

          <p>
            Waiting for Prometheus samples for this metric.
            The chart will populate when matching time-series
            data becomes available.
          </p>
        </div>
      </section>
    );
  }

  const allPoints = visibleSeries.flatMap(item => item.values);

  const minTime = Math.min(...allPoints.map(point => point.time));
  const maxTime = Math.max(...allPoints.map(point => point.time));

  const maxValue = Math.max(
    ...allPoints.map(point => point.value),
    0
  );

  const yMax = maxValue > 0 ? maxValue * 1.15 : 1;

  function xPosition(time) {
    if (maxTime === minTime) return MARGIN.left;

    return MARGIN.left +
      ((time - minTime) / (maxTime - minTime)) *
      CHART_WIDTH;
  }

  function yPosition(value) {
    return MARGIN.top +
      CHART_HEIGHT -
      (Math.max(0, value) / yMax) * CHART_HEIGHT;
  }

  function buildPath(points) {
    return points.map((point, index) => {
      const x = xPosition(point.time);
      const y = yPosition(point.value);

      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }

  const latestValues = visibleSeries.map(item => ({
    strategy: item.strategy,
    value: item.values[item.values.length - 1].value
  }));

  const yTicks = 4;
  const xTicks = 5;

  return (
    <section className="panel comparison-chart">

      <div className="panel-heading chart-heading">
        <div>
          <p className="panel-kicker">PERFORMANCE ANALYTICS</p>
          <h2>{title}</h2>

          <p className="chart-description">
            Real-time performance trend across available deployment strategies
          </p>
        </div>

        <div className="chart-heading-right">
          <span className="chart-unit">{unit}</span>
          <span className="chart-time-range">LAST 5 MINUTES</span>
        </div>
      </div>

      {/* CURRENT VALUES */}

      <div className="chart-current-values">
        {latestValues.map(item => {
          const config = STRATEGIES[item.strategy];

          if (!config) return null;

          return (
            <div
              className="chart-current-item"
              key={item.strategy}
            >
              <span
                className="chart-current-dot"
                style={{ background: config.color }}
              />

              <span className="chart-current-label">
                {config.label}
              </span>

              <strong>
                {formatNumber(item.value)}
              </strong>
            </div>
          );
        })}
      </div>

      {/* CHART */}

      <div className="chart-canvas">

        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title} time series comparison`}
          className="comparison-svg"
        >

          {/* HORIZONTAL GRID AND Y-AXIS */}

          {Array.from({ length: yTicks + 1 }).map((_, index) => {
            const fraction = index / yTicks;

            const y = MARGIN.top + fraction * CHART_HEIGHT;
            const value = yMax * (1 - fraction);

            return (
              <g key={`y-${index}`}>

                <line
                  x1={MARGIN.left}
                  y1={y}
                  x2={WIDTH - MARGIN.right}
                  y2={y}
                  className="chart-grid"
                />

                <text
                  x={MARGIN.left - 14}
                  y={y + 4}
                  textAnchor="end"
                  className="chart-axis-text"
                >
                  {formatNumber(value)}
                </text>

              </g>
            );
          })}

          {/* VERTICAL GRID AND X-AXIS */}

          {Array.from({ length: xTicks }).map((_, index) => {
            const fraction = index / (xTicks - 1);

            const time = minTime + fraction * (maxTime - minTime);
            const x = MARGIN.left + fraction * CHART_WIDTH;

            return (
              <g key={`x-${index}`}>

                <line
                  x1={x}
                  y1={MARGIN.top}
                  x2={x}
                  y2={MARGIN.top + CHART_HEIGHT}
                  className="chart-grid vertical-grid"
                />

                <text
                  x={x}
                  y={HEIGHT - 18}
                  textAnchor="middle"
                  className="chart-axis-text"
                >
                  {formatTime(time)}
                </text>

              </g>
            );
          })}

          {/* STRATEGY LINES */}

          {visibleSeries.map(item => {
            const config = STRATEGIES[item.strategy];

            if (!config) return null;

            const path = buildPath(item.values);

            const lastPoint = item.values[item.values.length - 1];

            return (
              <g key={item.strategy}>

                <title>
                  {config.label}: {formatNumber(lastPoint.value)} {unit}
                </title>

                <path
                  d={path}
                  fill="none"
                  stroke={config.color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="chart-line"
                />

                <circle
                  cx={xPosition(lastPoint.time)}
                  cy={yPosition(lastPoint.value)}
                  r="5"
                  fill={config.color}
                  stroke="white"
                  strokeWidth="2"
                />

              </g>
            );
          })}

        </svg>

      </div>

      {/* LEGEND */}

      <div className="chart-legend">
        {visibleSeries.map(item => {
          const config = STRATEGIES[item.strategy];

          if (!config) return null;

          return (
            <span key={item.strategy}>
              <i style={{ background: config.color }} />
              {config.label}
            </span>
          );
        })}
      </div>

      <div className="chart-footer">
        <span>
          <i className="chart-footer-dot" />
          Prometheus time-series data
        </span>

        <span>
          {allPoints.length} samples
        </span>
      </div>

    </section>
  );
}
