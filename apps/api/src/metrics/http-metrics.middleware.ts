import type { NextFunction, Request, Response } from 'express';
import type { MetricsService } from './metrics.service';

// Times every request, including the ones a guard turns away (401, 403, 429), which an
// interceptor would never see. The route is read when the response is finished: only then has
// the router matched it.
export function httpMetrics(metrics: MetricsService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const end = metrics.httpDuration.startTimer();
    res.on('finish', () => {
      end({ method: req.method, route: routeOf(req), status: String(res.statusCode) });
    });
    next();
  };
}

// The matched route template, or "unmatched" for 404s, so unknown URLs (scanners trying
// /wp-admin, ...) all share one label instead of creating a series each.
export function routeOf(req: Pick<Request, 'baseUrl'> & { route?: { path?: unknown } }): string {
  const path = req.route?.path;
  return typeof path === 'string' ? `${req.baseUrl ?? ''}${path}` : 'unmatched';
}
