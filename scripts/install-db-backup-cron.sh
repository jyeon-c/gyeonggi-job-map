#!/usr/bin/env bash
set -euo pipefail

# EC2 서버에서 PostgreSQL/PostGIS 자동 백업 cron 을 등록한다.
# 기본 실행 시각: 매일 03:20(KST, 서버 로컬 시간 기준)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BACKUP_DIR="${DB_BACKUP_DIR:-${HOME}/jobmap-backups}"
CRON_SCHEDULE="${DB_BACKUP_CRON_SCHEDULE:-20 3 * * *}"
LOG_FILE="${BACKUP_DIR}/backup.log"
COMMAND="/bin/bash ${PROJECT_DIR}/scripts/backup-db.sh >> ${LOG_FILE} 2>&1"
CRON_LINE="${CRON_SCHEDULE} ${COMMAND}"

mkdir -p "${BACKUP_DIR}"
chmod +x "${PROJECT_DIR}/scripts/backup-db.sh"

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -vF "${PROJECT_DIR}/scripts/backup-db.sh" > "${TMP_CRON}" || true
echo "${CRON_LINE}" >> "${TMP_CRON}"
crontab "${TMP_CRON}"
rm -f "${TMP_CRON}"

echo "[install-db-backup-cron] 등록 완료"
echo "[install-db-backup-cron] ${CRON_LINE}"
