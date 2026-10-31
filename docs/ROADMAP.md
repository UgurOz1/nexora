# Yol Haritası: NEXORA → DOCUMIND → Mezuniyet

**Başlangıç:** 2 Kasım 2026 · **Mezuniyet:** Haziran 2027 · **Tempo:** haftada 20-25 saat

## Genel takvim

| Dönem               | Tarihler                  | Hedef                                       |
| ------------------- | ------------------------- | ------------------------------------------- |
| NEXORA              | 2 Kas – 31 Oca (13 hafta) | Canlıda çalışan, testli, dokümante SaaS     |
| Tampon              | 1 – 7 Şub                 | Final sınavları ve geciken işler            |
| DOCUMIND            | 8 Şub – 2 May (12 hafta)  | Değerlendirme sistemi olan RAG platformu    |
| Cilalama ve başvuru | 3 – 31 May                | İki proje için README, demo, CV, başvurular |
| Mezuniyet           | Haziran                   | Mülakatlar                                  |

**Kilometre taşları**

- **M1, 29 Kas:** Auth + çok kiracılı yapı + RBAC çalışıyor, testli. ("Backend temeli var" denilebilir.)
- **M2, 27 Ara:** Frontend'den giriş yapılıp Kanban'da görev yönetiliyor.
- **M3, 31 Oca:** NEXORA canlıda. CV'ye ve LinkedIn'e eklenir, **başvurulara başlanır.**
- **M4, 2 May:** DOCUMIND canlıda, değerlendirme sonuçları README'de.

> Ocak'ta finaller tempoyu düşürebilir. Geride kalırsak önce "Esnek" işaretli maddeleri erteliyoruz; Şubat'ın ilk haftası tampon.

---

## Mimari özet (hedef)

```
              ┌──────────────┐
  Tarayıcı ──▶│  Next.js web │
              └──────┬───────┘
                     │ REST (/api/v1) + WebSocket
              ┌──────▼───────┐     ┌──────────┐
              │  NestJS API  │────▶│  Redis   │◀── BullMQ worker
              └──┬───────┬───┘     └──────────┘   (e-posta, bildirim,
                 │       │                         tekrarlayan görevler)
          ┌──────▼──┐ ┌──▼─────┐
          │Postgres │ │  S3    │ (S3 uyumlu)
          └─────────┘ └────────┘
```

**Çok kiracılık modeli:** Tek veritabanı, tek şema; tenant'a ait her tabloda `organizationId` sütunu var. Bu kuralı merkezi bir katmanda (Prisma extension + guard) zorunlu kılıyoruz. Gerekçe: ADR-0004 (Hafta 4'te yazılacak).

---

## NEXORA: haftalık plan

Her haftada: **Öğrenilecekler**, **Görevler**, **Çıktı** ve haftanın sonunda cevaplayabilmen gereken **Mülakat soruları** var.

### Hafta 1 (2–8 Kas): Docker ve proje altyapısı

**Öğrenilecekler:** Docker nedir (image, container, layer, volume, network), Dockerfile, Docker Compose, monorepo, pnpm workspaces, Git akışı, Conventional Commits, ESLint/Prettier.

