# NEXORA — Claude çalışma kuralları

Bu dosyayı Claude her oturumun başında okur. Projenin "anayasası"dır: ne yaptığımızı, nasıl çalıştığımızı ve nelere dikkat ettiğimizi anlatır.

## Proje

NEXORA: şirketlerin ekiplerini, projelerini ve görevlerini yönettiği çok kiracılı (multi-tenant) bir SaaS uygulaması.
Amaç bir Trello kopyası değil; organizasyon bazlı yetkilendirme, veri izolasyonu ve sağlam backend mimarisi olan, gerçek bir şirketin kullanabileceği bir ürün.

- Geliştirici: Uğur, Haziran 2027'de mezun oluyor. Proje CV ve portföy için yapılıyor.
- Haftalık süre: 20-25 saat.
- Ayrıntılı plan: [docs/ROADMAP.md](docs/ROADMAP.md)
- Mimari kararlar: [docs/adr/](docs/adr/)
- Öğrenme günlüğü: [docs/LEARNING_LOG.md](docs/LEARNING_LOG.md)
- Bu projeden sonra DOCUMIND (RAG platformu) yapılacak; plan ROADMAP'in sonunda.

## Çalışma şekli: Claude yapar, kısa anlatır

Uğur'un tercihi (2026-10-31): **Kodu, testleri, PR'ı, CI takibini ve merge'ü Claude yapar; Uğur'a görev bırakılmaz.** Uğur, yapılanı anlamak ve mülakatta anlatabilmek için kısa açıklama ister.

Her adımdan sonra Claude **kısa ve öz** anlatır:

- **Ne yaptık?** Hangi dosyalar, ne işe yarıyor.
- **Neden?** Seçilen yaklaşım ve (varsa) reddedilen alternatif, bir cümleyle.
- **Mülakat notu:** Bu konu sorulursa söylenecek bir iki cümle (gerekirse).

Uzun ders anlatımı yok; Uğur sorarsa ayrıntıya girilir. Anlatımlar Türkçe; kod, değişken isimleri, commit mesajları ve kod içi yorumlar İngilizce.

Uğur'un yapması gereken tek şeyler, Claude'un teknik olarak yapamadıkları: hesaba giriş, yönetici izni (UAC) onayı, ödeme gibi kişisel işlemler.

### Her özellik için akış

1. **Branch:** `feat/<kısa-isim>` gibi bir branch açılır.
2. **Uygulama + test:** küçük adımlar, her adım çalışır halde; unit test ve gerekirse e2e test. Önemli bir kararsa `docs/adr/` altına ADR yazılır.
3. **Doğrulama:** typecheck, test, build ve gerekirse uygulamayı çalıştırıp deneme.
4. **PR:** Claude `gh` ile açar, CI'ı takip eder, yeşilse merge eder ve yerel `main`'i günceller.
5. **Kayıt:** `docs/ROADMAP.md` kutucukları ve `docs/LEARNING_LOG.md` güncellenir.
6. **Anlatım:** yukarıdaki kısa format.

### Claude'un unutmaması gerekenler

- Oturum başında ROADMAP'e bakıp nerede kaldığımızı söyle.
- Oturum sonunda: ROADMAP kutucuklarını güncelle, LEARNING_LOG'a o oturumda yapılanları ve kavramları kısa notlarla ekle.
- `gh` yolu: `C:\Program Files\GitHub CLI\gh.exe`; `pnpm` yolu: `C:\Users\ugur\AppData\Roaming\npm` (eski terminal oturumlarında PATH'te olmayabilir).
- Türkçe içerikli dosyaları PowerShell `Get-Content`/`Set-Content` ile değiştirme (kodlamayı bozar); Edit aracını kullan.
- Plandan sapılırsa (yeni karar, kapsam değişikliği) ROADMAP'i ve gerekirse ADR'yi güncelle.
- Uğur'un bilmediği bir şeyi "biliyormuş gibi" geçme. Docker şu an yeni; ilk haftalarda Docker konularını daha ayrıntılı anlat.

## Teknoloji yığını

| Katman                   | Teknoloji                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| Monorepo                 | pnpm workspaces (`apps/api`, `apps/web`, `packages/*`)                                           |
| Backend                  | NestJS + TypeScript, REST, `/api/v1` versiyonlama                                                |
| Veritabanı               | PostgreSQL 16                                                                                    |
| ORM                      | Prisma                                                                                           |
| Cache / kuyruk altyapısı | Redis                                                                                            |
| Arka plan işleri         | BullMQ                                                                                           |
| Realtime                 | Socket.IO (Redis adapter)                                                                        |
| Dosya depolama           | S3 uyumlu (lokal sunucu Hafta 11'de ADR ile seçilecek; MinIO Docker image'ı artık yayınlanmıyor) |
| E-posta (lokal)          | Mailpit                                                                                          |
| Frontend                 | Next.js (App Router) + TypeScript                                                                |
| UI                       | Tailwind CSS + shadcn/ui                                                                         |
| Frontend veri            | TanStack Query, react-hook-form + zod                                                            |
| Test                     | Jest, Supertest, Testcontainers                                                                  |
| Container                | Docker, Docker Compose                                                                           |
| CI/CD                    | GitHub Actions                                                                                   |

Bir teknolojiyi değiştirmek veya eklemek = yeni ADR.

## Kod kuralları

- TypeScript `strict` modda; `any` kullanılmaz (zorunluysa yorumla gerekçe yazılır).
- Commit mesajları Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- `main` her zaman çalışır durumda. Doğrudan `main`'e commit yok, her iş branch + PR ile gelir.
- Her tenant'a ait sorgu `organizationId` ile filtrelenir. Bu kuralı atlayan kod merge edilmez.
- Sırlar (`.env`) asla commit edilmez; `.env.example` güncel tutulur.
- Yeni endpoint = DTO doğrulaması + yetki kontrolü + en az bir test.

## Bitti tanımı (Definition of Done)

Bir özellik ancak şunlar sağlanınca "bitti" sayılır:

- [ ] Kod çalışıyor ve lint/typecheck temiz
- [ ] Testleri yazıldı ve CI yeşil
- [ ] Yetki ve tenant izolasyonu kontrol edildi
- [ ] Swagger dokümantasyonu güncel (endpoint ise)
- [ ] Uğur'a kısa açıklama yapıldı
- [ ] ROADMAP ve LEARNING_LOG güncellendi
