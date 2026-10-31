# ADR-0001: Teknoloji yığını

- **Tarih:** 2026-10-31
- **Durum:** Kabul edildi

## Bağlam

NEXORA hem bir öğrenme projesi hem de iş başvurularında gösterilecek bir portföy projesi. Hedef pozisyon henüz kesin değil; "en çok ilan olan alan" hedefleniyor. Geliştirici TypeScript'e hakim, Docker'ı bilmiyor. Süre 13 hafta.

## Değerlendirilen seçenekler

**Backend**

1. **NestJS (TypeScript):** Frontend ile aynı dil, modüler mimari, dependency injection, decorator'lar. Mimari olarak Spring Boot'a çok benzer.
2. **Spring Boot (Java):** Türkiye'de kurumsal ilanlarda çok yaygın. Ama yeni bir dil ve ekosistem öğrenmek 13 haftalık süreyi zorlar.
3. **.NET:** Spring ile benzer durumda.
4. **Express:** Basit, ama mimariyi tamamen bize bırakır; "sağlam backend mimarisi" göstermek zorlaşır.

**ORM**

1. **Prisma:** Tip güvenliği yüksek, şema dosyası okunaklı, migration'lar kolay.
2. **TypeORM:** NestJS'te yaygın, ama tip güvenliği zayıf ve bakım geçmişi sorunlu.
3. **Drizzle:** SQL'e yakın ve hızlı, ama ekosistemi daha genç.

**Arka plan işleri:** BullMQ (Redis üzerinde, Node ekosisteminin standardı) ile RabbitMQ (daha güçlü, ama ek bir altyapı) karşılaştırıldı.

## Karar

TypeScript ağırlıklı yığın: NestJS + Prisma + PostgreSQL + Redis + BullMQ + Socket.IO, frontend'de Next.js + Tailwind + shadcn/ui, altyapıda Docker + GitHub Actions. Ayrıntılı liste CLAUDE.md'de.

## Gerekçe ve sonuçlar

- Tek dil (TypeScript) sayesinde zaman yeni bir dil öğrenmeye değil **mimari kavramlara** gidiyor: çok kiracılık, RBAC, kuyruklar, realtime, test, CI/CD. Bu kavramlar dilden bağımsızdır ve mülakatta asıl sorulan şeylerdir.
- NestJS'in module/DI/decorator yapısı Spring Boot ve .NET ile çok benzer; ileride Java/.NET ilanına geçiş kolaylaşır.
- Full-stack (React/Next.js + Node) ilanları en geniş havuzlardan biri.
- DOCUMIND'da Python/FastAPI kullanılacak; böylece portföyde iki backend ekosistemi olacak.
- **Vazgeçilen:** Java/.NET ağırlıklı kurumsal ilanlarda doğrudan dil deneyimi. Mayıs'ta ilanlara bakılıp gerekirse küçük bir Spring Boot projesiyle tamamlanabilir.
