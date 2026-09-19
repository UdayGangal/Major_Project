const API_ROOT = '/prometheus/api/v1';

async function request(path, parameters) {
  const response = await fetch(`${API_ROOT}${path}?${new URLSearchParams(parameters)}`);
  if (!response.ok) throw new Error(`Prometheus returned ${response.status}`);

  const body = await response.json();
  if (body.status !== 'success') throw new Error(body.error || 'Prometheus query failed');
  return body.data.result;
}

export function query(query) {
  return request('/query', { query });
}

export function queryRange(queryText, start, end, step = '5s') {
  return request('/query_range', { query: queryText, start: String(start), end: String(end), step });
}

export function sampleValue(result) {
  return result?.[0] ? Number(result[0].value[1]) : null;
}

export function matrixValues(result) {
  return result?.[0]?.values?.map(([timestamp, value]) => ({ timestamp: timestamp * 1000, value: Number(value) })) ?? [];
}
