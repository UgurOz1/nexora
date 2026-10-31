# ADR-0002: Monorepo ve pnpm workspaces

- **Tarih:** 2026-11-02
- **Durum:** Kabul edildi

## Bağlam

NEXORA'da en az iki uygulama var (`apps/api`, `apps/web`) ve ikisinin paylaşacağı kod olacak (ör. tip tanımları, ortak ESLint/TS ayarları). Kodu nasıl organize edeceğiz?

## Değerlendirilen seçenekler

1. **Ayrı repolar (polyrepo):** Her uygulama kendi reposunda. Bağımsız deploy kolay, ama ortak kodu paylaşmak için paket yayınlamak gerekir ve bir özelliğin API + web parçaları iki ayrı PR olur.
2. **Monorepo + pnpm workspaces:** Tek repo, birden çok paket. Ortak kod `packages/` altında; API ve web değişikliği tek PR'da.
3. **Monorepo + Nx / Turborepo:** pnpm workspaces'in üstüne cache ve görev orkestrasyonu ekler. Güçlü, ama 2 uygulama için fazla.

## Karar

pnpm workspaces ile monorepo. Nx/Turborepo şimdilik yok; build süreleri sorun olursa yeni bir ADR ile ekleriz.

## Gerekçe ve sonuçlar

- Bir özellik (ör. yeni endpoint + ekranı) tek PR ve tek commit geçmişinde görünür; portföyde okunması kolay.
- Ortak ayarlar (Prettier, commitlint, CI) tek yerde.
- pnpm, bağımlılıkları disk üzerinde tek kopya tutar ve paketlerin birbirinin gizli bağımlılığına erişmesini engeller (katı `node_modules` yapısı).
- **Bedel:** CI tüm repoyu gezer; ileride yavaşlarsa yalnızca değişen paketleri çalıştıracak bir araç (Turborepo) gerekebilir.
