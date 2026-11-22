
const ICONS = {
  'Healthy Pods': '◈',
  'Request Rate': '↗',
  'Requests / Sec': '↗',
  'Total Requests / Sec': '↗',
  'HTTP Error Rate': '!',
  'Error Rate': '!',
  'P95 Latency': '◷',
  'Active k6 Series': '▥',
};

const TONE_LABELS = {
  green: 'HEALTH',
  blue: 'TRAFFIC',
  orange: 'LOAD',
  red: 'ERROR',
  purple: 'LATENCY'
};

export default function StatCard({
  label,
  value,
  detail,
  tone = 'blue'
}) {
  const icon = ICONS[label] || '◉';

  const isMissing =
    value === null ||
    value === undefined ||
    value === '—';

  return (
    <article className={`stat-card stat-card-${tone}`}>

      <div className="stat-card-header">
        <div className="stat-card-label">
          <span className="stat-card-icon">
            {icon}
          </span>

          <span>{label}</span>
        </div>

        <span className="stat-card-category">
          {TONE_LABELS[tone] || 'METRIC'}
        </span>
      </div>

      <div className="stat-card-body">
        <h2 className={isMissing ? 'stat-value missing' : 'stat-value'}>
          {isMissing ? '—' : value}
        </h2>
      </div>

      <div className="stat-card-footer">
        <span className="stat-card-footer-dot" />
        <small>{detail || 'Monitoring metric'}</small>
      </div>

      <div className="stat-card-accent" />

    </article>
  );
}
