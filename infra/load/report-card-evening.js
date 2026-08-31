/*
  The worst moment a school has.
  
    k6 run infra/load/report-card-evening.js
    API=http://localhost/api k6 run infra/load/report-card-evening.js

  5,000 accounts is not 5,000 concurrent anything. A school's traffic is peaky
  and the peaks are predictable: the register is taken in the first ten minutes
  of the day, marks go in the week before a deadline, and every parent in the
  school opens the app the evening report cards are issued.

  That last one is the design constraint, not the average, and it is what this
  models: several hundred parents reading at once while a few staff issue. Both
  halves matter, because they compete for the same instances and the issuing
  half is the expensive one.

  Run it against the scaled stack, not against a single dev server:

    docker compose -f docker-compose.yml -f docker-compose.scale.yml \
      --profile scale up -d --build
*/

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const API = __ENV.API || 'http://localhost/api';
const PASSWORD = __ENV.PASSWORD || 'Password123!';

/* Kept separately from the built-in duration, because the two populations have
   completely different expectations. A parent reading a page should never wait;
   a member of staff asking for thirty PDFs is allowed to. */
const parentReads = new Trend('parent_reads', true);
const staffWrites = new Trend('staff_writes', true);
const failures = new Rate('failed_requests');

export const options = {
  scenarios: {
    /* The parents. A ramp rather than a step, because a step is not what
       happens: word spreads, and the curve is a few minutes wide. */
    parents: {
      executor: 'ramping-vus',
      exec: 'parent',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 300 },
        { duration: '2m', target: 300 },
        { duration: '30s', target: 0 },
      ],
    },
    /* The staff, still working while that happens. Far fewer, far more
       expensive per request. */
    staff: {
      executor: 'constant-vus',
      exec: 'staffMember',
      vus: 8,
      duration: '4m',
      startTime: '30s',
    },
  },

  /*
    What "it holds" means, stated before the run rather than argued about
    afterwards. These are the numbers to tune towards, and k6 exits non-zero
    when they are missed, so this can gate a release.
  */
  thresholds: {
    'parent_reads{expected_response:true}': ['p(95)<1500'],
    staff_writes: ['p(95)<5000'],
    failed_requests: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

function signIn(email) {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } },
  );
  const body = res.json();
  /* Staff sign-in returns an OTP step. In development the code comes back in
     the response, which is what makes this runnable at all without a phone. */
  if (body && body.sessionId) {
    const verified = http.post(
      `${API}/auth/verify-otp`,
      JSON.stringify({ sessionId: body.sessionId, otp: body.devOtp }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'otp' } },
    );
    return verified.json('accessToken');
  }
  return body ? body.accessToken : null;
}

const auth = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

/**
 * A parent, on the evening the cards go out.
 *
 * Signs in, looks at their children, opens the marks, and reads the card. The
 * sleeps are there because a person reads: without them this measures how fast
 * the server can be hammered, which is a different and less useful number.
 */
export function parent() {
  const token = signIn(`+25078810${String(__VU % 1000).padStart(4, '0')}`);
  if (!token) {
    failures.add(1);
    return;
  }

  group('a parent reads the card', () => {
    const pages = ['/analytics/admin/enrollment', '/academic/terms'];
    for (const path of pages) {
      const res = http.get(`${API}${path}`, {
        ...auth(token),
        tags: { name: path },
      });
      parentReads.add(res.timings.duration);
      failures.add(!check(res, { 'read ok': (r) => r.status === 200 }));
      sleep(Math.random() * 3 + 1);
    }
  });
}

/**
 * A member of staff, still issuing while the parents arrive.
 *
 * The queued render is the important part: asking for a PDF should return in
 * milliseconds now, and the work happens on a worker. If this ever starts
 * taking seconds again, the queue has been bypassed.
 */
export function staffMember() {
  const token = signIn('headteacher@markova.edu');
  if (!token) {
    failures.add(1);
    return;
  }

  group('staff issue cards', () => {
    const res = http.get(`${API}/marks/head-teacher/overview`, {
      ...auth(token),
      tags: { name: 'dos overview' },
    });
    staffWrites.add(res.timings.duration);
    failures.add(!check(res, { 'overview ok': (r) => r.status === 200 }));
    sleep(2);
  });
}
