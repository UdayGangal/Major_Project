import json, subprocess
from ..config import KUBECTL_BIN, NAMESPACE, LOG_TAIL, TECHNIQUES

class KubernetesError(RuntimeError): pass

def kubectl(args, timeout=20):
    try:
        p = subprocess.run([KUBECTL_BIN, *args], capture_output=True, text=True, timeout=timeout, check=True)
        return p.stdout
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
        detail = getattr(e, "stderr", None) or str(e)
        raise KubernetesError(detail.strip()) from e

def get_pods(technique):
    cfg = TECHNIQUES[technique]
    return json.loads(kubectl(["get","pods","-n",NAMESPACE,"-l",cfg["selector"],"-o","json"])).get("items", [])

def get_pod_status(technique):
    rows = []
    for pod in get_pods(technique):
        m, s = pod.get("metadata",{}), pod.get("status",{})
        ready = any(c.get("type")=="Ready" and c.get("status")=="True" for c in s.get("conditions",[]))
        rows.append({"name":m.get("name"),"phase":s.get("phase","Unknown"),"ready":ready,"version":m.get("labels",{}).get("version","—"),"created_at":m.get("creationTimestamp")})
    return rows

def get_pod_logs(technique):
    rows = []
    for pod in get_pods(technique):
        name = pod.get("metadata",{}).get("name","unknown")
        try:
            out = kubectl(["logs",name,"-n",NAMESPACE,f"--tail={LOG_TAIL}","--timestamps=true"], timeout=15)
            rows.extend({"source":name,"message":line} for line in out.splitlines() if line.strip())
        except KubernetesError as e:
            rows.append({"source":name,"message":f"[log retrieval error] {e}"})
    return rows
