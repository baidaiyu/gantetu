#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APP_DIR="${APP_DIR:-/home/jsp-progress-manager}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
LOG_DIR="${LOG_DIR:-$APP_DIR/logs}"
CONTAINER_NAME="${CONTAINER_NAME:-jsp-progress-manager}"
IMAGE_NAME="${IMAGE_NAME:-jsp-progress-manager}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
HOST_BIND="${HOST_BIND:-127.0.0.1}"
HOST_PORT="${HOST_PORT:-4174}"
CONTAINER_PORT="${CONTAINER_PORT:-4174}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令：$1"
    exit 1
  fi
}

require_command docker

mkdir -p "$APP_DIR" "$DATA_DIR" "$LOG_DIR"

cd "$ROOT_DIR"

echo "构建 Docker 镜像：${IMAGE_NAME}:${IMAGE_TAG}"
docker build --tag "${IMAGE_NAME}:${IMAGE_TAG}" .

if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  echo "停止并删除旧容器：$CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

echo "启动容器：$CONTAINER_NAME"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${HOST_BIND}:${HOST_PORT}:${CONTAINER_PORT}" \
  -e HOST=0.0.0.0 \
  -e PORT="$CONTAINER_PORT" \
  -v "$DATA_DIR:/app/data" \
  "${IMAGE_NAME}:${IMAGE_TAG}"

echo "等待服务启动..."
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${CONTAINER_PORT}/', timeout=1).read()" >/dev/null 2>&1; then
    echo "容器内首页自检通过"
    break
  fi
  sleep 1
done

if ! docker exec "$CONTAINER_NAME" python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${CONTAINER_PORT}/', timeout=2).read()" >/dev/null 2>&1; then
  echo "服务启动失败，最近日志："
  docker logs --tail 80 "$CONTAINER_NAME" || true
  exit 1
fi

echo
echo "部署完成："
echo "  镜像：${IMAGE_NAME}:${IMAGE_TAG}"
echo "  容器：$CONTAINER_NAME"
echo "  数据目录：$DATA_DIR"
echo "  本机访问：http://${HOST_BIND}:${HOST_PORT}"
echo
echo "查看日志："
echo "  docker logs -f $CONTAINER_NAME"
