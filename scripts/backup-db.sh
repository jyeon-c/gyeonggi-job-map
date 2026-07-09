#!/usr/bin/env bash
set -euo pipefail

# 경기도 일자리맵 PostgreSQL/PostGIS 백업 스크립트.
# EC2 서버의 저장소 루트에서 Docker Compose db 서비스에 pg_dump 를 실행한다.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BACKUP_DIR="${DB_BACKUP_DIR:-${HOME}/jobmap-backups}"
RETENTION_DAYS="${DB_BACKUP_RETENTION_DAYS:-14}"
COMPOSE_SERVICE="${DB_BACKUP_COMPOSE_SERVICE:-db}"

cd "${PROJECT_DIR}"

if [[ ! -f ".env" ]]; then
  echo "[backup-db] .env 파일을 찾을 수 없습니다: ${PROJECT_DIR}/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source ".env"
set +a

DB_NAME="${DB_NAME:-jobmap}"
DB_USERNAME="${DB_USERNAME:-jobmap}"

if [[ -z "${DB_PASSWORD:-}" ]]; then
  echo "[backup-db] DB_PASSWORD 가 .env 에 설정되어 있지 않습니다." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/jobmap_${DB_NAME}_${TIMESTAMP}.dump"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

echo "[backup-db] 시작: database=${DB_NAME}, output=${BACKUP_FILE}"

docker compose exec -T \
  -e PGPASSWORD="${DB_PASSWORD}" \
  "${COMPOSE_SERVICE}" \
  pg_dump -U "${DB_USERNAME}" -d "${DB_NAME}" -Fc --no-owner --no-acl \
  > "${BACKUP_FILE}"

sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"

find "${BACKUP_DIR}" -type f -name "jobmap_*.dump" -mtime +"${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -type f -name "jobmap_*.dump.sha256" -mtime +"${RETENTION_DAYS}" -delete

echo "[backup-db] 완료: $(du -h "${BACKUP_FILE}" | awk '{print $1}')"
echo "[backup-db] 체크섬: ${CHECKSUM_FILE}"
