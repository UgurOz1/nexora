# ADR-0004: Çok kiracılık: ortak şema, iki katmanlı koruma

- **Tarih:** 2026-10-31
- **Durum:** Kabul edildi

## Bağlam

NEXORA'yı birçok şirket (tenant) aynı anda kullanacak. Bir şirketin kullanıcıları başka bir şirketin projelerini, görevlerini veya üyelerini hiçbir koşulda görememeli. Bu, projenin en kritik güvenlik gereksinimi: tek bir unutulmuş filtre bir veri sızıntısıdır.

## Değerlendirilen seçenekler

1. **Tenant başına ayrı veritabanı:** En güçlü izolasyon. Ama her şirket için veritabanı oluşturmak, migration'ı hepsine uygulamak ve bağlantı havuzlarını yönetmek çok maliyetli; bu ölçekte (ve tek geliştirici için) aşırı.
2. **Tenant başına ayrı şema (Postgres schema):** İyi izolasyon, ama migration hâlâ her şemaya ayrı uygulanır; Prisma ile çoklu şema yönetimi zahmetli.
3. **Ortak şema + her tabloda `organizationId`:** Tek veritabanı, tek migration, en basit işletme ve en yaygın SaaS modeli. Riski: bir sorguda filtreyi unutmak.
4. **Ortak şema + Postgres Row Level Security (RLS):** Filtreyi veritabanının kendisi zorlar, en sağlam seçenek. Ama her istekte oturum değişkeni ayarlamayı, Prisma ve bağlantı havuzuyla uyumlu hale getirmeyi gerektirir; şu aşamada karmaşıklığı fazla.

## Karar

**Ortak şema (seçenek 3)** ve filtreyi unutma riskine karşı **uygulama içinde iki bağımsız katman**:

1. **Guard (kapı):** `/organizations/:orgId/...` içeren her route'ta global `OrganizationGuard` çalışır. İstek sahibinin o şirketin üyesi olup olmadığına ve rolünün route'un `@MinRole()` değerini karşılayıp karşılamadığına bakar. Üye değilse **404** döner (403 değil): var olan bir şirketin varlığını dışarıya sızdırmamak için. Guard global olduğu için ileride eklenecek route'lar da otomatik korunur.
2. **Prisma uzantısı (`prisma.forTenant(orgId)`):** Tenant tablolarındaki (Membership, Invitation, Project, Task) her sorguya `organizationId` filtresini otomatik ekler; oluşturulan satırlara şirketi yazar; başka bir şirketi hedefleyen `where`/`data` değerlerini ve bir satırı başka şirkete taşımayı reddeder. Bilinmeyen işlemler ve tenant olmayan modeller reddedilir (fail closed).

Her iki katman da birbirinden bağımsız test edilir. Rolleri ve "kim kimi yönetebilir" kurallarını `policies.ts` tek yerde toplar; belgesi [docs/PERMISSIONS.md](../PERMISSIONS.md).

## Gerekçe ve sonuçlar

- **Savunma derinliği:** Guard'ı atlayan bir hata (ör. yanlış route) veri katmanında yakalanır; bir sorguda filtre unutulsa bile guard ve uzantı devreye girer. Testlerde iki katmanı ayrı ayrı bilerek bozduk ve testlerin başarısız olduğunu doğruladık (mutasyon testi).
- **Veri izolasyonu testleri** gerçek veritabanında (ayrı `nexora_test`), gerçek HTTP istekleriyle çalışır ve CI'da her PR'da koşar.
- **Bilinen sınırlar:**
  - Uzantı yalnızca Prisma sorgularını kapsar; ham SQL (`$queryRaw`) kapsanmaz. Ham SQL'de `organizationId` elle verilmeli ve kod incelemesinde dikkat edilmeli.
  - Koruma uygulama katmanında; veritabanını doğrudan kullanan biri atlatabilir. Daha sıkı güvence gerekirse Postgres RLS (seçenek 4) bu kararın üstüne eklenebilir; o zaman yeni bir ADR yazılır.
  - Tenant tablolarına eklenen her yeni model `TENANT_MODELS` listesine eklenmeli (aksi halde `forTenant` onu reddeder, yani yanlış yönde değil güvenli yönde hata verir).
- `tasks` tablosu projeden türetilebilse bile `organizationId` taşır: her sorgu doğrudan filtrelenebilir ve indekslenebilir.
