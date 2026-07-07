#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${H5_SERVER_PRO_HOST:-10.72.231.238}"
SERVER_PORT="${H5_SERVER_PRO_PORT:-22}"
SERVER_USER="${H5_SERVER_PRO_ACCOUNT:-}"
SERVER_PASSWORD="${H5_SERVER_PRO_PASSWORD:-}"

REMOTE_APP_DIR="${JSP_PROGRESS_REMOTE_APP_DIR:-/home/jsp-progress-manager}"
CONTAINER_NAME="${JSP_PROGRESS_CONTAINER_NAME:-jsp-progress-manager}"
IMAGE_NAME="${JSP_PROGRESS_IMAGE_NAME:-jsp-progress-manager}"
IMAGE_TAG="${JSP_PROGRESS_IMAGE_TAG:-pre-$(date +%Y%m%d%H%M%S)}"
HOST_BIND="${JSP_PROGRESS_HOST_BIND:-0.0.0.0}"
HOST_PORT="${JSP_PROGRESS_HOST_PORT:-4180}"
CONTAINER_PORT="${JSP_PROGRESS_CONTAINER_PORT:-4174}"
DOCKER_PLATFORM="${JSP_PROGRESS_DOCKER_PLATFORM:-linux/amd64}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/docker-artifacts"
IMAGE_TAR="$ARTIFACT_DIR/${IMAGE_NAME}-${IMAGE_TAG}.tar"
REMOTE_IMAGE_TAR="$REMOTE_APP_DIR/${IMAGE_NAME}-${IMAGE_TAG}.tar"
REMOTE_DEPLOY_SCRIPT="$REMOTE_APP_DIR/deploy-docker-image.sh"
REMOTE_TARGET="${SERVER_USER}@${SERVER_HOST}"

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

usage() {
  cat <<'USAGE'
用法:
  ./scripts/publish-docker-pre.sh

必需环境变量:
  H5_SERVER_PRO_ACCOUNT              SSH 账号
  H5_SERVER_PRO_PASSWORD             SSH 密码

可选环境变量:
  H5_SERVER_PRO_HOST                 默认 10.72.231.238
  H5_SERVER_PRO_PORT                 默认 22
  JSP_PROGRESS_REMOTE_APP_DIR        默认 /home/jsp-progress-manager
  JSP_PROGRESS_CONTAINER_NAME        默认 jsp-progress-manager
  JSP_PROGRESS_IMAGE_NAME            默认 jsp-progress-manager
  JSP_PROGRESS_IMAGE_TAG             默认 pre-时间戳
  JSP_PROGRESS_HOST_BIND             默认 0.0.0.0
  JSP_PROGRESS_HOST_PORT             默认 4180
  JSP_PROGRESS_CONTAINER_PORT        默认 4174
  JSP_PROGRESS_DOCKER_PLATFORM       默认 linux/amd64

说明:
  这个脚本会构建 Docker 镜像、上传镜像包到测试服务器，并重建同名容器。
  数据目录固定挂载到 ${JSP_PROGRESS_REMOTE_APP_DIR:-/home/jsp-progress-manager}/data。
USAGE
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少本机命令：$1"
    exit 1
  fi
}

run_scp() {
  export DEPLOY_PORT="$SERVER_PORT"
  export DEPLOY_SOURCE="$1"
  export DEPLOY_TARGET="${REMOTE_TARGET}:$2"

  expect <<'EXPECT'
set timeout -1
set password $env(H5_SERVER_PRO_PASSWORD)
set port $env(DEPLOY_PORT)
set source $env(DEPLOY_SOURCE)
set target $env(DEPLOY_TARGET)

spawn scp -P $port -o StrictHostKeyChecking=accept-new $source $target
expect {
  -re "(?i)yes/no" {
    send "yes\r"
    exp_continue
  }
  -re "(?i)password:" {
    send "$password\r"
    exp_continue
  }
  eof
}

catch wait result
exit [lindex $result 3]
EXPECT
}

run_ssh() {
  export DEPLOY_PORT="$SERVER_PORT"
  export DEPLOY_REMOTE="$REMOTE_TARGET"
  export DEPLOY_COMMAND="$1"

  expect <<'EXPECT'
set timeout -1
set password $env(H5_SERVER_PRO_PASSWORD)
set port $env(DEPLOY_PORT)
set remote $env(DEPLOY_REMOTE)
set command $env(DEPLOY_COMMAND)

spawn ssh -p $port -o StrictHostKeyChecking=accept-new $remote $command
expect {
  -re "(?i)yes/no" {
    send "yes\r"
    exp_continue
  }
  -re "(?i)password:" {
    send "$password\r"
    exp_continue
  }
  eof
}

catch wait result
exit [lindex $result 3]
EXPECT
}

case "${1:-}" in
  -h|--help|help)
    usage
    exit 0
    ;;
  "")
    ;;
  *)
    usage
    exit 1
    ;;
esac

require_command docker
require_command expect
require_command ssh
require_command scp

if [[ -z "$SERVER_USER" ]]; then
  echo "请先设置 H5_SERVER_PRO_ACCOUNT"
  exit 1
fi

if [[ -z "$SERVER_PASSWORD" ]]; then
  echo "请先设置 H5_SERVER_PRO_PASSWORD"
  exit 1
fi

export H5_SERVER_PRO_PASSWORD="$SERVER_PASSWORD"

echo "发布配置："
echo "  服务器：${SERVER_HOST}:${SERVER_PORT}"
echo "  远端目录：$REMOTE_APP_DIR"
echo "  容器名：$CONTAINER_NAME"
echo "  镜像：${IMAGE_NAME}:${IMAGE_TAG}"
echo "  端口：${HOST_BIND}:${HOST_PORT}->${CONTAINER_PORT}"
echo "  平台：$DOCKER_PLATFORM"
echo

echo "1/4 构建本地 Docker 镜像包..."
IMAGE_NAME="$IMAGE_NAME" IMAGE_TAG="$IMAGE_TAG" DOCKER_PLATFORM="$DOCKER_PLATFORM" ARTIFACT_DIR="$ARTIFACT_DIR" "$ROOT_DIR/scripts/build-docker-image.sh"

if [[ ! -f "$IMAGE_TAR" ]]; then
  echo "镜像包生成失败：$IMAGE_TAR"
  exit 1
fi

echo
echo "2/4 准备远端目录..."
run_ssh "mkdir -p '$REMOTE_APP_DIR' '$REMOTE_APP_DIR/data' '$REMOTE_APP_DIR/logs'"

echo
echo "3/4 上传镜像包和部署脚本..."
run_scp "$IMAGE_TAR" "$REMOTE_IMAGE_TAR"
run_scp "$ROOT_DIR/scripts/deploy-docker-image.sh" "$REMOTE_DEPLOY_SCRIPT"

echo
echo "4/4 导入镜像并启动远端容器..."
REMOTE_COMMAND="chmod +x '$REMOTE_DEPLOY_SCRIPT' && APP_DIR='$REMOTE_APP_DIR' CONTAINER_NAME='$CONTAINER_NAME' IMAGE_NAME='$IMAGE_NAME' HOST_BIND='$HOST_BIND' HOST_PORT='$HOST_PORT' CONTAINER_PORT='$CONTAINER_PORT' '$REMOTE_DEPLOY_SCRIPT' '$REMOTE_IMAGE_TAR'"
run_ssh "$REMOTE_COMMAND"

echo
echo "发布完成。"
echo "远端数据目录：$REMOTE_APP_DIR/data"
echo "远端容器名：$CONTAINER_NAME"
echo "访问地址：http://$SERVER_HOST:$HOST_PORT"
