# EC2 배포 가이드 (경기도 일자리맵)

> AWS EC2 단일 인스턴스 + Docker Compose(nginx + backend + PostGIS) 배포 절차.
> 아래 "내 인스턴스 설정"은 2026-07-05 기준 실제 생성 시 선택한 값이다.

## 진행 현황 (2026-07-05)
- [x] EC2 인스턴스 생성 (`i-0b3b6aad5d317439d`, Ubuntu 24.04, t3.small)
- [x] Elastic IP 할당·연결 → **3.34.208.244**
- [x] SSH 접속 성공 (`ssh -i jobmap-key.pem ubuntu@3.34.208.244`)
- [x] Docker/Compose 설치 완료 (Docker 29.6.1 / Compose v5.3.0)
- [x] 스왑 2GB 설정
- [x] GitHub 레포 **공개(Public) 전환** 후 소스 clone (`~/gyeonggi-job-map`)
- [x] `.env` 작성 완료 (DB/관리자 비밀번호 설정, 카카오 JS 키)
- [x] `docker compose up -d --build` 성공 (db/backend/nginx 3컨테이너 Up)
- [x] 데이터 적재 확인 (최신 정제 기준 채용공고 460건)
- [x] `http://3.34.208.244/` 접속 확인 — **배포 성공** ✅
- [x] 카카오 JavaScript SDK 도메인에 `http://3.34.208.244` 등록 → 지도 표시
- [x] `/admin.html` 관리자 로그인 확인 (admin / 설정한 비번)

**→ 1차 배포 완료 (2026-07-05). 서비스 URL: http://3.34.208.244/**

> 메모
> - 레포는 비밀정보가 커밋되지 않아 Public 전환해도 안전(.env·config.js gitignore).
> - `.env` 는 서버 `~/gyeonggi-job-map/.env` 에만 존재(커밋 안 됨). 관리자 로그인: `admin` / (설정한 비번).
> - GitHub 원격 remote 는 lowercase `jyeon-c` 로 접근됨.
> - **배포 브랜치는 `main`** — 서버는 main 을 clone/pull 한다. (jobs.json 이 dev 에만 있어 빌드 실패했던 이슈 → main 갱신으로 해결)
> - `jobs.json`(배포 시드)은 `.gitignore` 예외로 커밋됨(`data/processed/*` + `!jobs.json`).

### 트러블슈팅 기록 (실제 겪은 것)
1. `COPY data/processed/jobs.json ... not found` → jobs.json 이 gitignore 로 커밋 안 됨 → 예외 추가 후 커밋.
2. `git pull` 이 "Already up to date" → 서버는 main, 커밋은 dev 에만 있었음 → main 을 dev 로 갱신 후 서버 재pull.
3. `curl ...?size=1` 400 → 붙여넣기로 `size=1git` 이 된 것(실제 오류 아님). 명령은 한 줄씩 끊어 입력.

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

### Elastic IP 고정 (완료 ✅)
1. EC2 → 탄력적 IP → 탄력적 IP 주소 할당 (Amazon IPv4 풀, ap-northeast-2)
2. 작업 → 탄력적 IP 주소 연결 → 인스턴스 `i-0b3b6aad5d317439d` 연결
3. **발급/연결된 고정 IP: `3.34.208.244`**

> 앞으로 SSH·카카오 등록·접속에 모두 이 IP를 사용한다. 인스턴스 중지→시작해도 이 IP는 유지됨.

---

## 1. SSH 접속

```bash
chmod 400 jobmap-key.pem                 # Git Bash / Mac / Linux
ssh -i jobmap-key.pem ubuntu@3.34.208.244
```
- `.pem` 파일이 있는 폴더에서 실행한다.
- 첫 접속 시 `Are you sure you want to continue connecting?` → `yes` 입력.
- Windows PowerShell 에서 권한 에러가 나면 Git Bash 로 실행하거나, 아래로 권한 축소:
  ```powershell
  icacls jobmap-key.pem /inheritance:r
  icacls jobmap-key.pem /grant:r "$($env:USERNAME):(R)"
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
docker compose logs -f backend       # "채용공고 460건 ... 갱신 완료" 확인 후 Ctrl+C
```

---

## 6. 동작 확인

- 브라우저: `http://3.34.208.244/` (지도 화면), `http://3.34.208.244/admin.html` (관리자 로그인)
- 터미널:
  ```bash
  curl 'http://localhost/api/jobs?size=1'      # totalElements:460 이면 정상
  ```

---

## 7. 카카오 콘솔 도메인 등록 (지도 표시 필수)

1. developers.kakao.com → 내 애플리케이션 → 앱 → **플랫폼 → Web**
2. 사이트 도메인에 `http://3.34.208.244` 추가 → 저장 → 브라우저 새로고침
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

## 11. 도메인 & HTTPS (완료 ✅)

**도메인: `jobmapkorea.com` · Cloudflare · HTTPS 적용 완료 → https://jobmapkorea.com/**

- DNS: Cloudflare A레코드 `jobmapkorea.com`/`www` → `3.34.208.244` (프록시 ON, 오렌지 구름)
- HTTPS: **Cloudflare 방식**으로 해결 (certbot 불필요). SSL/TLS 모드 = **Flexible**
  (브라우저↔Cloudflare 는 HTTPS, Cloudflare↔origin 은 HTTP:80. origin 이 80포트만 열려 있어 Flexible)
- 카카오 JavaScript SDK 도메인에 `https://jobmapkorea.com` 등록 → 지도 표시 정상
- 앱 코드 수정 없이 동작: nginx `server_name _`, 프런트 `apiBase=""`(같은 오리진)

> 향후 보안 강화(선택): origin 을 Cloudflare IP 대역만 허용(보안그룹) + SSL 모드 Full(origin 인증서).
> 지금은 실습/데모 수준으로 Flexible 로 충분.

---

## 12. 팝업 위젯 이식 (완료 ✅)

원 목표인 "다른 페이지에 팝업 위젯으로 삽입"을 구현. 호스트 페이지에 스크립트 한 줄:

```html
<script src="https://jobmapkorea.com/embed.js"></script>
```
→ 우하단 플로팅 버튼 생성 → 클릭 시 지도 서비스가 팝업(모달 iframe)으로 열림.
옵션: `data-label`(버튼 문구), `data-position`(left/right), `data-color`(색상).
데모: `https://jobmapkorea.com/embed-demo.html`

- `frontend/embed.js`(위젯), `frontend/embed-demo.html`(삽입 데모). nginx 가 자동 서빙(별도 설정 불필요).
- iframe URL 은 스크립트 origin 에서 자동 계산(로컬 8087 / 운영 도메인 모두 대응).

## 13. 남은 과제

- [ ] (사용자) SSH 소스를 내 IP 로 제한 (현재 0.0.0.0/0) — AWS 보안그룹에서
- [ ] (사용자) `고객요청사항_분석.md` 채우기 (엑셀 11건)
- [ ] (선택) 관리자 비밀번호 더 강력하게
- [ ] (선택) 카카오 REST 키로 좌표 정밀화 (KAKAO_REST_API_KEY 필요)
- [ ] (선택) Flyway 마이그레이션 / GitHub Actions 자동 배포
