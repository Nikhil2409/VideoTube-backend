import http from 'k6/http';
import { check, sleep } from 'k6';
import { asyncOperationsTrend, asyncOperationErrors, authTrend, errorRate } from './metrics.js';

// Auth token cache
let authTokens = {};
let refreshTokens = {};
let pendingAuthRequests = {}; // Track pending async auth requests

// Helper function to generate a request ID
function generateRequestId() {
  return `req_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

// Function to initiate an async auth request
export function initiateAsyncAuth(user, baseUrl) {
  const requestId = generateRequestId();
  
  // Store the request time - using string requestId as key
  pendingAuthRequests[requestId] = {
    email: user.email,
    password: user.password,
    requestTime: new Date().getTime(),
    completed: false
  };
  
  // Send the auth request to the login endpoint
  const requestBody = JSON.stringify({
    email: user.email,
    password: user.password
  });
  
  const res = http.post(`${baseUrl}/users/login`, requestBody, {
    headers: { 'Content-Type': 'application/json' }
  });
  
  // The login endpoint returns 200 for successful authentication
  check(res, {
    'auth request initiated': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  // If successful, store the tokens
  if (res.status === 200) {
    try {
      const responseBody = JSON.parse(res.body);
      pendingAuthRequests[requestId].completed = true;
      
      // Calculate operation time
      const operationTime = new Date().getTime() - pendingAuthRequests[requestId].requestTime;
      asyncOperationsTrend.add(operationTime);
      
      // Store tokens
      authTokens[user.email] = {
        token: responseBody.data.accessToken,
        expires: new Date().getTime() + 3500000
      };
      
      if (responseBody.data.refreshToken) {
        refreshTokens[user.email] = responseBody.data.refreshToken;
      }
      
      return requestId;
    } catch (e) {
      console.error(`Error parsing auth response: ${e.message}`);
      return null;
    }
  } else {
    console.warn(`Async auth failed for ${user.email}`);
    return null;
  }
}

// Function to poll for auth completion
export function pollForAuthCompletion(requestId, baseUrl, maxAttempts = 10, waitTime = 100) {
  // Check if requestId is valid
  if (typeof requestId !== 'string') {
    console.error(`Invalid requestId: ${typeof requestId}`);
    return null;
  }
  
  // If the request doesn't exist or is already completed, no need to poll
  if (!pendingAuthRequests[requestId]) {
    console.error(`No pending auth request found for ${requestId}`);
    return null;
  }
  
  if (pendingAuthRequests[requestId].completed) {
    const email = pendingAuthRequests[requestId].email;
    return authTokens[email]?.token || null;
  }
  
  let attempts = 0;
  const email = pendingAuthRequests[requestId].email;
  const password = pendingAuthRequests[requestId].password;
  
  while (attempts < maxAttempts) {
    // Try a direct login since the process might complete by now
    const loginRes = http.post(`${baseUrl}/users/login`, 
      JSON.stringify({ email, password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (loginRes.status === 200) {
      try {
        const responseBody = JSON.parse(loginRes.body);
        pendingAuthRequests[requestId].completed = true;
        
        // Calculate operation time
        const operationTime = new Date().getTime() - pendingAuthRequests[requestId].requestTime;
        asyncOperationsTrend.add(operationTime);
        
        // Store tokens
        authTokens[email] = {
          token: responseBody.data.accessToken,
          expires: new Date().getTime() + 3500000
        };
        
        if (responseBody.data.refreshToken) {
          refreshTokens[email] = responseBody.data.refreshToken;
        }
        
        return responseBody.data.accessToken;
      } catch (e) {
        console.error(`Error parsing auth response: ${e.message}`);
      }
    }
    
    sleep(waitTime / 1000); // Convert ms to seconds for sleep
    attempts++;
  }
  
  // If we reach here, the operation timed out
  console.warn(`Async auth failed for ${email}`);
  asyncOperationErrors.add(1);
  return null;
}

// Function to get auth token (either from cache or get a new one)
export function getAuthToken(user, baseUrl) {
  // Check if we already have a valid token
  if (authTokens[user.email] && authTokens[user.email].expires > new Date().getTime()) {
    return authTokens[user.email].token;
  }
  
  // Check if we have a pending request for this user
  const pendingRequestId = Object.keys(pendingAuthRequests).find(
    key => pendingAuthRequests[key].email === user.email && !pendingAuthRequests[key].completed
  );
  
  if (pendingRequestId) {
    // Poll for the pending request
    return pollForAuthCompletion(pendingRequestId, baseUrl);
  } else {
    // Initiate a new async auth request
    const requestId = initiateAsyncAuth(user, baseUrl);
    // Wait a bit before polling to give the system time to process
    sleep(0.1);
    return pollForAuthCompletion(requestId, baseUrl);
  }
}

// Synchronous login (fallback)
export function loginUser(user, baseUrl) {
  const loginStart = new Date().getTime();
  
  const loginRes = http.post(`${baseUrl}/users/login`, JSON.stringify({
    email: user.email,
    password: user.password
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  authTrend.add(new Date().getTime() - loginStart);

  if (loginRes.status === 200) {
    try {
      const responseBody = JSON.parse(loginRes.body);
      let token = responseBody.data?.accessToken || responseBody.accessToken;
      let refreshToken = responseBody.data?.refreshToken || responseBody.refreshToken;

      if (token) {
        authTokens[user.email] = {
          token: token,
          expires: new Date().getTime() + 3500000
        };
        if (refreshToken) refreshTokens[user.email] = refreshToken;
        return token;
      }
    } catch (e) {
      console.error(`Error parsing login response: ${e.message}`);
    }
  }
  
  return null;
}

// Function to refresh token
export function refreshToken(user, baseUrl) {
  const refreshToken = refreshTokens[user.email];
  
  if (!refreshToken) {
    console.error(`No refresh token available for ${user.email}`);
    return false;
  }
  
  const refreshStart = new Date().getTime();
  const refreshRes = http.post(`${baseUrl}/users/refresh-token`, 
    JSON.stringify({ refreshToken: refreshToken }), 
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  authTrend.add(new Date().getTime() - refreshStart);
  
  if (refreshRes.status === 200) {
    try {
      const responseBody = refreshRes.json();
      
      // Extract new tokens
      const newToken = responseBody.data?.accessToken || responseBody.accessToken;
      const newRefreshToken = responseBody.data?.refreshToken || responseBody.refreshToken;
      
      if (!newToken) {
        console.error(`No new token found in refresh response for ${user.email}`);
        return false;
      }
      
      // Update stored tokens
      authTokens[user.email] = {
        token: newToken,
        expires: new Date().getTime() + 3500000 // Slightly less than 1 hour
      };
      
      if (newRefreshToken) {
        refreshTokens[user.email] = newRefreshToken;
      }
      
      return true;
    } catch (e) {
      console.error(`Error parsing refresh response for ${user.email}: ${e}`);
      return false;
    }
  }
  
  console.error(`Failed to refresh token for ${user.email}: ${refreshRes.status}`);
  return false;
}

// Function to get auth headers
export function getAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}