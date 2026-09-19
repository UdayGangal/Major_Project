export default function StatCard({ label, value, detail, tone = 'blue', index }) {
  return (
    <section className={`stat-card ${tone}`}>
      <div className="stat-top"><p>{label}</p><span>0{index}</span></div>
      <strong>{value ?? '—'}</strong>
      <small>{detail}</small>
    </section>
  );
}
