
export default function StatCard({ label, value, detail, tone = '' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <p>{label}</p>
      <h2>{value ?? '—'}</h2>
      <small>{detail}</small>
    </div>
  );
}
