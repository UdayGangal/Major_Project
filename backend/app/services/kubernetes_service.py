
import json
import re
import subprocess

from ..config import KUBECTL_BIN, LOG_TAIL, TECHNIQUES


class KubernetesError(RuntimeError):
    pass


def kubectl(args, timeout=20):
    try:
        result = subprocess.run(
            [KUBECTL_BIN, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=True,
        )
        return result.stdout

    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        FileNotFoundError,
    ) as exc:
        detail = getattr(exc, "stderr", None) or str(exc)
        raise KubernetesError(detail.strip()) from exc


def get_pods(technique):
    config = TECHNIQUES[technique]

    output = kubectl([
        "get", "pods",
        "-n", config["namespace"],
        "-l", config["selector"],
        "-o", "json",
    ])

    return json.loads(output).get("items", [])


def get_pod_status(technique):
    rows = []

    for pod in get_pods(technique):
        metadata = pod.get("metadata", {})
        status = pod.get("status", {})

        ready = any(
            condition.get("type") == "Ready"
            and condition.get("status") == "True"
            for condition in status.get("conditions", [])
        )

        rows.append({
            "name": metadata.get("name"),
            "phase": status.get("phase", "Unknown"),
            "ready": ready,
            "version": metadata.get("labels", {}).get("version", "—"),
            "created_at": metadata.get("creationTimestamp"),
        })

    return rows


def get_pod_logs(technique):
    config = TECHNIQUES[technique]
    namespace = config["namespace"]

    rows = []

    for pod in get_pods(technique):
        name = pod.get("metadata", {}).get("name", "unknown")

        try:
            output = kubectl([
                "logs",
                name,
                "-n", namespace,
                f"--tail={LOG_TAIL}",
                "--timestamps=true",
            ], timeout=15)

            rows.extend(
                {"source": name, "message": line}
                for line in output.splitlines()
                if line.strip()
            )

        except KubernetesError as exc:
            rows.append({
                "source": name,
                "message": f"[log retrieval error] {exc}",
            })

    return rows


def extract_version(value):
    """
    Extract version identifiers such as v1 or v2
    from labels and container image references.
    """
    if not value:
        return None

    match = re.search(
        r"(?<![a-zA-Z0-9])(v\d+)(?![a-zA-Z0-9])",
        str(value),
        re.IGNORECASE,
    )

    return match.group(1).lower() if match else None


def get_pod_version(pod):
    metadata = pod.get("metadata", {})
    labels = metadata.get("labels", {})

    # First check pod version labels
    version = (
        extract_version(labels.get("version"))
        or extract_version(labels.get("app.kubernetes.io/version"))
    )

    if version:
        return version

    # Check container images from the pod specification
    images = set()

    for container in pod.get("spec", {}).get("containers", []):
        image = container.get("image", "")
        version = extract_version(image)

        if version:
            images.add(version)

    # Also check actual container status images
    for container in pod.get("status", {}).get("containerStatuses", []):
        image = container.get("image", "")
        version = extract_version(image)

        if version:
            images.add(version)

    return next(iter(images)) if len(images) == 1 else None


def get_pod_versions(technique):
    versions = []

    for pod in get_pods(technique):
        version = get_pod_version(pod)

        if version and version not in versions:
            versions.append(version)

    return versions


def get_deployed_version(technique):
    """
    Detect versions of ready application pods selected by
    the strategy's Kubernetes Service.
    """

    if technique not in TECHNIQUES:
        raise KubernetesError(
            f"Unknown deployment technique: {technique}"
        )

    config = TECHNIQUES[technique]
    namespace = config["namespace"]
    service_name = config["service"]

    # Get the Service configuration
    service_output = kubectl([
        "get", "service", service_name,
        "-n", namespace,
        "-o", "json",
    ])

    service = json.loads(service_output)
    selector = service.get("spec", {}).get("selector", {})

    if not selector:
        raise KubernetesError(
            f"No selector found for service {service_name}"
        )

    # Convert Service selector into kubectl label selector
    selector_string = ",".join(
        f"{key}={value}"
        for key, value in selector.items()
    )

    # Get pods selected by the Service
    pods_output = kubectl([
        "get", "pods",
        "-n", namespace,
        "-l", selector_string,
        "-o", "json",
    ])

    pods = json.loads(pods_output).get("items", [])

    versions = set()

    for pod in pods:
        status = pod.get("status", {})

        # Only consider ready pods
        ready = any(
            condition.get("type") == "Ready"
            and condition.get("status") == "True"
            for condition in status.get("conditions", [])
        )

        if not ready:
            continue

        version = get_pod_version(pod)

        if version:
            versions.add(version)

    if not versions:
        raise KubernetesError(
            f"Could not detect a ready application version for {technique}. "
            "Check the Service selector, pod labels and image tags."
        )

    return "+".join(sorted(versions))
