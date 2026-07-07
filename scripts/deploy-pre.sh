#!/usr/bin/env bash

set -euo pipefail

SERVER_HOST="${H5_SERVER_PRO_HOST:-10.72.231.238}"
SERVER_PORT="${H5_SERVER_PRO_PORT:-22}"
SERVER_USER="${H5_SERVER_PRO_ACCOUNT:?请先设置 H5_SERVER_PRO_ACCOUNT}"
SERVER_PASSWORD="${H5_SERVER_PRO_PASSWORD:?请先设置 H5_SERVER_PRO_PASSWORD}"
DEPLOY_PATH="${H5_SERVER_PRO_PATH:-/home/pre-h5/landPage}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
ARCHIVE="/tmp/landpage-pre-${TIMESTAMP}.tar.gz"
REMOTE_ARCHIVE="/tmp/landpage-pre-${TIMESTAMP}.tar.gz"
REMOTE_TMP="${DEPLOY_PATH}.tmp.${TIMESTAMP}"
REMOTE_TARGET="${SERVER_USER}@${SERVER_HOST}"

cleanup() {
    rm -f "$ARCHIVE"
}
trap cleanup EXIT

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "缺少命令：$1"
        exit 1
    fi
}

run_scp() {
    export DEPLOY_PORT="$SERVER_PORT"
    export DEPLOY_SOURCE="$ARCHIVE"
    export DEPLOY_TARGET="${REMOTE_TARGET}:${REMOTE_ARCHIVE}"

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

require_command npm
require_command tar
require_command scp
require_command ssh
require_command expect

cd "$ROOT_DIR"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
    npm run build:pre
fi

if [[ ! -d "$ROOT_DIR/dist" ]]; then
    echo "未找到 dist 目录，请先确认构建是否成功。"
    exit 1
fi

echo "打包 dist..."
tar -czf "$ARCHIVE" -C "$ROOT_DIR/dist" .

echo "上传到 ${SERVER_HOST}:${REMOTE_ARCHIVE}..."
run_scp

echo "部署到 ${SERVER_HOST}:${DEPLOY_PATH}..."
REMOTE_COMMAND="set -e; mkdir -p '${DEPLOY_PATH}'; rm -rf '${REMOTE_TMP}'; mkdir -p '${REMOTE_TMP}'; tar -xzf '${REMOTE_ARCHIVE}' -C '${REMOTE_TMP}'; find '${DEPLOY_PATH}' -mindepth 1 -maxdepth 1 -exec rm -rf {} \\;; cp -a '${REMOTE_TMP}'/. '${DEPLOY_PATH}'/; rm -rf '${REMOTE_TMP}' '${REMOTE_ARCHIVE}'"
run_ssh "$REMOTE_COMMAND"

echo "预发布部署完成：${SERVER_HOST}:${DEPLOY_PATH}"
