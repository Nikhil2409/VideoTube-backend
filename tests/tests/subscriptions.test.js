import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { getAuthToken } from '../helpers/auth.js';
import { errorRate, subscriptionTrend } from '../helpers/metrics.js';
import { testUsers } from '../data/testData.js';
import { baseUrl } from '../config/options.js';

export function setup() {
  // Prepare test data
  return {
    users: testUsers
  };
}

export default function(data) {
  const userIndex = __VU % data.users.length;
  const user = data.users[userIndex];
  
  // Get auth token
  const token = getAuthToken(userIndex);
  
  if (!token) {
    console.error(`Auth failed for ${user.email}`);
    errorRate.add(1);
    return;
  }
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
  };
  
  group('Subscriptions', function() {
    // Subscribe to a channel
    const otherUser = data.users[(userIndex + 1) % data.users.length];
    const subscriptionStart = new Date().getTime();
    
    const subscriptionRes = http.post(`${baseUrl}/subscriptions/c/${otherUser.userId}`, {}, params);
    
    subscriptionTrend.add(new Date().getTime() - subscriptionStart);
    
    check(subscriptionRes, {
      'subscription operation successful': (r) => r.status === 200 || r.status === 201,
    }) || errorRate.add(1);
    
    // Get subscribed channels
    const subscribedStart = new Date().getTime();
    const subscribedRes = http.get(`${baseUrl}/subscriptions`, params);
    subscriptionTrend.add(new Date().getTime() - subscribedStart);
    
    check(subscribedRes, {
      'subscribed channels fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // Check if subscribed to a channel
    const checkSubscriptionStart = new Date().getTime();
    const checkSubscriptionRes = http.get(`${baseUrl}/subscriptions/c/${otherUser.userId}`, params);
    subscriptionTrend.add(new Date().getTime() - checkSubscriptionStart);
    
    check(checkSubscriptionRes, {
      'subscription check successful': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // Unsubscribe (low frequency)
    if (Math.random() < 0.2) {
      const unsubscribeStart = new Date().getTime();
      const unsubscribeRes = http.delete(`${baseUrl}/subscriptions/c/${otherUser.userId}`, params);
      subscriptionTrend.add(new Date().getTime() - unsubscribeStart);
      
      check(unsubscribeRes, {
        'unsubscribe operation successful': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });
  
  // Random sleep between iterations to simulate realistic user behavior
  sleep(Math.random() * 0.5);
}