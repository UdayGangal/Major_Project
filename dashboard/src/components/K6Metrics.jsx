
export default function K6Metrics({ metrics }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">LOAD TEST MONITORING</p>
          <h2>Existing k6 Virtual Users</h2>
        </div>
        <span>Remote-write metrics</span>
      </div>

      {metrics.length ? (
        <table>
          <thead>
            <tr>
              <th>Series labels</th>
              <th>Active VUs</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, index) => (
              <tr key={index}>
                <td>
                  <code>
                    {Object.entries(metric.labels)
                      .filter(([key]) => key !== '__name__')
                      .map(([key, value]) => `${key}=${value}`)
                      .join(', ') || 'Unlabelled series'}
                  </code>
                </td>
                <td>{metric.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">
          No k6 virtual-user samples currently available.
        </p>
      )}
    </section>
  );
}
