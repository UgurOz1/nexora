import { Injectable, Logger } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { QueuesService } from '../queues/queues.service';

// Numbers about the running server in the Prometheus text format, read by GET /api/metrics.
//
// A registry of its own instead of prom-client's global one: the e2e tests start several apps in
// one process, and a metric can be registered only once per registry.
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  readonly registry = new Registry();

  // Labels use the route TEMPLATE (/api/v1/organizations/:orgId/tasks), never the real URL: every
  // distinct label value is a separate time series, and ids in URLs would create millions.
  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Time from receiving a request to finishing the response',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly cacheRequests = new Counter({
    name: 'cache_requests_total',
    help: 'Cache lookups by result (hit, miss, error)',
    labelNames: ['cache', 'result'] as const,
    registers: [this.registry],
  });

  constructor(queues: QueuesService) {
    // Process numbers: memory, CPU, event loop lag, garbage collection.
    collectDefaultMetrics({ register: this.registry });

    const logger = this.logger;
    new Gauge({
      name: 'queue_jobs',
      help: 'Jobs in each background queue by state',
      labelNames: ['queue', 'state'] as const,
      registers: [this.registry],
      // Read from Redis when Prometheus asks, so the number is never stale.
      async collect() {
        this.reset();
        try {
          for (const { queue, state, count } of await queues.jobCounts()) {
            this.set({ queue, state }, count);
          }
        } catch (error) {
          // Without Redis the queue numbers are missing, but the rest of the page still answers.
          logger.warn({ err: error }, 'Could not read queue sizes');
        }
      },
    });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
