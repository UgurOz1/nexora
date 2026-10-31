# Öğrenme Günlüğü

Her oturumun sonunda kısa bir giriş eklenir. Amaç: öğrendiğini kendi cümlelerinle yazmak. Kendi cümlelerinle anlatamıyorsan henüz öğrenmemişsindir.
Bu dosya mülakat hazırlığında da ana kaynağın olacak.

## Şablon

```
### YYYY-AA-GG · Hafta N · Konu
**Ne yaptık:** ...
**Öğrendiğim kavramlar:** (her biri için 1-2 cümle, kendi cümlelerimle)
**Neden böyle yaptık:** ...
**Takıldığım / yanlış anladığım şey:** ...
**Sonraki adım:** ...
```

---

### 2026-10-31 · Hazırlık · Planlama

**Ne yaptık:** Proje planını, çalışma kurallarını (CLAUDE.md) ve karar kayıt sistemini (ADR) oluşturduk.
**Öğrendiğim kavramlar:**

- _CLAUDE.md:_ Claude'un her oturumda okuduğu proje talimatları dosyası. Projenin bağlamı ve kurallar burada durur, böylece her oturumda baştan anlatmam gerekmez.
- _ADR (Architecture Decision Record):_ Önemli bir teknik kararı, alternatifleri ve gerekçesiyle kaydeden kısa doküman. Şirketlerde "bunu neden böyle yaptık?" sorusunun cevabıdır.
- _Definition of Done:_ Bir işin "bitti" sayılması için gereken ortak kriterler listesi.

**Sonraki adım:** Hafta 1, Docker'ı kurmak ve öğrenmek.

### 2026-10-31 · Hafta 1 · Docker ve proje altyapısı

**Ne yaptık:** Docker Desktop, docker-compose ile Postgres + Redis + Mailpit, pnpm monorepo, Prettier + Husky + commitlint, GitHub Actions CI, korumalı `main`.
**Kavramlar:**

- _Image / container:_ Image değişmeyen şablon, container onun çalışan hali.
- _Volume:_ Container silinince kaybolmaması gereken verinin (veritabanı dosyaları) tutulduğu yer.
- _Docker client / daemon:_ `docker` komutu sadece istemci; asıl işi arka plandaki daemon yapar. "daemon is not running" hatası bu yüzden çıkar.
- _CI:_ Her PR'da kodu temiz bir makinede kontrol eder; "bende çalışıyor" yetmez.
- _Branch koruması:_ `main`'e doğrudan push yok, PR + yeşil CI zorunlu.

**Ders:** Bağımlı olduğun araç değişebilir (MinIO image'ı yayınlanmaz oldu). Bir yapılandırmayı doğrularken sadece kuralın varlığına değil içeriğine de bak (ruleset'te zorunlu CI listesi boş kalmıştı).

### 2026-10-31 · Hafta 2 · NestJS temelleri ve veri modeli

**Ne yaptık:** NestJS API iskeleti, env doğrulama, `/api/v1` versiyonlama, Swagger, health check (DB + Redis), Prisma 7 veri modeli + migration + seed, standart hata formatı, pino loglama + request ID, ESLint.
**Kavramlar:**

- _Module / controller / service:_ Controller HTTP isteğini alır, iş mantığı service'tedir, module ikisini gruplar.
- _Dependency injection:_ Sınıf bağımlılığını kendisi oluşturmaz, Nest verir; testte sahtesi verilebilir.
- _Fail fast:_ Hatalı ayarla uygulama hiç açılmaz, sonradan anlaşılmaz hata vermez.
- _Health check:_ Orkestratör `/api/health`'e bakar; 503 görürse trafiği keser.
- _Migration:_ Veritabanı şemasındaki her değişiklik sürümlü bir SQL dosyası; her ortam aynı şemaya gelir.
- _Request ID:_ Bir isteği istemciden log satırına kadar izlemeyi sağlar.

**Ders:** "En yeni sürüm" her zaman doğru seçim değil: NestJS 12 (yalnız ESM), TypeScript 7 ve Prisma 8 RC araç zincirini bozdu; sürümler bilinçli seçilip sabitlendi (ADR-0003).

**Sonraki adım:** Hafta 3, kimlik doğrulama (kayıt, giriş, JWT, refresh token).
