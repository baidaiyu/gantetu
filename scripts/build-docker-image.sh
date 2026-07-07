#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-jsp-progress-manager}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT_DIR/docker-artifacts}"
TAR_PATH="$ARTIFACT_DIR/${IMAGE_NAME}-${IMAGE_TAG}.tar"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令：$1"
    exit 1
  fi
}

require_command docker
mkdir -p "$ARTIFACT_DIR"

cd "$ROOT_DIR"

echo "构建 Docker 镜像：${IMAGE_NAME}:${IMAGE_TAG} ($DOCKER_PLATFORM)"
docker build \
  --platform "$DOCKER_PLATFORM" \
  --tag "${IMAGE_NAME}:${IMAGE_TAG}" \
  --tag "${IMAGE_NAME}:latest" \
  .

echo "导出镜像包：$TAR_PATH"
docker save "${IMAGE_NAME}:${IMAGE_TAG}" "${IMAGE_NAME}:latest" -o "$TAR_PATH"

echo
echo "构建完成："
echo "  镜像：${IMAGE_NAME}:${IMAGE_TAG}"
echo "  镜像包：$TAR_PATH"
echo
echo "上传到服务器示例："
echo "  scp '$TAR_PATH' root@10.72.231.238:/home/jsp-progress-manager/"
