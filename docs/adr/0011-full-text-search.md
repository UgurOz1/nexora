# ADR-0011: Tam metin arama (Postgres tsvector + GIN)

- **Tarih:** 2026-11-04
- **Durum:** Kabul edildi

## Bağlam

Görev ve projelerde arama gerekiyor; kullanıcı yazdıkça sonuç gelmeli. Hazır bir arama motoru (Elasticsearch, Meilisearch) akla gelir, ama ayrı bir servis, ayrı bir veri kopyası ve senkron sorunu demek.

## Karar: Postgres'in kendi tam metin araması

- **`tsvector` sütunu, veritabanı tarafından üretilir** (`GENERATED ALWAYS AS … STORED`): her `INSERT`/`UPDATE`'te Postgres yeniden hesaplar. Uygulama vektörü güncellemeyi unutamaz, yanlış hesaplayamaz; senkron sorunu yoktur. Görev: başlık (ağırlık A) + açıklama (B). Proje: ad (A) + bölüm (B) + açıklama (C).
- **`GIN` indeksi:** Her kelimeyi, onu içeren satırlara eşler; arama yalnızca eşleşen birkaç satırı okur. `LIKE '%kelime%'` ise desen joker ile başladığı için sıradan indeksi kullanamaz ve **her satırı okur** (satır sayısıyla doğrusal yavaşlar). Bir e2e test, sorgunun `tasks_search_idx` indeksini kullanabildiğini sorgu planıyla kanıtlar.
- **`simple` yapılandırması:** Kök bulma (stemming) ve etkisiz kelime listesi yok. Türkçe ve İngilizce metin, isimler, kodlar olduğu gibi indekslenir. Bedeli: "koşu" aramasıyla "koşuyor" bulunmaz. Türkçe için doğru kök bulucu yok; yanlış kök, hiç kök bulmamaktan kötü.
- **Önek eşleşmesi:** Her kelime bir önek sayılır (`desi` → `design`), böylece yazarken sonuç gelir. Kelimenin ortası eşleşmez (`frames` → `wireframes` değil); bu GIN'in doğası, `LIKE` olmadan ucuz kalmanın bedeli.
- **Sıralama:** `ts_rank_cd` (eşleşen kelimelerin yakınlığı + ağırlık: başlıktaki eşleşme açıklamadakinden değerli), eşitlikte en son değişen önce.
- **Girdi güvenliği:** Kullanıcı metni `tsquery` sözdizimine **hiç** geçmez. `&`, `|`, `!`, `:`, `(` … ayraç sayılır; yalnızca harf/rakam kalır, en çok 8 kelime ve kelime başına 50 karakter. Sorgu bağlanmış parametredir (SQL enjeksiyonu yok). Yetkisiz alan olmaz: e2e testte enjeksiyon denemeleri 200 + boş döner.

## Tenant izolasyonu

Arama **ham SQL**dir (`$queryRaw`); `forTenant` güvenlik ağı yalnızca Prisma model metotlarını sarar. Bu yüzden her sorguda `organizationId` filtresi elle yazılıdır, silinmiş görev/projeler elenir, ve testler başka şirketin satırlarının bulunamadığını (aynı kelimelerle bile) kanıtlar. Mutasyon testi: filtre kaldırılınca test kırılır.

## Alternatifler

- _`LIKE`/`ILIKE '%x%'`:_ Basit, ama yavaş ve sıralamasız.
- _`pg_trgm` (üçlü benzerlik):_ Kelimenin ortasını ve yazım hatasını bulur; indeksi büyük, sıralaması farklı. İhtiyaç doğarsa ikinci bir indeks olarak eklenebilir.
- _Harici arama motoru:_ Yazım hatası toleransı, çok daha zengin sıralama; ama ikinci veri kaynağı. Ölçek ya da özellik ihtiyacı doğarsa yeniden değerlendirilir.
- _`unaccent`:_ Aksan duyarsız arama için gerekli ama üretilmiş sütunda kullanılamaz (işlev "immutable" değil); şimdilik yok.

## Bilinen sınırlar

- Etiketler (labels) aranmıyor (`array_to_string` üretilmiş sütunda kullanılamaz); etiket süzgeci liste ekranında var.
- `prisma migrate diff`, üretilmiş sütunu "varsayılanı kaldır" olarak gösterir (Prisma'nın üretilmiş sütun bilgisi yok). Zararsız bir gürültü; migrasyon elle yazılmıştır.
- Arama yorumlara bakmaz.
