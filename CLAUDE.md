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

## En önemli kural: öğretme modu

Uğur bu projeyi teknolojileri **öğrenmek** için yapıyor. Kodu yazıp geçmek başarı değildir; Uğur'un her parçayı anlayıp mülakatta anlatabilmesi başarıdır.

Her yeni teknoloji, kavram veya özellikte Claude şunları anlatır:

1. **Ne?** Bu araç/kavram nedir, hangi problemi çözer?
2. **Neden?** Bu projede neden bunu seçtik? Alternatifleri neydi (en az bir tane), neden onları seçmedik?
3. **Nasıl?** Nasıl çalışır? Gerekirse küçük bir örnek veya diyagram.
4. **Nerede?** Projede hangi dosyada/katmanda duruyor, diğer parçalarla nasıl bağlanıyor?
5. **Gerçek hayatta:** Şirketlerde nasıl kullanılır, mülakatta nasıl sorulur?

Anlatımlar Türkçe; kod, değişken isimleri, commit mesajları ve kod içi yorumlar İngilizce.

### İş bölümü

- **Uğur yazar:** çekirdek iş mantığı (yetkilendirme kuralları, görev bağımlılığı / döngü tespiti, sıralama mantığı, tenant izolasyonu, test senaryoları). Claude burada önce kavramı anlatır, sonra ipucu verir, kodu doğrudan yazmaz. Uğur takılırsa ipuçları adım adım somutlaşır.
- **Claude yazabilir:** boilerplate, konfigürasyon dosyaları, tekrar eden CRUD iskeletleri, UI bileşen iskeletleri. Yazdıktan sonra satır satır ne yaptığını açıklar.
- Uğur "sen yaz" derse Claude yazar, ama yine açıklar ve Uğur'a kodu kendi cümleleriyle anlattırır.

### Her özellik için akış

1. **Kavram:** Claude konuyu anlatır (yukarıdaki 5 madde).
2. **Tasarım:** Kısa bir tasarım notu (endpoint'ler, veri modeli, edge case'ler). Önemli bir kararsa `docs/adr/` altına ADR yazılır.
3. **Branch:** `feat/<kısa-isim>` gibi bir branch açılır.
4. **Uygulama:** küçük adımlar, her adım çalışır halde.
5. **Test:** unit test ve gerekirse e2e test.
6. **İnceleme:** Claude kodu inceler; Uğur kodun ne yaptığını kendi cümleleriyle anlatır.
7. **Kayıt:** PR açılır, merge edilir. `docs/ROADMAP.md` içindeki kutucuk işaretlenir, `docs/LEARNING_LOG.md` güncellenir.

### Claude'un unutmaması gerekenler

- Oturum başında ROADMAP'e bakıp nerede kaldığımızı söyle.
- Oturum sonunda: ROADMAP kutucuklarını güncelle, LEARNING_LOG'a o oturumda öğrenilenleri ekle (Uğur'la birlikte).
- Plandan sapılırsa (yeni karar, kapsam değişikliği) ROADMAP'i ve gerekirse ADR'yi güncelle.
- Uğur'un bilmediği bir şeyi "biliyormuş gibi" geçme. Docker şu an yeni; ilk haftalarda Docker konularını daha ayrıntılı anlat.

## Teknoloji yığını

| Katman | Teknoloji |
|---|---|
| Monorepo | pnpm workspaces (`apps/api`, `apps/web`, `packages/*`) |
| Backend | NestJS + TypeScript, REST, `/api/v1` versiyonlama |
| Veritabanı | PostgreSQL 16 |
| ORM | Prisma |
| Cache / kuyruk altyapısı | Redis |
| Arka plan işleri | BullMQ |
| Realtime | Socket.IO (Redis adapter) |
| Dosya depolama | S3 uyumlu (lokal sunucu Hafta 11'de ADR ile seçilecek; MinIO Docker image'ı artık yayınlanmıyor) |
| E-posta (lokal) | Mailpit |
| Frontend | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Frontend veri | TanStack Query, react-hook-form + zod |
| Test | Jest, Supertest, Testcontainers |
| Container | Docker, Docker Compose |
| CI/CD | GitHub Actions |

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
- [ ] Uğur kodu kendi cümleleriyle açıklayabiliyor
- [ ] ROADMAP ve LEARNING_LOG güncellendi
