# Performans ölçümleri

Hafta 12'de ölçülen rakamlar ve nasıl tekrar ölçüleceği. Kararların gerekçesi: [ADR-0013](adr/0013-analytics-cache-and-metrics.md).

## Ortam ve veri

- Tek bir geliştirici bilgisayarı (Windows 11, Docker Desktop): Postgres 16 ve Redis 7 konteynerde. API, derlenmiş kodla tek Node 22 sürecinde (`NODE_ENV=production`).
- `pnpm --filter @nexora/api seed:load` ile **1 000 000 görev** üretildi. 200 000'i ölçülen şirkette ("Load Test Co": 40 proje, 5 departman, 20 üye). 4 × 200 000'i başka şirketlerde ("gürültü"): tek şirketlik bir tabloda `organizationId` filtresi her satırı seçer ve hiçbir indeks işe yarar görünmez.
- Görevlerin %45'i bitmiş, %70'inin bitiş tarihi var, oluşturma zamanları son 120 güne dağılmış.
- Rakamlar sıcak önbellekle (her ölçüm en az iki kez çalıştırıldı, sonuncusu alındı). Mutlak değerler makineye göre değişir; önemli olan önce/sonra oranı.

## 1. Dashboard sorguları: `EXPLAIN (ANALYZE, BUFFERS)`

Betik: [`apps/api/scripts/explain-analytics.sql`](../apps/api/scripts/explain-analytics.sql)

```bash
docker exec -i nexora-postgres-1 psql -U nexora -d nexora < apps/api/scripts/explain-analytics.sql
```

**Önce** (ilk yazılan sorgular, yeni indeksler yok). Her sorgu şirketin 200 000 satırını tablodan okuyordu (9 138 sayfa).

| Sorgu                   | Süre          | Not                                         |
| ----------------------- | ------------- | ------------------------------------------- |
| toplamlar               | 125 ms        |                                             |
| günlük seri             | 173 ms        | iki ayrı tam okuma                          |
| projeler                | 226 ms        | her görev satırı projeye birleştiriliyor    |
| departmanlar            | 573 ms        | `count(DISTINCT)`: **21 MB diske sıralama** |
| kişiler (takım)         | 481 ms        | birleştirme için **21 MB diske sıralama**   |
| atanmamış               | 107 ms        |                                             |
| **genel bakış toplamı** | **~1 100 ms** |                                             |
| **takım toplamı**       | **~590 ms**   |                                             |

**Sonra:** sorgular "açık işler" ve "biten işler" dilimlerine bölündü, kişi/proje toplamları önce gruplanıp sonra birleştirildi, departmanlar proje sonuçlarından toplandı (bir sorgu eksildi), iki kısmi + kapsayan indeks eklendi.

| Sorgu                   | Süre                 | Plan                                                    |
| ----------------------- | -------------------- | ------------------------------------------------------- |
| açık işler              | 18 ms                | Index Only Scan `tasks_open_work_idx`, tabloya 0 erişim |
| biten işler             | 36 ms                | Index Only Scan `tasks_completed_idx`, tabloya 0 erişim |
| oluşturulan (30 gün)    | 32 ms                | tam okuma (aşağıda neden)                               |
| günlük seri             | 83 ms                | biten kısmı indeksten, oluşturulan kısmı tam okuma      |
| projeler                | 52 ms                | iki indeks, tabloya 0 erişim                            |
| kişiler                 | 64 ms                | iki indeks, diske sıralama yok                          |
| atanmamış               | 30 ms                | Index Only Scan `tasks_open_work_idx`                   |
| **genel bakış toplamı** | **~220 ms** (≈5 kat) |
| **takım toplamı**       | **~95 ms** (≈6 kat)  |

API bu sorguları paralel çalıştırır; kullanıcının beklediği süre toplamdan da kısadır.

**Kullanılmayan indeks:** "Son 30 günde oluşturulan" sorgusu mevcut `(organizationId, createdAt)` indeksini **kullanmadı**, planlayıcı haklıydı. Eşleşen 49 731 satır (%25) tablonun neredeyse her sayfasına dağılmış durumda; indeksle gitmek yine hemen her sayfayı okumak demek, üstelik rastgele sırayla. Daha uzun geçmişi olan gerçek bir şirkette 30 gün çok daha küçük bir oran olur ve indeks seçilir.

**İndeksin bedeli:**

|                       | Boyut  |
| --------------------- | ------ |
| tablo (1 M görev)     | 357 MB |
| `tasks_open_work_idx` | 59 MB  |
| `tasks_completed_idx` | 71 MB  |

Yazma maliyeti (200 000 görev ekleme, `seed:load`): indekslerden önce 10,2–12,1 s, sonra yaklaşık 17 s (iki koşuda 25–31 s; makine o sırada meşguldü). Toplu eklemede yaklaşık 1,5 kat yavaşlama: okumada kazanılan, yazmada ödeniyor. Kısmi oldukları için yalnızca kendi dilimlerindeki satırlar indekse girer: açık iş yalnızca birincisine, biten iş yalnızca ikincisine.

