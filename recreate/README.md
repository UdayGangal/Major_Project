
# Recreate Deployment Experiment

This folder implements the Recreate deployment strategy for the existing Flask website in the Major_Project repository.

## Application

The experiment uses the existing application images:

- `swain15/rolling-demo:v1`
- `swain15/rolling-demo:v2`

The website is accessed through the Kubernetes Service `recreate-demo-service`.

## Kubernetes Resources

| Resource | Name |
|---|---|
| Deployment | `recreate-demo` |
| Service | `recreate-demo-service` |
| k6 ConfigMap | `recreate-demo-k6-script` |
| k6 Job | `recreate-demo-k6-run` |

The Recreate resources are separate from the existing Rolling Update resources, so both deployment implementations can coexist in the same Kubernetes cluster.

## Files

- `deployment-v1.yaml` — deploys application version V1 using the Recreate strategy.
- `deployment-v2.yaml` — deploys application version V2 using the Recreate strategy.
- `service.yaml` — exposes the application inside the cluster.
- `k6-recreate.yaml` — defines the 20-VU, 15-minute load test and sends metrics to Prometheus.
- `commands.txt` — command reference for running the experiment.
- `recreate-k6-final.txt` — captured k6 output from the completed experiment.

## Prerequisites

- A running Kubernetes cluster.
- `kubectl` configured for the intended cluster.
- Docker images V1 and V2 available from Docker Hub.
- Prometheus running in the `default` namespace with the remote-write receiver enabled.
- The project root open in PowerShell.

Check the active Kubernetes context before running:

```powershell
kubectl config current-context
kubectl get nodes
kubectl get svc prometheus
```

## Run the Experiment

### 1. Deploy V1

```powershell
kubectl apply -f .\recreate\deployment-v1.yaml
kubectl apply -f .\recreate\service.yaml
kubectl rollout status deployment/recreate-demo --timeout=5m
```

### 2. Access the website

Run in a separate PowerShell terminal:

```powershell
kubectl port-forward svc/recreate-demo-service 8080:80
```

Keep this terminal running. Open:

- Homepage: http://localhost:8080/
- Version: http://localhost:8080/version
- Health: http://localhost:8080/health

### 3. Start the load test

Remove an earlier completed test before rerunning:

```powershell
kubectl delete job recreate-demo-k6-run --ignore-not-found
kubectl delete configmap recreate-demo-k6-script --ignore-not-found
```

Apply the k6 configuration:

```powershell
kubectl apply -f .\recreate\k6-recreate.yaml
```

Allow the test to establish baseline traffic before deploying V2.

### 4. Deploy V2 during the load test

In another PowerShell terminal:

```powershell
$start = Get-Date
kubectl apply -f .\recreate\deployment-v2.yaml
kubectl rollout status deployment/recreate-demo --timeout=5m
$end = Get-Date

"Deployment rollout duration: {0:N2} seconds" -f ($end - $start).TotalSeconds
```

With the Recreate strategy, the old Pods are terminated before replacement Pods are created. Requests may fail while no ready application Pods are available.

### 5. Verify V2 and collect results

```powershell
kubectl get deployment recreate-demo -o wide
kubectl get pods -l app=recreate-demo -o wide
kubectl get endpointslice -l kubernetes.io/service-name=recreate-demo-service
kubectl get job recreate-demo-k6-run
```

After the k6 Job completes:

```powershell
kubectl logs job/recreate-demo-k6-run | Tee-Object -FilePath .\recreate\recreate-k6-final.txt
```

## Recorded Experiment Results

The following results are from one completed 15-minute run with 20 virtual users.

| Metric | Observed result |
|---|---:|
| Total HTTP requests | 68,832 |
| HTTP request failure rate | 0.32% |
| Failed HTTP requests | 222 |
| Checks succeeded | 99.67% |
| Average HTTP response time | 2.32 ms |
| Median HTTP response time | 1.83 ms |
| P90 response time | 3.42 ms |
| P95 response time | 4.34 ms |
| Maximum HTTP response time | 1.1 s |
| Completed iterations | 34,416 |
| Interrupted iterations | 0 |
| Virtual users | 20 |
| Test duration | 15 minutes |
| Measured V1-to-V2 rollout duration | 196.87 seconds |

The overall k6 failure rate covers the complete test and does not identify exactly when each failed request occurred. Do not interpret all 222 failures as deployment-period failures.

The recorded rollout duration is not itself an exact measurement of website downtime.

## Cleanup

After saving the results, the k6 resources can be removed:

```powershell
kubectl delete job recreate-demo-k6-run
kubectl delete configmap recreate-demo-k6-script
```

The Recreate Deployment and Service can remain running to keep the V2 website available.
