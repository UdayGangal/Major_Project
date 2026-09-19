# Rolling deployment dashboard

This React dashboard contains no example metrics. Every number, chart, Pod row, and traffic percentage comes from a live Prometheus query. It refreshes every five seconds.

## Start the monitoring pipeline

From `rolling-deployement`, deploy Prometheus before running the dashboard:

```cmd
kubectl apply -f monitoring\prometheus.yaml
kubectl rollout status deployment/prometheus
```

The application images must be rebuilt and pushed after the `/metrics` changes:

```cmd
cd app-v1
docker build -t swain15/rolling-demo:v1 .
docker push swain15/rolling-demo:v1
cd ..\app-v2
docker build -t swain15/rolling-demo:v2 .
docker push swain15/rolling-demo:v2
cd ..
kubectl rollout restart deployment/rolling-demo
```

Start k6 after Prometheus is available. The Job sends runtime metrics to Prometheus through remote write:

```cmd
kubectl delete job rolling-demo-k6 --ignore-not-found
kubectl apply -f loadtest\k6-load.yaml
```

## Run the dashboard locally

Use one terminal to expose Prometheus:

```cmd
kubectl port-forward service/prometheus 9090:9090
```

Use a second terminal:

```cmd
cd dashboard
npm install
npm run dev
```

Open the local Vite URL, normally `http://localhost:5173`. The Vite proxy forwards browser queries to the local Prometheus port-forward, so Prometheus does not need a public Service.

If Prometheus or a metric source is unavailable, the dashboard shows an unavailable state rather than fabricated values.
