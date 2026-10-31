# ADR-0003: NestJS 11, TypeScript 5.9 ve Jest (CommonJS)

- **Tarih:** 2026-11-09
- **Durum:** Kabul edildi

## Bağlam

API iskeletini kurarken `pnpm add` her paketin en yeni sürümünü getirdi: NestJS 12, TypeScript 7. İkisi de çalışma zamanında sorun çıkardı:

- **NestJS 12 yalnızca ESM** yayınlanıyor (`"type": "module"`). Jest CommonJS tabanlı çalıştığı için `@nestjs/testing` yüklenemedi (`Must use import to load ES Module`).
- **TypeScript 7** ile `ts-jest` çalışmıyor; ts-jest, TS 7'de bulunmayan JavaScript compiler API'sini kullanıyor.
- **Nest CLI** (`nest build`, `nest new`) Node 22.13'te bir ESM döngü hatasıyla çöküyor.

## Değerlendirilen seçenekler

1. **NestJS 12 + ESM:** Jest'i deneysel ESM moduna almak veya Vitest + SWC'ye geçmek gerekir; TS 7 için test araçları henüz olgunlaşmadı.
2. **NestJS 11 (CommonJS) + TypeScript 5.9 + Jest:** Resmi dokümanların, Prisma/Passport rehberlerinin ve sektördeki mevcut kod tabanlarının çoğunun kullandığı kombinasyon.

## Karar

NestJS `^11`, TypeScript `~5.9`, Jest + ts-jest, CommonJS. Nest CLI kullanmıyoruz; derleme `tsc`, geliştirme sunucusu `nodemon` + `ts-node`.

## Gerekçe ve sonuçlar

- Öğrenme sırasında araç uyumsuzluklarıyla uğraşmak yerine ana konulara (mimari, güvenlik, veri modeli) odaklanıyoruz.
- İş ilanlarında görülen mevcut Nest projelerinin çoğu bu yapıda; mülakat ve gerçek iş deneyimine daha yakın.
- **Bedel:** `nest generate` kısayollarını kullanamıyoruz (dosyaları elle oluşturuyoruz, bu da yapıyı daha iyi öğretiyor). Sürümleri `^`/`~` ile sabitlediğimiz için majör sürüm atlamaları bilinçli ADR kararıyla yapılacak.
- **Yeniden değerlendirme:** Node 24+'a geçildiğinde veya NestJS ekosistemi ESM'e olgunlaştığında yeni bir ADR ile NestJS 12'ye geçilebilir.
