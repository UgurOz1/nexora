# Yol HaritasÄ±: NEXORA â†’ DOCUMIND â†’ Mezuniyet

**BaÅŸlangÄ±Ã§:** 2 KasÄ±m 2026 Â· **Mezuniyet:** Haziran 2027 Â· **Tempo:** haftada 20-25 saat

## Genel takvim

| DÃ¶nem               | Tarihler                    | Hedef                                          |
| -------------------- | --------------------------- | ---------------------------------------------- |
| NEXORA               | 2 Kas â€“ 31 Oca (13 hafta) | CanlÄ±da Ã§alÄ±ÅŸan, testli, dokÃ¼mante SaaS   |
| Tampon               | 1 â€“ 7 Åub                 | Final sÄ±navlarÄ± ve geciken iÅŸler            |
| DOCUMIND             | 8 Åub â€“ 2 May (12 hafta)  | DeÄŸerlendirme sistemi olan RAG platformu      |
| Cilalama ve baÅŸvuru | 3 â€“ 31 May                | Ä°ki proje iÃ§in README, demo, CV, baÅŸvurular |
| Mezuniyet            | Haziran                     | MÃ¼lakatlar                                    |

**Kilometre taÅŸlarÄ±**

- **M1, 29 Kas:** Auth + Ã§ok kiracÄ±lÄ± yapÄ± + RBAC Ã§alÄ±ÅŸÄ±yor, testli. ("Backend temeli var" denilebilir.)
- **M2, 27 Ara:** Frontend'den giriÅŸ yapÄ±lÄ±p Kanban'da gÃ¶rev yÃ¶netiliyor.
- **M3, 31 Oca:** NEXORA canlÄ±da. CV'ye ve LinkedIn'e eklenir, **baÅŸvurulara baÅŸlanÄ±r.**
- **M4, 2 May:** DOCUMIND canlÄ±da, deÄŸerlendirme sonuÃ§larÄ± README'de.

> Ocak'ta finaller tempoyu dÃ¼ÅŸÃ¼rebilir. Geride kalÄ±rsak Ã¶nce "Esnek" iÅŸaretli maddeleri erteliyoruz; Åubat'Ä±n ilk haftasÄ± tampon.

---

## Mimari Ã¶zet (hedef)