## 2. Yük testi (k6)

Betik: [`load/api-load.js`](../load/api-load.js). Her sanal kullanıcı döngüde dashboard'u açar, rastgele bir projenin board'una ve görev listesine bakar, bir görev numarası arar, yöneticiyse takım sayfasını açar. İstekler arasında 1 saniye bekler. 50 sanal kullanıcı, 15 s artış + 60 s sabit yük.

```bash
pnpm --filter @nexora/api build
# API'yi hız sınırı kapalı başlat (bütün kullanıcılar tek IP'den gelir; sınırlayıcıyı değil sunucuyu ölçüyoruz)
NODE_ENV=production RATE_LIMIT_ENABLED=false node apps/api/dist/main.js > api.log 2>&1 &
docker run --rm -i -e BASE_URL=http://host.docker.internal:3001 grafana/k6:1.4.2 run - < load/api-load.js
```

**Sonuç** (cache açık, düzeltmelerden sonra). Hata oranı %0, 3 434 istek, saniyede 40 istek. Bu, bu senaryonun üretebildiği yükün tamamı; sunucu doymadı. Olay döngüsü gecikmesi p99 31 ms.

| İstek            | medyan | p95        | p99    |
| ---------------- | ------ | ---------- | ------ |
| dashboard        | 17 ms  | **68 ms**  | 186 ms |
| arama            | 25 ms  | **69 ms**  | 237 ms |
| görev listesi    | 34 ms  | **103 ms** | 351 ms |
| board (400 kart) | 109 ms | **191 ms** | 489 ms |

**Cache kapalıyken** (`ANALYTICS_CACHE_TTL_SECONDS=0`, aynı test): dashboard p95 906 ms. Ama yalnızca dashboard yavaşlamadı: her dashboard açılışı veritabanını meşgul ettiği için **bütün** istekler yavaşladı (board p95 1,06 s, görev listesi 987 ms, arama 897 ms) ve saniyede 30 isteğe düştü. Cache yalnızca kendi sayfasını değil, sistemin geri kalanını da korur.

### Yük testinin bulduğu sorunlar

İlk koşu hatasızdı ama yavaştı: saniyede 10 istek, p95 board 7,6 s, görev listesi 5,8 s, arama 4,8 s. Üç sebebi vardı:

1. **Prisma `_count` tuzağı (asıl sorun).** Görev seçimindeki `_count` (alt görev ve açık bağımlılık sayısı) için Prisma `LEFT JOIN (SELECT "parentId", COUNT(*) FROM tasks … GROUP BY "parentId")` üretiyordu. Yani 20 satırlık bir liste için **bütün tablonun** (1 M satır) alt görevlerini sayıyordu: istek başına ~300 ms, board'da dört kolon için dört kez. Sayımlar, dönen satırların kimlikleriyle sınırlı iki küçük `groupBy` sorgusuna taşındı ([`task-counts.ts`](../apps/api/src/tasks/task-counts.ts)). Proje listesindeki görev sayısı da aynı şekilde düzeltildi. Tek istekte: görev listesi 140 → 35 ms, board 400 → 150 ms. Bulmanın yolu: Postgres'te `log_min_duration_statement = 30` ile 30 ms'yi aşan SQL'leri loglamak.
2. **Gerçekçi olmayan arama.** Betik "load", "task" gibi 200 000 başlığın hepsinde geçen kelimeleri arıyordu: hepsi eşleşir ve hepsi sıralanır (tek istekte 450 ms–1 s). Bu en kötü durum ve burada belgeli; senaryo artık bir görev numarası arıyor (tek istekte 30 ms).
3. **Ölçüm ortamı.** API'nin çıktısı PowerShell'in `*>` yönlendirmesiyle dosyaya yazılıyordu ve PowerShell her log satırını tek tek işliyor; Node'un olay döngüsü yazmayı bekliyordu. Düz dosya yönlendirmesiyle aynı kod ve aynı veriyle saniyede 34'ten 40 isteğe çıktı ve p95'ler 4–7 kat düştü. Ders: önce ölçümü ölç.

## 3. Bilinen yavaş noktalar

- **Her başlıkta geçen kelimeyle arama:** 200 000 eşleşmenin hepsi sıralanır (450 ms–1 s). Çözüm seçenekleri: eşleşme sayısı çok büyükse sıralamadan son değişenleri döndürmek ya da sonuç sayısını sınırlayıp sonra sıralamak.
- **Proje listesindeki görev sayıları** şirketin bütün görevlerini sayar (200 000 görevde ~150 ms). Gerekirse projeye sayaç sütunu ya da cache.
- **Board** 400 kartı açıklamalarıyla birlikte döndürür (245 KB). Kartta açıklama gösterilmediği için ayrı bir "kart" seçimi yanıtı küçültür.
