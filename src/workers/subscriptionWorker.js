import { PrismaClient } from "@prisma/client";
import amqp from "amqplib";
import redisClient from "../config/redis.js";
import { REDIS_KEYS } from "../constants/redisKeys.js";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const QUEUE_NAME = process.env.QUEUE_NAME || "subscription_queue";

async function processSubscriptionQueue() {
  console.log("Subscription worker started");
  
  try {
    // Connect to RabbitMQ
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    // Make sure the queue exists
    await channel.assertQueue(QUEUE_NAME, {
      durable: true // Queue survives broker restart
    });
    
    // Only get one message at a time
    await channel.prefetch(1);
    
    console.log(`Waiting for messages in queue: ${QUEUE_NAME}`);
    
    // Consume messages
    channel.consume(QUEUE_NAME, async (message) => {
      if (!message) return;
      
      try {
        const { action, userId, subscriberId, username, timestamp } = JSON.parse(message.content.toString());
        
        console.log(`Processing ${action} for userId: ${userId} by subscriberId: ${subscriberId}`);
        
        if (action === 'SUBSCRIBE') {
          // Check if it already exists to avoid duplicates (idempotence)
          const existing = await prisma.subscription.findUnique({
            where: {
              subscriberId_userId: {
                subscriberId,
                userId
              }
            }
          });
          
          if (!existing) {
            await prisma.subscription.create({
              data: {
                subscriberId: subscriberId,
                userId: userId
              }
            });
          }
        } else { // UNSUBSCRIBE
          const existingSubscription = await prisma.subscription.findUnique({
            where: {
              subscriberId_userId: {
                subscriberId,
                userId
              }
            }
          });
          
          if (existingSubscription) {
            await prisma.subscription.delete({
              where: {
                id: existingSubscription.id
              }
            });
          }
        }
        
        // Get all related users for cache invalidation
        const subscriber = await prisma.user.findUnique({
          where: { id: subscriberId },
          select: { username: true }
        });
        
        // Clear ALL related caches - more aggressive approach
        // Clear subscriber's subscription list
        await redisClient.del(`${REDIS_KEYS.USER_SUBSCRIPTIONS}${subscriberId}`);
        
        // Clear channel owner's subscriber list
        await redisClient.del(`${REDIS_KEYS.USER_SUBSCRIBERS}${userId}`);
        
        // Clear user profiles
        await redisClient.del(`${REDIS_KEYS.USER}${username}`);
        if (subscriber) {
          await redisClient.del(`${REDIS_KEYS.USER}${subscriber.username}`);
        }
        
        // Clear all paginated caches
        const allPaginationKeys = await redisClient.keys(`${REDIS_KEYS.USER_SUBSCRIPTIONS}*`);
        const allSubscriberKeys = await redisClient.keys(`${REDIS_KEYS.USER_SUBSCRIBERS}*`);
        
        if (allPaginationKeys.length > 0) {
          await redisClient.del(allPaginationKeys);
        }
        if (allSubscriberKeys.length > 0) {
          await redisClient.del(allSubscriberKeys);
        }
        
        // Update subscriber count caches
        const totalSubscribers = await prisma.subscription.count({
          where: { userId: userId }
        });
        
        await redisClient.set(
          `${REDIS_KEYS.USER_SUBSCRIBERS}${userId}_count`,
          totalSubscribers.toString(),
          { EX: 3600 }
        );
        
        const totalSubscriptions = await prisma.subscription.count({
          where: { subscriberId: subscriberId }
        });
        
        await redisClient.set(
          `${REDIS_KEYS.USER_SUBSCRIPTIONS}${subscriberId}_count`,
          totalSubscriptions.toString(),
          { EX: 3600 }
        );
        
        // Acknowledge the message - removes it from the queue
        channel.ack(message);
        
        console.log(`Successfully processed ${action} for userId: ${userId} by subscriberId: ${subscriberId}`);
      } catch (error) {
        console.error(`Failed to process subscription: ${error.message}`);
        // Nack and requeue the message for retry
        channel.nack(message, false, true);
      }
    });
    
    // Handle connection closure
    process.on('SIGINT', async () => {
      await channel.close();
      await connection.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error(`Worker connection error: ${error.message}`);
    // Wait before trying again to avoid hammering if there's a persistent error
    await new Promise(resolve => setTimeout(resolve, 5000));
    // Retry the connection
    processSubscriptionQueue();
  }
}

// Start the worker
processSubscriptionQueue().catch(error => {
  console.error("Fatal worker error:", error);
  process.exit(1);
});