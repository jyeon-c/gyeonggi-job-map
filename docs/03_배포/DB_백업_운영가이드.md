# DB 백업 운영 가이드

운영 DB는 EC2 Docker Compose 의 `db` 서비스(PostgreSQL/PostGIS)를 사용한다. 관리자 CRUD로 변경한 데이터가 운영 DB에 저장되므로, 서버 재시작·재배포와 별개로 정기 백업을 유지한다.

## 백업 방식

- 스크립트: `scripts/backup-db.sh`
- 백업 도구: `pg_dump`
- 백업 형식: PostgreSQL custom format(`.dump`)
- 저장 위치 기본값: `~/jobmap-backups`
- 보관 기간 기본값: 14일
- 체크섬: `.sha256` 파일 함께 생성

## 1회 수동 백업

EC2 서버에서 실행한다.

```bash
cd ~/gyeonggi-job-map
bash scripts/backup-db.sh
ls -lh ~/jobmap-backups
```

## 매일 자동 백업 등록

기본값은 매일 03:20 서버 로컬 시간에 실행한다.

```bash
cd ~/gyeonggi-job-map
bash scripts/install-db-backup-cron.sh
crontab -l
```

백업 로그는 아래 파일에 쌓인다.

```bash
tail -f ~/jobmap-backups/backup.log
```

## 설정값

필요하면 cron 등록 전 환경변수로 변경할 수 있다.

```bash
export DB_BACKUP_DIR=/home/ubuntu/jobmap-backups
export DB_BACKUP_RETENTION_DAYS=30
export DB_BACKUP_CRON_SCHEDULE="20 3 * * *"
bash scripts/install-db-backup-cron.sh
```

## 복구 예시

복구는 신중하게 진행한다. 기존 DB를 덮어쓸 수 있으므로 운영 반영 전에는 백업 파일과 대상 DB를 반드시 확인한다.

```bash
cd ~/gyeonggi-job-map
source .env
docker compose exec -T -e PGPASSWORD="$DB_PASSWORD" db \
  pg_restore -U "$DB_USERNAME" -d "$DB_NAME" --clean --if-exists --no-owner --no-acl \
  < ~/jobmap-backups/jobmap_jobmap_YYYYMMDD_HHMMSS.dump
```

## 점검 포인트

- `~/jobmap-backups` 에 최신 `.dump` 파일이 생성되는지 확인한다.
- `.sha256` 파일이 함께 생성되는지 확인한다.
- `backup.log` 에 실패 로그가 없는지 확인한다.
- EC2 디스크 용량이 부족하지 않은지 주기적으로 확인한다.
