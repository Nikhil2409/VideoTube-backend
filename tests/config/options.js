export const baseOptions = {
    thresholds: {
      'http_req_duration': ['p(95)<500'], // 95% of requests must complete below 500ms
      'video_fetch': ['p(95)<300'],       // Video fetches below 300ms
      'auth_operations': ['p(95)<150'],   // Auth operations below 150ms
      'user_profile': ['p(95)<200'],      // User profile operations below 200ms
      'tweets': ['p(95)<250'],            // Tweet operations below 250ms
      'watch_history': ['p(95)<300'],     // Watch history operations below 300ms
      'http_req_failed': ['rate<0.01'],   // Less than 1% of requests should fail
      'async_operations': ['p(95)<1000'], // Async operations should complete within 1 second
      'async_operation_errors': ['rate<0.05'], // Less than 5% async operation failures
    },
  };
  
  // Configuration for different load profiles
  export const loadProfiles = {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
    },
    average: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
    peak: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      stages: [
        { duration: '10s', target: 20 },
        { duration: '30s', target: 20 },
        { duration: '10s', target: 0 },
      ],
      preAllocatedVUs: 30,
      maxVUs: 60,
    },
    endurance: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 10,
      maxVUs: 20,
    }
  };
  
  // Create options objects for each test type
  export function createOptions(testName, profile = 'average') {
    return {
      scenarios: {
        [testName]: loadProfiles[profile]
      },
      thresholds: baseOptions.thresholds
    };
  }