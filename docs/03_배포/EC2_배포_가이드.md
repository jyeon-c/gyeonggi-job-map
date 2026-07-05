# EC2 배포 가이드 (경기도 일자리맵)

> AWS EC2 단일 인스턴스 + Docker Compose(nginx + backend + PostGIS) 배포 절차.
> 아래 "내 인스턴스 설정"은 2026-07-05 기준 실제 생성 시 선택한 값이다.

---

## 0. 내가 설정한 EC2 인스턴스 (기록)

| 항목 | 설정값 |
|---|---|
| 이름 | `gyeonggi-job-map` |
| AMI | **Ubuntu Server 24.04 LTS (HVM), SSD Volume Type** — 64비트(x86), `ami-0e4ab31f1847c850c` |
| 인스턴스 유형 | **t3.small** (2 vCPU / 2 GiB) |
| 키 페어 | `jobmap-key` (.pem 파일 로컬 보관) |
| VPC | 기본 VPC (172.31.0.0/16) |
| 퍼블릭 IP 자동 할당 | 활성화 |
| 보안 그룹 | `launch-wizard` — SSH 22 / HTTP 80 / HTTPS 443 (소스 0.0.0.0/0) |
| 스토리지 | 30 GiB gp3 |
| 파일 시스템 | 없음 |

> ⚠️ 주의사항
> - **SQL Server 포함 AMI는 절대 금지**(유료 라이선스). 반드시 일반 Ubuntu.
> - SSH 22 소스는 가능하면 나중에 **내 IP** 로 제한 권장.
> - 퍼블릭 IP는 인스턴스 중지→시작 시 바뀜. 고정하려면 **Elastic IP** 연결(선택).

### Elastic IP 고정 (선택, 권장)
1. EC2 → 탄력적 IP → 탄력적 IP 주소 할당
2. 작업 → 탄력적 IP 주소 연결 → 인스턴스 선택
3. 발급된 IP 기록: `__________________` (여기 적어두기)

---

## 1. SSH 접속

```bash
chmod 400 jobmap-key.pem                 # Git Bash / Mac / Linux
ssh -i jobmap-key.pem ubuntu@<퍼블릭-또는-Elastic-IP>
```

---

## 2. Docker & Docker Compose 설치 (EC2 안에서)

```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker            # 또는 재접속
docker --version && docker compose version
```

### (t3.small 안정화용) 스왑 2GB — 빌드 메모리 부족 방지
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                  # Swap 2.0Gi 확인
```

---

## 3. 소스 내려받기

```bash
cd ~
git clone https://github.com/jyeon-c/gyeonggi-job-map.git
cd gyeonggi-job-map
```

---

## 4. 환경변수(.env) 작성

```bash
cp .env.example .env
nano .env
```

반드시 채울 값:
```dotenv
KAKAO_JS_KEY=2fe6b0453c88a6eb0d85f54cf23c0220   # 카카오 JS 키
DB_NAME=jobmap
DB_USERNAME=jobmap
DB_PASSWORD=강력한_DB_비밀번호
ADMIN_USERNAME=admin
ADMIN_PASSWORD=강력한_관리자_비밀번호            # /admin.html 통계 로그인용
```
저장: `Ctrl+O` → `Enter` → `Ctrl+X`
> `DB_PASSWORD` / `ADMIN_PASSWORD` 는 비워두면 compose 가 실행을 거부한다(실수 방지).

---

## 5. 빌드 & 실행

```bash
docker compose up -d --build         # 첫 실행 5~15분 (베이스 이미지+Gradle 빌드)
docker compose ps                    # db / backend / nginx 세 컨테이너 Up 확인
docker compose logs -f backend       # "채용공고 527건 적재 완료" 확인 후 Ctrl+C
```

---

## 6. 동작 확인

- 브라우저: `http://<IP>/` (지도 화면), `http://<IP>/admin.html` (관리자 로그인)
- 터미널:
  ```bash
  curl http://localhost/api/jobs?size=1        # totalElements:527 이면 정상
  ```

---

## 7. 카카오 콘솔 도메인 등록 (지도 표시 필수)

1. developers.kakao.com → 내 애플리케이션 → 앱 → **플랫폼 → Web**
2. 사이트 도메인에 `http://<IP>` 추가 → 저장 → 브라우저 새로고침
3. (도메인 구매 후엔 `https://내도메인` 도 추가)

---

## 8. 운영 명령

```bash
docker compose ps                 # 상태
docker compose logs -f backend    # 로그
docker compose restart backend    # 재시작
docker compose down               # 중지 (DB 데이터는 pgdata 볼륨에 유지)
docker compose up -d              # 시작

# 코드 업데이트 배포
git pull && docker compose up -d --build
```

---

## 9. 예상 비용 (서울 리전, 대략)

| 항목 | 월 비용 |
|---|---|
| t3.small (24시간 가동) | ~$19 |
| EBS gp3 30GB | ~$2.7 |
| Elastic IP (가동 중) | 무료 |
| **합계** | **~$22 / 월 (약 ₩3만)** |

절약: 안 쓸 때 **인스턴스 중지**하면 컴퓨팅 요금 안 나감(EBS·중지 시 EIP만 소액). 프리티어를 노리면 t3.micro + 스왑(1년 무료)이나, 안정성은 t3.small 권장.

---

## 10. 문제 해결

| 증상 | 해결 |
|---|---|
| 빌드 중 `Killed`/멈춤 | 메모리 부족 → 스왑 2GB(2단계) 또는 t3.medium |
| 지도만 회색 | 카카오 콘솔 도메인 미등록(7단계) |
| /admin.html 401 | `.env` ADMIN 계정 확인 |
| 채용공고 0건 | `docker compose logs backend` 에서 DB 연결·적재 확인 |
| 80포트 접속 불가 | 보안 그룹 인바운드 80 확인 |

---

## 11. 남은 과제 (배포 후)

- [ ] 도메인 구매 → A레코드를 IP에 연결 → 카카오에 도메인 등록
- [ ] HTTPS(certbot/Let's Encrypt) 적용 — 현재 nginx는 80포트만. 도메인 확정 후 설정 추가 필요
- [ ] 관리자 비밀번호 강력하게 설정 확인
- [ ] (선택) SSH 소스를 내 IP 로 제한
