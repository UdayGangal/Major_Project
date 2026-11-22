const STRATEGIES = [
  ['rolling', 'Rolling Update'],
  ['recreate', 'Recreate'],
  ['blue-green', 'Blue-Green']
];

const format = value =>
  value == null || !Number.isFinite(Number(value))
    ? 'N/A'
    : Number(value).toFixed(2);

const csvCell = value =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

const escapeHtml = value =>
  String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

export default function ReportExport({
  data = {},
  pods = [],
  k6Metrics = [],
  lastUpdated
}) {
  const generatedAt = new Date().toLocaleString();

  const strategyRows = STRATEGIES.map(([key, name]) => {
    const stats = data[key]?.stats || {};

    return {
      name,
      healthy: stats.healthy,
      total: stats.total,
      rps: stats.rps,
      errors: stats.errors,
      p95: stats.p95 == null ? null : stats.p95 * 1000
    };
  });

  const downloadCSV = () => {
    const rows = [
      ['DEPLOYOPS DASHBOARD REPORT'],
      ['Generated At', generatedAt],
      ['Last Metrics Update', lastUpdated?.toLocaleString() || 'Unavailable'],
      [],
      ['STRATEGY PERFORMANCE'],
      ['Strategy', 'Healthy Pods', 'Total Pods', 'Requests/sec', '5xx Error Rate (%)', 'P95 Latency (ms)'],
      ...strategyRows.map(item => [
        item.name,
        format(item.healthy),
        format(item.total),
        format(item.rps),
        format(item.errors),
        format(item.p95)
      ]),
      [],
      ['POD INVENTORY'],
      ['Pod Name', 'Strategy', 'Version', 'Health'],
      ...pods.map(pod => [
        pod.name,
        pod.strategy,
        pod.version,
        pod.healthy ? 'Healthy' : 'Unhealthy'
      ]),
      [],
      ['K6 METRIC SERIES', k6Metrics.length]
    ];

    const csv = rows
      .map(row => row.map(csvCell).join(','))
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `DeployOps_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const strategyTable = strategyRows.map(item => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(format(item.healthy))} / ${escapeHtml(format(item.total))}</td>
        <td>${escapeHtml(format(item.rps))}</td>
        <td>${escapeHtml(format(item.errors))}%</td>
        <td>${escapeHtml(format(item.p95))} ms</td>
      </tr>
    `).join('');

    const podTable = pods.map(pod => `
      <tr>
        <td>${escapeHtml(pod.name)}</td>
        <td>${escapeHtml(pod.strategy)}</td>
        <td>${escapeHtml(pod.version)}</td>
        <td>${pod.healthy ? 'Healthy' : 'Unhealthy'}</td>
      </tr>
    `).join('');

    const reportWindow = window.open('', '_blank');

    if (!reportWindow) {
      window.alert('Please allow pop-ups to generate the PDF report.');
      return;
    }

    reportWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>DeployOps Dashboard Report</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #1e293b;
            padding: 35px;
          }
          h1 { margin-bottom: 5px; }
          h2 {
            margin-top: 30px;
            font-size: 17px;
          }
          p { color: #64748b; font-size: 12px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 14px;
          }
          th, td {
            padding: 10px;
            border: 1px solid #e2e8f0;
            text-align: left;
            font-size: 11px;
            overflow-wrap: anywhere;
          }
          th {
            background: #f1f5f9;
          }
          .note {
            margin-top: 25px;
            font-size: 11px;
            color: #64748b;
          }
          @media print {
            body { padding: 0; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>DeployOps</h1>
        <p>Cloud-Native Deployment Monitoring Report</p>
        <p>Generated: ${escapeHtml(generatedAt)}</p>
        <p>Last metrics update: ${escapeHtml(lastUpdated?.toLocaleString() || 'Unavailable')}</p>

        <h2>Strategy Performance Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Healthy Pods</th>
              <th>Requests/sec</th>
              <th>5xx Errors</th>
              <th>P95 Latency</th>
            </tr>
          </thead>
          <tbody>${strategyTable}</tbody>
        </table>

        <h2>Pod Inventory</h2>
        <table>
          <thead>
            <tr>
              <th>Pod Name</th>
              <th>Strategy</th>
              <th>Version</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            ${podTable || '<tr><td colspan="4">No Pod records available</td></tr>'}
          </tbody>
        </table>

        <p class="note">
          Report generated from the currently available dashboard data.
          Missing metrics are not estimated. K6 metric series: ${k6Metrics.length}.
        </p>
      </body>
      </html>
    `);

    reportWindow.document.close();
    reportWindow.focus();

    setTimeout(() => reportWindow.print(), 300);
  };

  return (
    <section className="panel report-export">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">REPORTING CENTER</p>
          <h2>Export Reports</h2>
          <p className="report-subtitle">
            Generate downloadable performance and infrastructure reports
          </p>
        </div>
        <span className="report-live-tag">LIVE DATA</span>
      </div>

      <div className="report-actions">
        <button type="button" onClick={downloadCSV} className="report-button csv">
          <span>▤</span>
          <div>
            <strong>Export CSV</strong>
            <small>Download metrics and Pod inventory</small>
          </div>
        </button>

        <button type="button" onClick={exportPDF} className="report-button pdf">
          <span>▧</span>
          <div>
            <strong>Export PDF</strong>
            <small>Print or save a formatted report</small>
          </div>
        </button>
      </div>

      <p className="report-footnote">
        Reports contain the current dashboard snapshot. Missing data is
        displayed as unavailable, not estimated.
      </p>
    </section>
  );
}