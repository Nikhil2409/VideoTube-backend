import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { createOptions } from '../config/options.js';
import { authTrend, errorRate } from '../helpers/metrics.js';
import { loginUser, refreshToken } from '../helpers/auth.js';

// Load test data
const data = new SharedArray('test data', function() {
  return JSON.parse(open('../data/testData.json'));
});

export const options = createOptions('authentication');

export default function() {
  const baseUrl = 'http://localhost:3900/api/v1';
  const userIndex = __VU % data.users.length;
  const user = data.users[userIndex];
  
  group('Login Flow', function() {
    // Regular login
    const token = loginUser(user, baseUrl);
    
    check(token, {
      'login successful': (t) => t !== null,
    }) || errorRate.add(1);
    
    if (token) {
      // Auth headers for subsequent requests
      const params = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      };
      
      // Get current user profile to verify token works
      const currentUserStart = new Date().getTime();
      const currentUserRes = http.get(`${baseUrl}/users/current-user`, params);
      authTrend.add(new Date().getTime() - currentUserStart);
      
      check(currentUserRes, {
        'current user fetch with token successful': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });
  
  sleep(1);
  
  group('Token Refresh', function() {
    // First login to get initial token
    loginUser(user, baseUrl);
    
    // Then test refresh token flow
    const refreshSuccess = refreshToken(user, baseUrl);
    
    check(null, {
      'token refresh successful': () => refreshSuccess,
    }) || errorRate.add(1);
    
    if (refreshSuccess) {
      // Get current user after refresh to verify new token works
      const params = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}` // Should be updated by refresh
        },
      };
      
      const currentUserRes = http.get(`${baseUrl}/users/current-user`, params);
      
      check(currentUserRes, {
        'user fetch after refresh successful': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });
  
  // Small random pause between iterations
  sleep(Math.random() * 1 + 0.5);
}