```
              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  TarayÄ±cÄ± â”€â”€â–¶â”‚  Next.js web â”‚
              â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                     â”‚ REST (/api/v1) + WebSocket
              â”Œâ”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
              â”‚  NestJS API  â”‚â”€â”€â”€â”€â–¶â”‚  Redis   â”‚â—€â”€â”€ BullMQ worker
              â””â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   (e-posta, bildirim,
                 â”‚       â”‚                         tekrarlayan gÃ¶revler)
          â”Œâ”€â”€â”€â”€â”€â”€â–¼â”€â”€â” â”Œâ”€â”€â–¼â”€â”€â”€â”€â”€â”
          â”‚Postgres â”‚ â”‚  S3    â”‚ (S3 uyumlu)
          â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Ã‡ok kiracÄ±lÄ±k modeli:** Tek veritabanÄ±, tek ÅŸema; tenant'a ait her tabloda `organizationId` sÃ¼tunu var. Bu kuralÄ± merkezi bir katmanda (Prisma extension + guard) zorunlu kÄ±lÄ±yoruz. GerekÃ§e: ADR-0003 (Hafta 4'te yazÄ±lacak).

---

## NEXORA: haftalÄ±k plan

Her haftada: **Ã–ÄŸrenilecekler**, **GÃ¶revler**, **Ã‡Ä±ktÄ±** ve haftanÄ±n sonunda cevaplayabilmen gereken **MÃ¼lakat sorularÄ±** var.

### Hafta 1 (2â€“8 Kas): Docker ve proje altyapÄ±sÄ±

**Ã–ÄŸrenilecekler:** Docker nedir (image, container, layer, volume, network), Dockerfile, Docker Compose, monorepo, pnpm workspaces, Git akÄ±ÅŸÄ±, Conventional Commits, ESLint/Prettier.

- [x] Docker Desktop kurulumu (WSL2 ile)
- [x] Docker alÄ±ÅŸtÄ±rmasÄ±: `hello-world`, bir Postgres container'Ä± aÃ§Ä±p iÃ§ine baÄŸlanma, volume'un ne iÅŸe yaradÄ±ÄŸÄ±nÄ± gÃ¶rme
- [x] Yerel Git repo (GitHub repo + `main` iÃ§in branch korumasÄ±: bekliyor)
- [x] pnpm monorepo iskeleti (`apps/` ve `packages/` boÅŸ, iÃ§erikleri Hafta 2'de gelecek)
- [x] `docker-compose.yml`: Postgres, Redis, Mailpit (S3 uyumlu depolama Hafta 11'de eklenecek)
- [x] Prettier, Husky, lint-staged, commitlint
- [ ] ESLint + TypeScript strict (ilk TypeScript paketiyle birlikte Hafta 2'de)
- [ ] Ä°lk GitHub Actions iÅŸ akÄ±ÅŸÄ±: lint + typecheck
- [ ] `.env.example`, `README.md` (ilk hali)
- [ ] ADR-0001: teknoloji yÄ±ÄŸÄ±nÄ±

**Ã‡Ä±ktÄ±:** `docker compose up` ile tÃ¼m altyapÄ± ayaÄŸa kalkÄ±yor, CI yeÅŸil.
**MÃ¼lakat sorularÄ±:** Image ile container farkÄ± ne? Volume neden lazÄ±m? Container ile sanal makinenin farkÄ± ne? Monorepo'nun artÄ±sÄ± ve eksisi ne?

### Hafta 2 (9â€“15 Kas): NestJS temelleri ve veri modeli

**Ã–ÄŸrenilecekler:** NestJS mimarisi (module, controller, provider, dependency injection), DTO + class-validator, pipe/guard/interceptor/filter farkÄ±, Prisma (schema, migration, client), iliÅŸkisel modelleme ve ERD.

- [ ] NestJS uygulamasÄ±, `ConfigModule` + env doÄŸrulama (zod)
- [ ] Global hata filtresi, standart hata formatÄ±
- [ ] `/api/v1` Ã¶neki ve API versiyonlama
- [ ] Swagger (OpenAPI) dokÃ¼mantasyonu
- [ ] Health check endpoint'i (DB + Redis)
- [ ] ERD Ã§izimi: User, Organization, Membership, Invitation, Project, Task
- [ ] Prisma ÅŸemasÄ± + ilk migration + seed script
- [ ] YapÄ±landÄ±rÄ±lmÄ±ÅŸ loglama (pino) ve request ID

**Ã‡Ä±ktÄ±:** Swagger'da gÃ¶rÃ¼nen, DB'ye baÄŸlÄ±, loglayan bir API iskeleti.
**MÃ¼lakat sorularÄ±:** Dependency injection ne iÅŸe yarar? Guard ile middleware farkÄ± ne? Migration neden var, ÅŸemayÄ± elle deÄŸiÅŸtirsek ne olur?

### Hafta 3 (16â€“22 Kas): Kimlik doÄŸrulama

**Ã–ÄŸrenilecekler:** Åifre hashleme (argon2), JWT yapÄ±sÄ±, access + refresh token, refresh token rotasyonu ve Ã§alÄ±nma tespiti, httpOnly cookie ve CSRF, OAuth 2.0 / OpenID Connect akÄ±ÅŸÄ±.

- [ ] KayÄ±t ve giriÅŸ (e-posta + ÅŸifre)
- [ ] Access token (kÄ±sa Ã¶mÃ¼rlÃ¼) + refresh token (DB'de hash'li, rotasyonlu)
- [ ] E-posta doÄŸrulama (Mailpit ile)
- [ ] Åifre sÄ±fÄ±rlama (tek kullanÄ±mlÄ±k, sÃ¼reli token)
- [ ] Google ile giriÅŸ
- [ ] Ã‡Ä±kÄ±ÅŸ ve tÃ¼m oturumlardan Ã§Ä±kÄ±ÅŸ
- [ ] Auth iÃ§in unit + e2e testler

**Ã‡Ä±ktÄ±:** GÃ¼venli, test edilmiÅŸ bir auth modÃ¼lÃ¼.
**MÃ¼lakat sorularÄ±:** JWT'yi neden localStorage'da tutmuyoruz? Refresh token Ã§alÄ±nÄ±rsa ne olur? Åifreyi neden ÅŸifrelemiyor da hashliyoruz?

### Hafta 4 (23â€“29 Kas): Ã‡ok kiracÄ±lÄ±k ve yetkilendirme Â· M1

**Ã–ÄŸrenilecekler:** Multi-tenancy modelleri (ayrÄ± DB / ayrÄ± ÅŸema / ortak ÅŸema), RBAC, NestJS guard + custom decorator, Prisma client extension, Postgres Row Level Security (kavram olarak).

- [ ] Organizasyon oluÅŸturma, kullanÄ±cÄ±nÄ±n birden fazla organizasyonu olabilmesi
- [ ] Roller: Owner, Admin, Manager, Member ve yetki matrisi (dokÃ¼manda tablo)
- [ ] E-posta ile davet (sÃ¼reli token), daveti kabul etme
- [ ] `@Roles()` decorator + `RolesGuard`
- [ ] Tenant baÄŸlamÄ±: istekten aktif organizasyonu Ã§Ã¶zme, tÃ¼m sorgulara `organizationId` zorunluluÄŸu
- [ ] **Ä°zolasyon testleri:** A ÅŸirketi B ÅŸirketinin verisini hiÃ§bir endpoint'ten gÃ¶remiyor
- [ ] ADR-0003: Ã§ok kiracÄ±lÄ±k modeli

**Ã‡Ä±ktÄ±:** M1. Rol bazlÄ±, tenant'larÄ± izole bir backend.
**MÃ¼lakat sorularÄ±:** Neden ortak ÅŸema seÃ§tin? Bir geliÅŸtirici `organizationId` filtresini unutursa sistemin seni nasÄ±l korur? RBAC ile ABAC farkÄ± ne?

### Hafta 5 (30 Kas â€“ 6 Ara): Projeler, gÃ¶revler ve test altyapÄ±sÄ±

**Ã–ÄŸrenilecekler:** REST tasarÄ±mÄ± (kaynak isimleri, status kodlarÄ±, idempotency), sayfalama (offset vs cursor), filtreleme/sÄ±ralama, soft delete, Testcontainers ile gerÃ§ek DB'de test, test piramidi.

- [ ] Projeler CRUD (departman/ekip alanÄ±yla)
- [ ] GÃ¶revler CRUD: baÅŸlÄ±k, aÃ§Ä±klama, durum, Ã¶ncelik, deadline, atanan kiÅŸi, etiketler
- [ ] Alt gÃ¶revler
- [ ] Cursor tabanlÄ± sayfalama, filtreleme ve sÄ±ralama
- [ ] Soft delete
- [ ] Testcontainers ile e2e testler, CI'da test aÅŸamasÄ± ve kapsam raporu

**Ã‡Ä±ktÄ±:** Proje/gÃ¶rev API'si, CI'da gerÃ§ek Postgres Ã¼zerinde Ã§alÄ±ÅŸan testler.
**MÃ¼lakat sorularÄ±:** Cursor sayfalamasÄ± neden offset'ten iyi? Unit test ile integration test farkÄ± ne? PUT ile PATCH farkÄ± ne?

### Hafta 6 (7â€“13 Ara): Ä°leri gÃ¶rev Ã¶zellikleri

**Ã–ÄŸrenilecekler:** Graf veri yapÄ±sÄ±, dÃ¶ngÃ¼ tespiti (DFS), cron ifadeleri, deÄŸiÅŸiklik geÃ§miÅŸi (event/history tablosu), transaction'lar ve izolasyon seviyeleri.

- [ ] GÃ¶rev baÄŸÄ±mlÄ±lÄ±klarÄ±: "A bitmeden B baÅŸlayamaz", **dÃ¶ngÃ¼ tespiti** (sen yazacaksÄ±n)
- [ ] BaÄŸÄ±mlÄ±lÄ±k engelliyse durum deÄŸiÅŸikliÄŸini reddetme
- [ ] GÃ¶rev geÃ§miÅŸi: her deÄŸiÅŸikliÄŸin kaydÄ± ve iki versiyonu karÅŸÄ±laÅŸtÄ±rma (diff)
- [ ] Tekrarlayan gÃ¶rev tanÄ±mÄ± (cron/RRULE), Ã¼retim mantÄ±ÄŸÄ± Hafta 10'da kuyruÄŸa baÄŸlanacak
- [ ] Kritik iÅŸlemlerde transaction kullanÄ±mÄ±

**Ã‡Ä±ktÄ±:** NEXORA'yÄ± sÄ±radan bir Ã¶ÄŸrenci projesinden ayÄ±ran Ã¶zellikler.
**MÃ¼lakat sorularÄ±:** DÃ¶ngÃ¼yÃ¼ nasÄ±l tespit ettin, karmaÅŸÄ±klÄ±ÄŸÄ± ne? Ä°ki kullanÄ±cÄ± aynÄ± gÃ¶revi aynÄ± anda deÄŸiÅŸtirirse ne olur?

### Hafta 7 (14â€“20 Ara): Frontend temeli

**Ã–ÄŸrenilecekler:** Next.js App Router (server/client component, layout, route group, middleware), Tailwind, shadcn/ui, TanStack Query (cache, invalidation), react-hook-form + zod, OpenAPI'den tipli API client Ã¼retme.

- [ ] Next.js uygulamasÄ±, Tailwind + shadcn/ui kurulumu, tema
- [ ] OpenAPI'den tipli API client
- [ ] GiriÅŸ, kayÄ±t, ÅŸifre sÄ±fÄ±rlama, Google ile giriÅŸ sayfalarÄ±
- [ ] KorumalÄ± route'lar, token yenileme akÄ±ÅŸÄ±
- [ ] Organizasyon seÃ§ici, organizasyon oluÅŸturma, davet kabul sayfasÄ±
- [ ] Proje listesi ve proje detay sayfasÄ±

**Ã‡Ä±ktÄ±:** Uygulamaya tarayÄ±cÄ±dan girilip organizasyon ve proje yÃ¶netilebiliyor.
**MÃ¼lakat sorularÄ±:** Server component ile client component farkÄ± ne? TanStack Query neden var, `useEffect` + `fetch` ile ne farkÄ± var?

### Hafta 8 (21â€“27 Ara): Kanban ve gÃ¶rev arayÃ¼zÃ¼ Â· M2

**Ã–ÄŸrenilecekler:** SÃ¼rÃ¼kle-bÄ±rak (dnd-kit), sÄ±ralama iÃ§in fractional indexing (LexoRank benzeri), optimistic update ve hata durumunda geri alma, eriÅŸilebilirlik (klavye ile sÃ¼rÃ¼kleme).

- [ ] Kanban panosu: sÃ¼tunlar = durumlar
- [ ] SÃ¼rÃ¼kle-bÄ±rak, sÄ±ralamanÄ±n kalÄ±cÄ± olmasÄ± (fractional index, sen yazacaksÄ±n)
- [ ] Optimistic update
- [ ] GÃ¶rev detay paneli: alt gÃ¶revler, baÄŸÄ±mlÄ±lÄ±klar, geÃ§miÅŸ
- [ ] Liste gÃ¶rÃ¼nÃ¼mÃ¼ + filtreler

**Ã‡Ä±ktÄ±:** M2. UÃ§tan uca kullanÄ±labilir Ã¼rÃ¼n.
**MÃ¼lakat sorularÄ±:** GÃ¶rev sÄ±rasÄ±nÄ± neden 1, 2, 3 gibi tam sayÄ±larla tutmadÄ±n? Optimistic update baÅŸarÄ±sÄ±z olursa ne olur?

### Hafta 9 (28 Ara â€“ 3 Oca): Ä°ÅŸbirliÄŸi

**Ã–ÄŸrenilecekler:** Yorum ve mention ayrÄ±ÅŸtÄ±rma, aktivite akÄ±ÅŸÄ± tasarÄ±mÄ±, domain event'leri (NestJS EventEmitter), audit log ile aktivite akÄ±ÅŸÄ± farkÄ±.

- [ ] GÃ¶revlere yorum (dÃ¼zenleme, silme)
- [ ] `@mention` ve mention edilen kiÅŸiye bildirim kaydÄ±
- [ ] Proje ve organizasyon aktivite akÄ±ÅŸÄ±
- [ ] Domain event altyapÄ±sÄ± (`task.created`, `task.status_changed` â€¦)

**Ã‡Ä±ktÄ±:** Ekip iÃ§i iÅŸbirliÄŸi Ã¶zellikleri.
**MÃ¼lakat sorularÄ±:** Neden servisleri doÄŸrudan birbirine Ã§aÄŸÄ±rtmak yerine event kullandÄ±n?

### Hafta 10 (4â€“10 Oca): Arka plan iÅŸleri ve realtime

**Ã–ÄŸrenilecekler:** Mesaj kuyruÄŸu kavramÄ±, BullMQ (job, worker, retry, backoff, dead-letter), WebSocket ve Socket.IO, room yapÄ±sÄ±, Redis adapter ile yatay Ã¶lÃ§ekleme, WebSocket'te kimlik doÄŸrulama.

- [ ] BullMQ: e-posta kuyruÄŸu, bildirim kuyruÄŸu, retry + backoff
- [ ] Tekrarlayan gÃ¶revlerin zamanlanmÄ±ÅŸ job ile Ã¼retilmesi
- [ ] Socket.IO gateway, JWT ile baÄŸlantÄ± doÄŸrulama, org/proje room'larÄ±
- [ ] GerÃ§ek zamanlÄ± bildirimler + bildirim merkezi UI (okundu/okunmadÄ±)
- [ ] Kanban'da baÅŸka kullanÄ±cÄ±nÄ±n deÄŸiÅŸikliÄŸinin canlÄ± yansÄ±masÄ±

**Ã‡Ä±ktÄ±:** Asenkron iÅŸler ve canlÄ± gÃ¼ncellenen arayÃ¼z.
**MÃ¼lakat sorularÄ±:** E-postayÄ± neden istek iÃ§inde gÃ¶ndermiyorsun? 3 API sunucun olsa WebSocket mesajlarÄ± nasÄ±l doÄŸru kiÅŸiye gider?

### Hafta 11 (11â€“17 Oca): Dosyalar, arama, gÃ¼venlik

**Ã–ÄŸrenilecekler:** S3 ve presigned URL, Postgres full-text search (tsvector, GIN index), rate limiting algoritmalarÄ± (fixed window, token bucket), audit log tasarÄ±mÄ±, OWASP Top 10 temelleri.

- [ ] S3 uyumlu lokal depolama sunucusu seÃ§imi (ADR; MinIO Docker image'Ä± artÄ±k yayÄ±nlanmÄ±yor, RustFS / SeaweedFS / Garage deÄŸerlendirilecek)
- [ ] GÃ¶revlere dosya ekleme (presigned URL ile doÄŸrudan depolamaya yÃ¼kleme), boyut/tip sÄ±nÄ±rÄ±
- [ ] GÃ¶rev ve proje arama (full-text + index)
- [ ] Redis tabanlÄ± rate limiting (Ã¶zellikle auth endpoint'leri)
- [ ] Audit log: kim, ne zaman, neyi, hangi IP'den; Owner/Admin iÃ§in gÃ¶rÃ¼ntÃ¼leme
- [ ] GÃ¼venlik kontrolÃ¼: helmet, CORS, girdi doÄŸrulama, OWASP listesi Ã¼zerinden gÃ¶zden geÃ§irme

**Ã‡Ä±ktÄ±:** Ãœretime hazÄ±r gÃ¼venlik ve veri Ã¶zellikleri.
**MÃ¼lakat sorularÄ±:** DosyayÄ± neden API'den geÃ§irmeden yÃ¼kletiyorsun? `LIKE '%x%'` neden yavaÅŸ?

### Hafta 12 (18â€“24 Oca): Analitik ve gÃ¶zlemlenebilirlik Â· Esnek

**Ã–ÄŸrenilecekler:** Toplama sorgularÄ± ve index stratejisi, `EXPLAIN ANALYZE`, Redis ile cache (cache-aside, invalidation), metrikler (Prometheus formatÄ±), load test (k6).

- [ ] Dashboard: tamamlanan iÅŸler, gecikmiÅŸ gÃ¶revler, ekip bazlÄ± performans, grafikler
- [ ] AÄŸÄ±r sorgular iÃ§in cache
- [ ] YavaÅŸ sorgularÄ±n `EXPLAIN ANALYZE` ile incelenip index eklenmesi
- [ ] k6 ile load test, sonuÃ§larÄ±n README'ye yazÄ±lmasÄ± (Ã¶r. p95 gecikme)

**Ã‡Ä±ktÄ±:** Ã–lÃ§Ã¼lebilir performans rakamlarÄ± (CV iÃ§in).
**MÃ¼lakat sorularÄ±:** Cache invalidation'Ä± nasÄ±l Ã§Ã¶zdÃ¼n? Index her zaman iyi midir?

### Hafta 13 (25â€“31 Oca): YayÄ±na alma ve sunum Â· M3

**Ã–ÄŸrenilecekler:** Production Dockerfile (multi-stage build), ortam ayrÄ±mÄ± (dev/staging/prod), CI/CD ile otomatik deploy, migration'larÄ± gÃ¼venli Ã§alÄ±ÅŸtÄ±rma, domain + HTTPS.

- [ ] Multi-stage Dockerfile'lar (api, web, worker)
- [ ] Deploy (Railway / Render / Fly.io; karar o hafta ADR ile)
- [ ] GitHub Actions: `main`'e merge â†’ test â†’ build â†’ deploy
- [ ] Demo verisi (seed) ve demo hesabÄ±
- [ ] README: Ã¶zellikler, mimari diyagram, ekran gÃ¶rÃ¼ntÃ¼leri, kurulum, test, performans sonuÃ§larÄ±, kararlar
- [ ] 2-3 dakikalÄ±k demo videosu
- [ ] CV ve LinkedIn gÃ¼ncellemesi, **ilk baÅŸvurular**

**Ã‡Ä±ktÄ±:** M3. CanlÄ± link + gÃ¼Ã§lÃ¼ README.

---

## DOCUMIND: ana hatlar (8 Åub â€“ 2 May)

AyrÄ±ntÄ±lÄ± haftalÄ±k plan Åubat baÅŸÄ±nda, NEXORA'dan Ã¶ÄŸrendiklerimizle yazÄ±lacak. Taslak:

| Hafta | Konu                                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------- |
| 1     | Python proje yapÄ±sÄ±, FastAPI, Pydantic, Docker'a taÅŸÄ±ma (NEXORA altyapÄ±sÄ±nÄ± yeniden kullanma) |
| 2     | DokÃ¼man yÃ¼kleme, S3, Celery ile asenkron iÅŸleme, durum takibi                                     |
| 3     | Metin Ã§Ä±karma (PyMuPDF, python-docx, openpyxl), sayfa numarasÄ± koruma                             |
| 4     | Chunking stratejileri (sabit, cÃ¼mle bazlÄ±, semantik), embedding, pgvector                          |
| 5     | Semantic search + keyword search (BM25 / full-text) â†’ hybrid search (RRF)                          |
| 6     | RAG cevap Ã¼retimi, kaynak/sayfa gÃ¶sterimi, streaming cevap                                         |
| 7     | **DeÄŸerlendirme sistemi:** 100 soruluk test seti, Recall@K, Precision@K, MRR                        |
| 8     | Faithfulness, answer relevance (LLM-as-judge), latency Ã¶lÃ§Ã¼mÃ¼, deney karÅŸÄ±laÅŸtÄ±rmalarÄ±      |
| 9     | KullanÄ±cÄ± baÅŸÄ±na bilgi alanÄ±, eriÅŸim izinleri, tekrar eden dokÃ¼man tespiti                    |
| 10    | Prompt injection korumasÄ±, token/maliyet takibi, geri bildirim toplama                              |
| 11    | Next.js arayÃ¼zÃ¼: sohbet, kaynak paneli, dokÃ¼man yÃ¶netimi                                         |
| 12    | Deploy, README'de deney sonuÃ§larÄ± tablosu, demo videosu                                            |

**DOCUMIND kuralÄ±:** Chunking, hybrid search ve deÄŸerlendirme metriklerini framework'e bÄ±rakmadan Ã¶nce bir kez elle yazacaÄŸÄ±z. LlamaIndex'i ancak neyi soyutladÄ±ÄŸÄ±nÄ± anladÄ±ktan sonra kullanacaÄŸÄ±z.

---

## MayÄ±s: cilalama ve iÅŸ arama

- [ ] Ä°ki projede kod temizliÄŸi ve test kapsamÄ± artÄ±rma
- [ ] README'lerin son hali, mimari diyagramlar
- [ ] GitHub profil README'si, pinlenmiÅŸ repolar
- [ ] CV: her proje iÃ§in 3-4 madde, Ã¶lÃ§Ã¼lebilir sonuÃ§larla
- [ ] MÃ¼lakat hazÄ±rlÄ±ÄŸÄ±: ROADMAP'teki tÃ¼m "MÃ¼lakat sorularÄ±"nÄ± sesli cevaplama
- [ ] Sistem tasarÄ±mÄ± pratiÄŸi: "NEXORA'yÄ± 1 milyon kullanÄ±cÄ±ya nasÄ±l Ã¶lÃ§eklersin?"

---

## Ä°lerleme kaydÄ±

| Tarih       | Hafta | Not               |
| ----------- | ----- | ----------------- |
| 31 Eki 2026 | â€”   | Plan oluÅŸturuldu |