- [x] Docker Desktop kurulumu (WSL2 ile)
- [x] Docker alıştırması: `hello-world`, bir Postgres container'ı açıp içine bağlanma, volume'un ne işe yaradığını görme
- [x] Git repo + GitHub repo (public), `main` için ruleset (PR + CI zorunlu)
- [x] pnpm monorepo iskeleti (`apps/` ve `packages/` boş, içerikleri Hafta 2'de gelecek)
- [x] `docker-compose.yml`: Postgres, Redis, Mailpit (S3 uyumlu depolama Hafta 11'de eklenecek)
- [x] Prettier, Husky, lint-staged, commitlint
- [x] ESLint (type-aware) + TypeScript strict, CI'da lint adımı
- [x] İlk GitHub Actions iş akışı (şimdilik format kontrolü; lint + typecheck Hafta 2'de eklenecek)
- [x] `.env.example`, `README.md` (ilk hali)
- [x] ADR-0001: teknoloji yığını, ADR-0002: monorepo

**Çıktı:** `docker compose up` ile tüm altyapı ayağa kalkıyor, CI yeşil.
**Mülakat soruları:** Image ile container farkı ne? Volume neden lazım? Container ile sanal makinenin farkı ne? Monorepo'nun artısı ve eksisi ne?

### Hafta 2 (9–15 Kas): NestJS temelleri ve veri modeli

**Öğrenilecekler:** NestJS mimarisi (module, controller, provider, dependency injection), DTO + class-validator, pipe/guard/interceptor/filter farkı, Prisma (schema, migration, client), ilişkisel modelleme ve ERD.

- [x] NestJS uygulaması iskeleti (`apps/api`), ilk unit test, build (ADR-0003: NestJS 11 + TS 5.9)
- [x] `ConfigModule` + env doğrulama (zod), fail fast
- [x] Global hata filtresi, standart hata formatı (Prisma P2002 → 409, P2025 → 404)
- [x] `/api/v1` öneki ve API versiyonlama
- [x] Swagger (OpenAPI) dokümantasyonu (`/api/docs`)
- [x] Health check endpoint'i: Redis (`/api/health`)
- [x] Health check'e veritabanı kontrolü
- [x] ERD çizimi: User, Organization, Membership, Invitation, Project, Task ([docs/ERD.md](ERD.md))
- [x] Prisma 7 şeması + ilk migration + seed script
- [x] Yapılandırılmış loglama (pino) ve request ID (`x-request-id`)

**Çıktı:** Swagger'da görünen, DB'ye bağlı, loglayan bir API iskeleti.
**Mülakat soruları:** Dependency injection ne işe yarar? Guard ile middleware farkı ne? Migration neden var, şemayı elle değiştirsek ne olur?

### Hafta 3 (16–22 Kas): Kimlik doğrulama

**Öğrenilecekler:** Şifre hashleme (argon2), JWT yapısı, access + refresh token, refresh token rotasyonu ve çalınma tespiti, httpOnly cookie ve CSRF, OAuth 2.0 / OpenID Connect akışı.

- [x] Kayıt ve giriş (e-posta + şifre, argon2id)
- [x] Access token (kısa ömürlü) + refresh token (DB'de hash'li, rotasyonlu, çalınma tespiti)
- [ ] E-posta doğrulama (Mailpit ile)
- [ ] Şifre sıfırlama (tek kullanımlık, süreli token)
- [ ] Google ile giriş
- [x] Çıkış ve tüm oturumlardan çıkış
- [x] Auth için unit testler (e2e testler Hafta 5'te Testcontainers ile)

**Çıktı:** Güvenli, test edilmiş bir auth modülü.
**Mülakat soruları:** JWT'yi neden localStorage'da tutmuyoruz? Refresh token çalınırsa ne olur? Şifreyi neden şifrelemiyor da hashliyoruz?

### Hafta 4 (23–29 Kas): Çok kiracılık ve yetkilendirme · M1

**Öğrenilecekler:** Multi-tenancy modelleri (ayrı DB / ayrı şema / ortak şema), RBAC, NestJS guard + custom decorator, Prisma client extension, Postgres Row Level Security (kavram olarak).

- [ ] Organizasyon oluşturma, kullanıcının birden fazla organizasyonu olabilmesi
- [ ] Roller: Owner, Admin, Manager, Member ve yetki matrisi (dokümanda tablo)
- [ ] E-posta ile davet (süreli token), daveti kabul etme
- [ ] `@Roles()` decorator + `RolesGuard`
- [ ] Tenant bağlamı: istekten aktif organizasyonu çözme, tüm sorgulara `organizationId` zorunluluğu
- [ ] **İzolasyon testleri:** A şirketi B şirketinin verisini hiçbir endpoint'ten göremiyor
- [ ] ADR-0004: çok kiracılık modeli

**Çıktı:** M1. Rol bazlı, tenant'ları izole bir backend.
**Mülakat soruları:** Neden ortak şema seçtin? Bir geliştirici `organizationId` filtresini unutursa sistemin seni nasıl korur? RBAC ile ABAC farkı ne?

### Hafta 5 (30 Kas – 6 Ara): Projeler, görevler ve test altyapısı

**Öğrenilecekler:** REST tasarımı (kaynak isimleri, status kodları, idempotency), sayfalama (offset vs cursor), filtreleme/sıralama, soft delete, Testcontainers ile gerçek DB'de test, test piramidi.

- [ ] Projeler CRUD (departman/ekip alanıyla)
- [ ] Görevler CRUD: başlık, açıklama, durum, öncelik, deadline, atanan kişi, etiketler
- [ ] Alt görevler
- [ ] Cursor tabanlı sayfalama, filtreleme ve sıralama
- [ ] Soft delete
- [ ] Testcontainers ile e2e testler, CI'da test aşaması ve kapsam raporu

**Çıktı:** Proje/görev API'si, CI'da gerçek Postgres üzerinde çalışan testler.
**Mülakat soruları:** Cursor sayfalaması neden offset'ten iyi? Unit test ile integration test farkı ne? PUT ile PATCH farkı ne?

### Hafta 6 (7–13 Ara): İleri görev özellikleri

**Öğrenilecekler:** Graf veri yapısı, döngü tespiti (DFS), cron ifadeleri, değişiklik geçmişi (event/history tablosu), transaction'lar ve izolasyon seviyeleri.

- [ ] Görev bağımlılıkları: "A bitmeden B başlayamaz", **döngü tespiti**
- [ ] Bağımlılık engelliyse durum değişikliğini reddetme
- [ ] Görev geçmişi: her değişikliğin kaydı ve iki versiyonu karşılaştırma (diff)
- [ ] Tekrarlayan görev tanımı (cron/RRULE), üretim mantığı Hafta 10'da kuyruğa bağlanacak
- [ ] Kritik işlemlerde transaction kullanımı

**Çıktı:** NEXORA'yı sıradan bir öğrenci projesinden ayıran özellikler.
**Mülakat soruları:** Döngüyü nasıl tespit ettin, karmaşıklığı ne? İki kullanıcı aynı görevi aynı anda değiştirirse ne olur?

### Hafta 7 (14–20 Ara): Frontend temeli

**Öğrenilecekler:** Next.js App Router (server/client component, layout, route group, middleware), Tailwind, shadcn/ui, TanStack Query (cache, invalidation), react-hook-form + zod, OpenAPI'den tipli API client üretme.

- [ ] Next.js uygulaması, Tailwind + shadcn/ui kurulumu, tema
- [ ] OpenAPI'den tipli API client
- [ ] Giriş, kayıt, şifre sıfırlama, Google ile giriş sayfaları
- [ ] Korumalı route'lar, token yenileme akışı
- [ ] Organizasyon seçici, organizasyon oluşturma, davet kabul sayfası
- [ ] Proje listesi ve proje detay sayfası

**Çıktı:** Uygulamaya tarayıcıdan girilip organizasyon ve proje yönetilebiliyor.
**Mülakat soruları:** Server component ile client component farkı ne? TanStack Query neden var, `useEffect` + `fetch` ile ne farkı var?

### Hafta 8 (21–27 Ara): Kanban ve görev arayüzü · M2

**Öğrenilecekler:** Sürükle-bırak (dnd-kit), sıralama için fractional indexing (LexoRank benzeri), optimistic update ve hata durumunda geri alma, erişilebilirlik (klavye ile sürükleme).

- [ ] Kanban panosu: sütunlar = durumlar
- [ ] Sürükle-bırak, sıralamanın kalıcı olması (fractional index)
- [ ] Optimistic update
- [ ] Görev detay paneli: alt görevler, bağımlılıklar, geçmiş
- [ ] Liste görünümü + filtreler

**Çıktı:** M2. Uçtan uca kullanılabilir ürün.
**Mülakat soruları:** Görev sırasını neden 1, 2, 3 gibi tam sayılarla tutmadın? Optimistic update başarısız olursa ne olur?

### Hafta 9 (28 Ara – 3 Oca): İşbirliği

**Öğrenilecekler:** Yorum ve mention ayrıştırma, aktivite akışı tasarımı, domain event'leri (NestJS EventEmitter), audit log ile aktivite akışı farkı.

- [ ] Görevlere yorum (düzenleme, silme)
- [ ] `@mention` ve mention edilen kişiye bildirim kaydı
- [ ] Proje ve organizasyon aktivite akışı
- [ ] Domain event altyapısı (`task.created`, `task.status_changed` …)

**Çıktı:** Ekip içi işbirliği özellikleri.
**Mülakat soruları:** Neden servisleri doğrudan birbirine çağırtmak yerine event kullandın?

### Hafta 10 (4–10 Oca): Arka plan işleri ve realtime

**Öğrenilecekler:** Mesaj kuyruğu kavramı, BullMQ (job, worker, retry, backoff, dead-letter), WebSocket ve Socket.IO, room yapısı, Redis adapter ile yatay ölçekleme, WebSocket'te kimlik doğrulama.

- [ ] BullMQ: e-posta kuyruğu, bildirim kuyruğu, retry + backoff
- [ ] Tekrarlayan görevlerin zamanlanmış job ile üretilmesi
- [ ] Socket.IO gateway, JWT ile bağlantı doğrulama, org/proje room'ları
- [ ] Gerçek zamanlı bildirimler + bildirim merkezi UI (okundu/okunmadı)
- [ ] Kanban'da başka kullanıcının değişikliğinin canlı yansıması

**Çıktı:** Asenkron işler ve canlı güncellenen arayüz.
**Mülakat soruları:** E-postayı neden istek içinde göndermiyorsun? 3 API sunucun olsa WebSocket mesajları nasıl doğru kişiye gider?

### Hafta 11 (11–17 Oca): Dosyalar, arama, güvenlik

**Öğrenilecekler:** S3 ve presigned URL, Postgres full-text search (tsvector, GIN index), rate limiting algoritmaları (fixed window, token bucket), audit log tasarımı, OWASP Top 10 temelleri.

- [ ] S3 uyumlu lokal depolama sunucusu seçimi (ADR; MinIO Docker image'ı artık yayınlanmıyor, RustFS / SeaweedFS / Garage değerlendirilecek)
- [ ] Görevlere dosya ekleme (presigned URL ile doğrudan depolamaya yükleme), boyut/tip sınırı
- [ ] Görev ve proje arama (full-text + index)
- [ ] Redis tabanlı rate limiting (özellikle auth endpoint'leri)
- [ ] Audit log: kim, ne zaman, neyi, hangi IP'den; Owner/Admin için görüntüleme
- [ ] Güvenlik kontrolü: helmet, CORS, girdi doğrulama, OWASP listesi üzerinden gözden geçirme

**Çıktı:** Üretime hazır güvenlik ve veri özellikleri.
**Mülakat soruları:** Dosyayı neden API'den geçirmeden yükletiyorsun? `LIKE '%x%'` neden yavaş?

### Hafta 12 (18–24 Oca): Analitik ve gözlemlenebilirlik · Esnek

**Öğrenilecekler:** Toplama sorguları ve index stratejisi, `EXPLAIN ANALYZE`, Redis ile cache (cache-aside, invalidation), metrikler (Prometheus formatı), load test (k6).

- [ ] Dashboard: tamamlanan işler, gecikmiş görevler, ekip bazlı performans, grafikler
- [ ] Ağır sorgular için cache
- [ ] Yavaş sorguların `EXPLAIN ANALYZE` ile incelenip index eklenmesi
- [ ] k6 ile load test, sonuçların README'ye yazılması (ör. p95 gecikme)

**Çıktı:** Ölçülebilir performans rakamları (CV için).
**Mülakat soruları:** Cache invalidation'ı nasıl çözdün? Index her zaman iyi midir?

### Hafta 13 (25–31 Oca): Yayına alma ve sunum · M3

**Öğrenilecekler:** Production Dockerfile (multi-stage build), ortam ayrımı (dev/staging/prod), CI/CD ile otomatik deploy, migration'ları güvenli çalıştırma, domain + HTTPS.

- [ ] Multi-stage Dockerfile'lar (api, web, worker)
- [ ] Deploy (Railway / Render / Fly.io; karar o hafta ADR ile)
- [ ] GitHub Actions: `main`'e merge → test → build → deploy
- [ ] Demo verisi (seed) ve demo hesabı
- [ ] README: özellikler, mimari diyagram, ekran görüntüleri, kurulum, test, performans sonuçları, kararlar
- [ ] 2-3 dakikalık demo videosu
- [ ] CV ve LinkedIn güncellemesi, **ilk başvurular**

**Çıktı:** M3. Canlı link + güçlü README.

---

## DOCUMIND: ana hatlar (8 Şub – 2 May)

Ayrıntılı haftalık plan Şubat başında, NEXORA'dan öğrendiklerimizle yazılacak. Taslak:

| Hafta | Konu                                                                                          |
| ----- | --------------------------------------------------------------------------------------------- |
| 1     | Python proje yapısı, FastAPI, Pydantic, Docker'a taşıma (NEXORA altyapısını yeniden kullanma) |
| 2     | Doküman yükleme, S3, Celery ile asenkron işleme, durum takibi                                 |
| 3     | Metin çıkarma (PyMuPDF, python-docx, openpyxl), sayfa numarası koruma                         |
| 4     | Chunking stratejileri (sabit, cümle bazlı, semantik), embedding, pgvector                     |
| 5     | Semantic search + keyword search (BM25 / full-text) → hybrid search (RRF)                     |
| 6     | RAG cevap üretimi, kaynak/sayfa gösterimi, streaming cevap                                    |
| 7     | **Değerlendirme sistemi:** 100 soruluk test seti, Recall@K, Precision@K, MRR                  |
| 8     | Faithfulness, answer relevance (LLM-as-judge), latency ölçümü, deney karşılaştırmaları        |
| 9     | Kullanıcı başına bilgi alanı, erişim izinleri, tekrar eden doküman tespiti                    |
| 10    | Prompt injection koruması, token/maliyet takibi, geri bildirim toplama                        |
| 11    | Next.js arayüzü: sohbet, kaynak paneli, doküman yönetimi                                      |
| 12    | Deploy, README'de deney sonuçları tablosu, demo videosu                                       |

**DOCUMIND kuralı:** Chunking, hybrid search ve değerlendirme metriklerini framework'e bırakmadan önce bir kez elle yazacağız. LlamaIndex'i ancak neyi soyutladığını anladıktan sonra kullanacağız.

---

## Mayıs: cilalama ve iş arama

- [ ] İki projede kod temizliği ve test kapsamı artırma
- [ ] README'lerin son hali, mimari diyagramlar
- [ ] GitHub profil README'si, pinlenmiş repolar
- [ ] CV: her proje için 3-4 madde, ölçülebilir sonuçlarla
- [ ] Mülakat hazırlığı: ROADMAP'teki tüm "Mülakat soruları"nı sesli cevaplama
- [ ] Sistem tasarımı pratiği: "NEXORA'yı 1 milyon kullanıcıya nasıl ölçeklersin?"

---

## İlerleme kaydı

| Tarih       | Hafta | Not              |
| ----------- | ----- | ---------------- |
| 31 Eki 2026 | —     | Plan oluşturuldu |
