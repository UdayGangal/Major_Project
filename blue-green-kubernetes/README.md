# Blue-Green Kubernetes Deployment

This folder adds an isolated Blue-Green implementation alongside the existing Rolling Deployment.

## Assumptions

- Kubernetes context is already connected to your Docker Desktop cluster.
- Namespace: `default`.
- Blue image: `shonnnttyyy/rolling-demo:v1`.
- Green image: `shonnnttyyy/rolling-demo:v2.1`.
- Both Flask images listen on port `5000` and expose `/health`.
- Prometheus Service is named `prometheus` and listens on port `9090`.

If your published Green image uses a different tag, update `green-deployment.yaml` before applying it.

## Files

- `blue-deployment.yaml`: four V1 pods labelled `version: blue`.
- `green-deployment.yaml`: four V2 pods labelled `version: green`.
- `service.yaml`: sends all application traffic to Blue initially.
- `k6-load.yaml`: 20 virtual users for 15 minutes, targeting whichever version the Service selects.
- `prometheus.yaml`: Prometheus RBAC, config, Deployment and Service. K6 remote-write metrics are sent to this Prometheus instance.

## Deploy

Run these commands from the project root (`rolling-deployement`):

```powershell
kubectl apply -f kubernetes/blue-green/blue-deployment.yaml
kubectl apply -f kubernetes/blue-green/green-deployment.yaml
kubectl apply -f kubernetes/blue-green/service.yaml
kubectl apply -f kubernetes/blue-green/prometheus.yaml
```

Wait for the workloads:

```powershell
kubectl rollout status deployment/blue-deployment
kubectl rollout status deployment/green-deployment
kubectl rollout status deployment/prometheus
kubectl get pods -l app=rolling-demo -L version
```

## Access the application

```powershell
kubectl port-forward service/blue-green-service 8081:80
```

Open http://localhost:8081. The Service initially routes to Blue.

## Switch traffic without editing YAML

Switch all Service traffic to Green:

```powershell
kubectl patch service blue-green-service --type merge -p '{"spec":{"selector":{"app":"rolling-demo","version":"green"}}}'
```

Switch all Service traffic to Blue:

```powershell
kubectl patch service blue-green-service --type merge -p '{"spec":{"selector":{"app":"rolling-demo","version":"blue"}}}'
```

Verify the selected endpoints:

```powershell
kubectl get endpoints blue-green-service
kubectl get pods -l app=rolling-demo -L version
```

The patch changes the live Service object only. It does not edit `service.yaml`.

## Run K6

Apply the K6 manifest:

```powershell
kubectl apply -f kubernetes/blue-green/k6-load.yaml
```

View progress and logs:

```powershell
kubectl get jobs
kubectl logs job/blue-green-k6
```

After the Job completes, delete it before running the same Job again:

```powershell
kubectl delete job blue-green-k6
kubectl apply -f kubernetes/blue-green/k6-load.yaml
```

Run a separate test while Blue is active and while Green is active if you want comparable results. Do not switch versions during a test if you want each result to represent one version only.

## Open Prometheus

```powershell
kubectl port-forward service/prometheus 9090:9090
```

Open http://localhost:9090.

K6 remote-write metrics go to Prometheus. The application pod scrape job only collects app metrics if the Flask containers expose a Prometheus `/metrics` endpoint and the pods carry the required scrape annotations. The supplied Flask app manifests do not assume such an endpoint exists.

## Resource note

The Blue-Green deployments request 8 application pods total. If the existing Rolling deployment is still running with 4 pods, your cluster may need resources for 12 application pods plus Prometheus and K6. If pods remain Pending, inspect:

```powershell
kubectl describe pods
kubectl get events --sort-by=.lastTimestamp
```

Do not delete the existing Rolling resources. If necessary, consider temporarily scaling the Rolling deployment down after confirming you no longer need it running:

```powershell
kubectl scale deployment rolling-demo --replicas=0
```

Restore it later with:

```powershell
kubectl scale deployment rolling-demo --replicas=4
```

## Important

This is traditional Blue-Green: the Service routes 100% of traffic to one version at a time. Kubernetes Service selectors do not provide 50/50 or weighted traffic splitting. Weighted progressive traffic shifting requires a traffic-management layer such as Istio.
