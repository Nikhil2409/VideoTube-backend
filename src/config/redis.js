import { createClient } from 'redis';
import dotenv from "dotenv";
dotenv.config({ path: "./src/.env" });

dotenv.config();
// Create the Redis client
 const redisClient = createClient({
  url: process.env.REDIS_URL,
});

// Connect to Redis and handle events
 const connectRedis = async () => {
  try {
    redisClient.on('error', (err) => console.log('Redis Client Error', err));
    redisClient.on('connect', () => console.log('Redis connected'));
    redisClient.on('ready', () => console.log('Redis ready'));
    redisClient.on('reconnecting', () => console.log('Redis reconnecting'));
    
    await redisClient.connect();
  } catch (error) {
    console.error('Redis connection failed:', error);
    // You might want to retry connection or exit the process
  }
};

// Call this function in your main server file
connectRedis();

export default redisClient;