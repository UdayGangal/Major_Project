
const API_ROOT = '/prometheus/api/v1';

async function request(path, params = {}) {
  const response = await fetch(
    `${API_ROOT}${path}?${new URLSearchParams(params)}`
  );

  if (!response.ok) {
    throw new Error(`Prometheus API error: ${response.status}`);
  }

  const body = await response.json();

  if (body.status !== 'success') {
    throw new Error(body.error || 'Prometheus query failed');
  }

  return body.data.result;
}

export const query = (promql) =>
  request('/query', { query: promql });

export const queryRange = (promql, start, end, step = '5s') =>
  request('/query_range', {
    query: promql,
    start: String(start),
    end: String(end),
    step
  });

export function valueOf(result) {
  return result?.[0] ? Number(result[0].value[1]) : null;
}

export function seriesValues(result) {
  return result.map(series => ({
    labels: series.metric,
    value: Number(series.value[1])
  }));
}

export function historyValues(result) {
  return result.map(series => ({
    labels: series.metric,
    values: series.values.map(([time, value]) => ({
      time: Number(time) * 1000,
      value: Number(value)
    }))
  }));
}
