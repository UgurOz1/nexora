# ADR-0013: Analitik, cache, indeksler ve Prometheus metrikleri

- **Tarih:** 2026-11-09
- **Durum:** Kabul edildi

## Bağlam

Hafta 12'de bir dashboard (durum dağılımı, gecikenler, günlük tamamlanan/oluşturulan, proje, departman ve kişi bazlı sayılar) ve sistemin kendisini ölçen metrikler gerekiyor. Dashboard sorguları bir şirketin **bütün** görevlerini toplar; büyük bir şirkette (200 bin görev) her sayfa açılışında bunu yapmak pahalıdır. Ölçümler [PERFORMANCE.md](../PERFORMANCE.md) içinde.

## 1. Tamamlanma zamanı: veritabanı tetikleyicisi

"Günde kaç iş bitti" ve "bir iş ortalama kaç saatte bitiyor" için görevin **ne zaman** DONE olduğu gerekir. Yeni `tasks.completedAt` sütununu bir `BEFORE INSERT OR UPDATE` tetikleyicisi tutar: DONE'a geçince `now()` (verilmiş bir değer varsa o), DONE kalırken değişmez, DONE'dan çıkınca `NULL`.

**Neden uygulama kodu değil?** Durum beş farklı yoldan değişiyor (form, sürükle-bırak, tekrarlayan görev, seed, ham SQL). Tetikleyici hepsini kapsar; birini unutma ihtimali yok. Bedeli, davranışın koddan görünmemesi: şemada ve migration'da yorumla anlatıldı, e2e test her yolu (oluşturma, taşıma, düzenleme, ham SQL) deniyor. Değişmez: **DONE ⇔ completedAt dolu**. Sorgular bu eşdeğerliğe dayanır.

## 2. Sorgular veritabanında toplanır

Tüm sayılar `count(*) FILTER (WHERE …)`, `percentile_cont` (medyan) ve `generate_series` (boş günler dahil) ile Postgres'te hesaplanır; API'ye satır taşınmaz. Ham SQL `forTenant` ağının dışında olduğu için her sorguda `organizationId` elle yazılıdır ve izolasyon testlidir (başka şirketin proje kimliğiyle bile).

## 3. İndeksler: kısmi ve kapsayan

`EXPLAIN (ANALYZE, BUFFERS)` ile görülen: her sorgu şirketin 200 bin satırını tablodan okuyordu (9 138 sayfa), iki sorgu 21 MB'lık sıralamayı diske taşıyordu. Çözüm iki parça:

- **Sorgular iki dilime ayrıldı:** açık işler (`status <> 'DONE'`) ve biten işler (`completedAt IS NOT NULL`). Kişi/proje toplamları önce gruplanıp sonra birleştirildi (her görev satırını birleştirip sonra gruplamak yerine).
- **Her dilim için bir kısmi indeks**, sorgunun okuduğu bütün sütunlarla: `tasks_open_work_idx (organizationId, dueDate, status, projectId, assigneeId) WHERE deletedAt IS NULL AND status <> 'DONE'` ve `tasks_completed_idx (organizationId, completedAt, createdAt, projectId, assigneeId) WHERE deletedAt IS NULL AND completedAt IS NOT NULL`. Postgres bu sorguları tabloya hiç gitmeden indeksten cevaplar (**index-only scan**).

Sonuç: dashboard sorgularının toplam veritabanı süresi yaklaşık **1 100 ms'den 220 ms'ye**, takım sayfası **590 ms'den 95 ms'ye** indi.

**İndeks bedava değil:** İki indeks diskte 130 MB tutar (tablo 357 MB). Bir görevin durumu her değiştiğinde ilgili indeks de güncellenir; yazma biraz yavaşlar. Kısmi oldukları için yalnızca kendi dilimlerindeki yazmalar bu bedeli öder. Ölçüm PERFORMANCE.md'de. `(organizationId, createdAt)` indeksi "son 30 günde oluşturulan" sorgusunda **kullanılmadı**, planlayıcı haklıydı: eşleşen satırlar (%25) tablonun neredeyse her sayfasına dağılmıştı.

**Prisma:** Kısmi indeksler `schema.prisma`'da `@@index(..., where: raw(...))` ile tanımlı (`partialIndexes` önizleme özelliği). Yalnızca migration'a yazılsaydı, sonraki `prisma migrate dev` onları tanımayıp `DROP INDEX` üretirdi. Migration SQL'i `prisma migrate diff` ile şemadan üretildi.

## 4. Cache: Redis, cache-aside, sürümle geçersiz kılma

