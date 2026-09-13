from flask import Flask, render_template, jsonify
import socket

app = Flask(__name__)


@app.route("/")
def home():
    return render_template(
        "v1.html",
        version="Version 1",
        hostname=socket.gethostname()
    )


@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "version": "v1"
    }), 200


@app.route("/version")
def version():
    return jsonify({
        "version": "v1",
        "pod_name": socket.gethostname()
    }), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)