// k6 load test for the API (docs/PERFORMANCE.md).
//
// Prepare: load data (pnpm --filter @nexora/api seed:load) and an API started with
// RATE_LIMIT_ENABLED=false (all virtual users come from one IP address, and the limiter would turn
// most of them away: this measures the server, not the limiter).
//
// Run with Docker (no k6 install needed):
//   docker run --rm -i -e BASE_URL=http://host.docker.internal:3001 grafana/k6:1.4.2 run - < load/api-load.js
//
// What one virtual user does, again and again: open the dashboard, look at a project's board and
// task list, search, and (managers) the team page; with a second of "reading" between requests.
import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE = `${__ENV.BASE_URL || 'http://localhost:3001'}/api/v1`;
const PASSWORD = __ENV.LOAD_PASSWORD || 'load-test-password';
const USERS = 20;
const VUS = Number(__ENV.VUS || 50);

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      stages: [
        { duration: '15s', target: VUS }, // ramp up
        { duration: '60s', target: VUS }, // steady
        { duration: '5s', target: 0 },
      ],
    },
  },
  // The test fails (non-zero exit) if any of these is broken.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:overview}': ['p(95)<500'],
    'http_req_duration{name:board}': ['p(95)<500'],
    'http_req_duration{name:tasks}': ['p(95)<500'],
    'http_req_duration{name:search}': ['p(95)<500'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const json = (res) => res.json();

// Runs once: signs every load user in and finds the organization and its projects.
export function setup() {
  const tokens = [];
  for (let i = 1; i <= USERS; i++) {
    const email = `load.user${String(i).padStart(2, '0')}@nexora.test`;
    const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
    tokens.push(json(res).accessToken);
  }
  const auth = { headers: { Authorization: `Bearer ${tokens[0]}` } };
  const orgs = json(http.get(`${BASE}/organizations`, auth));
  const org = orgs.find((o) => o.slug === 'load-main');
  if (!org) throw new Error('No load-main organization: run seed:load first');
  const projects = json(http.get(`${BASE}/organizations/${org.id}/projects`, auth));
  return { tokens, orgId: org.id, projectIds: projects.map((p) => p.id) };
}

export default function (data) {
  // Users 01-04 are OWNER and MANAGERs (see seed-load.ts) and may open the team page.
  const userIndex = (__VU - 1) % USERS;
  const params = (name) => ({
    headers: { Authorization: `Bearer ${data.tokens[userIndex]}` },
    tags: { name },
  });
  const org = `${BASE}/organizations/${data.orgId}`;
  const project = data.projectIds[Math.floor(Math.random() * data.projectIds.length)];
  const ok = (res) => check(res, { 'status is 200': (r) => r.status === 200 });

  ok(http.get(`${org}/analytics/overview?days=30`, params('overview')));
  sleep(1);
  ok(http.get(`${org}/projects/${project}/board`, params('board')));
  sleep(1);
  ok(http.get(`${org}/projects/${project}/tasks?limit=20`, params('tasks')));
  sleep(1);
  // A task number, like someone looking for a ticket they know. (A word that is in every one of
  // the 200 000 titles, such as "load", is the worst case: docs/PERFORMANCE.md.)
  const number = 1000 + Math.floor(Math.random() * 199000);
  ok(http.get(`${org}/search?q=${number}`, params('search')));
  sleep(1);
  if (userIndex < 4) {
    ok(http.get(`${org}/analytics/team?days=30`, params('team')));
    sleep(1);
  }
}
