import { Rate, Trend } from 'k6/metrics';

// Custom metrics for different endpoints
export const errorRate = new Rate('errors');
export const videoFetchTrend = new Trend('video_fetch');
export const commentsTrend = new Trend('comments');
export const likesOperationTrend = new Trend('likes_operation');
export const authTrend = new Trend('auth_operations');
export const subscriptionTrend = new Trend('subscription');
export const playlistTrend = new Trend('playlist');
export const watchHistoryTrend = new Trend('watch_history');
export const tweetsTrend = new Trend('tweets');
export const userProfileTrend = new Trend('user_profile');
export const asyncOperationsTrend = new Trend('async_operations');

// Custom metric for tracking async operations
export const asyncOperationErrors = new Rate('async_operation_errors');