Hesaplanan dashboard Redis'te tutulur (varsayılan 5 dk, `ANALYTICS_CACHE_TTL_SECONDS`, 0 = kapalı).

- **Geçersiz kılma sürümle:** Her şirketin bir sayacı var ve sayaç her anahtarın parçası (`…:<org>:v<sürüm>:overview:days=30`). Görev, proje veya üyelik değişince (domain event'leri: `task.changed`, `project.changed`, `membership.changed`) sayaç bir artar; şirketin bütün eski girdileri bir anda okunmaz olur ve kendiliğinden sona erer. Silinecek anahtarı aramak (`KEYS`/`SCAN`) gerekmez.
- **Yarış durumu yok:** Değişiklikten önce başlamış yavaş bir hesaplama, sonucunu eski sürümün anahtarına yazar ve onu kimse okumaz. "Sil, sonra eski veri geri yazılsın" sorunu oluşmaz.
- **Yorum ve dosya eki** hiçbir sayıyı değiştirmez, cache'i düşürmez (testli).
- **Aynı anda kaçırma (stampede):** Aynı anahtarı aynı anda isteyen istekler süreç içinde tek bir hesaplamayı paylaşır (single-flight).
- **Redis yoksa:** Doğrudan veritabanından hesaplanır (yavaş ama çalışır), hata sayılır ve loglanır.
- **Süre sınırı neden hâlâ var?** Bazı sayılar hiçbir yazma olmadan değişir: bir görev gece yarısı "gecikmiş" olur. TTL bu gecikmenin üst sınırıdır.

## 5. Yetki

Genel bakış her üyeye açık (zaten okuyabildikleri projelerin toplamı). Kişi bazlı tablo (`/analytics/team`) **MANAGER ve üstü**: kişi başı sayılar işi planlayanlar için, meslektaşları kıyaslamak için değil.

## 6. Metrikler: Prometheus formatı (`prom-client`)

`GET /api/metrics`: istek süreleri (histogram: method, **route şablonu**, status), cache sonuçları (hit/miss/error), kuyruk boyutları (dead-letter dahil; Redis'ten istek anında okunur) ve Node süreç metrikleri.

- **Etiketler sınırlı:** Route etiketi gerçek URL değil, şablondur (`/api/v1/organizations/:orgId/tasks`). Her farklı etiket değeri ayrı bir zaman serisidir; URL'deki kimlikler milyonlarca seri üretirdi. Bilinmeyen URL'ler tek bir etikette toplanır (testli).
- **Ölçüm middleware ile, interceptor ile değil:** Guard'ın reddettiği istekler (401/403/429) interceptor'a hiç ulaşmaz; middleware her yanıtı görür.
- **Açık değil:** Metrikler sistemin içini anlatır (route'lar, hata oranı). `METRICS_TOKEN` ayarlı değilse endpoint 404; ayarlıysa sabit zamanlı karşılaştırılan bearer token ister. Swagger'da görünmez.
- **Ayrı registry:** prom-client'ın global registry'si yerine uygulamaya ait bir tane; testler aynı süreçte birden çok uygulama açabiliyor.

## Alternatifler

- _Materialized view / gece hesaplanan özet tablo:_ Okuma çok ucuz olurdu, ama veri saatlerce eski kalır ve yenileme işi gerekir. Şimdiki boyutta canlı sorgu + cache yeterli. Şirketler milyonlarca göreve çıkarsa gün bazlı özet tablosu ilk adım olur.
- _Uygulama içi (bellek) cache:_ Birden çok API sunucusunda her biri ayrı tutar ve geçersiz kılma sunucular arasında yayılmaz. Redis zaten var.
- _Anahtar silerek geçersiz kılma:_ `SCAN` maliyeti ve yukarıdaki yarış durumu.
- _OpenTelemetry:_ İz (trace) ve metrik için standart, ama kurulumu ve toplayıcısı (collector) bu hafta için ağır. Prometheus formatı her araçla okunur; sonra OpenTelemetry'ye geçmek mümkün.

## Bilinen sınırlar

- Günler UTC'ye göre sayılır (kullanıcının saat dilimi değil); arayüzde belirtilir.
- Kullanıcı adını değiştirirse takım tablosu en çok TTL kadar eski adı gösterir (o değişiklik olay yayınlamıyor).
- Single-flight süreç başınadır; N sunucuda aynı anda en çok N hesaplama olur.
- "Son 30 günde oluşturulan" sayısı hâlâ şirketin bütün satırlarını okur (yukarıda neden).
