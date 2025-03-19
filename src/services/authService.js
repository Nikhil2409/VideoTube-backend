import amqp from 'amqplib';
import UserTokenService from "../utils/Auth.utils.js"
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// RabbitMQ connection settings
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUES = {
  TOKEN_GENERATION: 'auth.token.generation',
  LOGIN: 'auth.login',
  REGISTER: 'auth.register',
  REFRESH_TOKEN: 'auth.refresh.token'
};

class AuthService {
  constructor() {
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    try {
      console.log('Connecting to RabbitMQ...');
      this.connection = await amqp.connect(RABBITMQ_URL);
      this.channel = await this.connection.createChannel();
      
      // Ensure queues exist
      await this.channel.assertQueue(QUEUES.TOKEN_GENERATION, { durable: true });
      await this.channel.assertQueue(QUEUES.LOGIN, { durable: true });
      await this.channel.assertQueue(QUEUES.REGISTER, { durable: true });
      await this.channel.assertQueue(QUEUES.REFRESH_TOKEN, { durable: true });
      
      console.log('Connected to RabbitMQ and queues set up');
      
      // Set prefetch to control concurrency
      this.channel.prefetch(20); // Handle 20 messages at a time
      
      return true;
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async startConsumers() {
    // Start consumers for each queue
    await this.startTokenGenerationConsumer();
    await this.startLoginConsumer();
    await this.startRegisterConsumer();
    await this.startRefreshTokenConsumer();
  }

  async startTokenGenerationConsumer() {
    this.channel.consume(QUEUES.TOKEN_GENERATION, async (msg) => {
      try {
        const { userId } = JSON.parse(msg.content.toString());
        
        const user = await prisma.user.findUnique({
          where: { id: userId }
        });
        
        if (!user) {
          throw new Error('User not found');
        }
        
        const accessToken = UserTokenService.generateAccessToken(user);
        const refreshToken = UserTokenService.generateRefreshToken(user);
        
        // Update user's refresh token in the database
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: { refreshToken }
          });
        });
        // Send response back to the reply queue
        this.channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify({ accessToken, refreshToken })),
          { correlationId: msg.properties.correlationId }
        );
        
        // Acknowledge the message
        this.channel.ack(msg);
      } catch (error) {
        console.error('Error processing token generation:', error);
        // Send error back to the reply queue
        if (msg.properties.replyTo) {
          this.channel.sendToQueue(
            msg.properties.replyTo,
            Buffer.from(JSON.stringify({ error: error.message })),
            { correlationId: msg.properties.correlationId }
          );
        }
        // Acknowledge the message so it's not requeued
        this.channel.ack(msg);
      }
    });
    
    console.log('Token generation consumer started');
  }

  async startLoginConsumer() {
    this.channel.consume(QUEUES.LOGIN, async (msg) => {
      try {
        const { email, username, password } = JSON.parse(msg.content.toString());
        
        // Find the user
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email },
              { username }
            ]
          }
        });
        
        if (!user) {
          throw new Error('User does not exist');
        }
        
        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
          throw new Error('Invalid user credentials');
        }
        
        // Generate tokens
        const accessToken = UserTokenService.generateAccessToken(user);
        const refreshToken = UserTokenService.generateRefreshToken(user);
        
        // Update user's refresh token
        await prisma.user.update({
          where: { id: user.id },
          data: { refreshToken }
        });
        
        // Get user data without password and refreshToken
        const loggedInUser = {
          id: user.id,
          fullName: user.fullName,
          avatar: user.avatar,
          coverImage: user.coverImage,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        };
        
        // Send response back
        this.channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify({ 
            user: loggedInUser,
            accessToken,
            refreshToken
          })),
          { correlationId: msg.properties.correlationId }
        );
        
        this.channel.ack(msg);
      } catch (error) {
        console.error('Error processing login:', error);
        if (msg.properties.replyTo) {
          this.channel.sendToQueue(
            msg.properties.replyTo,
            Buffer.from(JSON.stringify({ error: error.message })),
            { correlationId: msg.properties.correlationId }
          );
        }
        this.channel.ack(msg);
      }
    });
    
    console.log('Login consumer started');
  }

  async startRegisterConsumer() {
    this.channel.consume(QUEUES.REGISTER, async (msg) => {
      try {
        const userData = JSON.parse(msg.content.toString());
        const { fullName, email, username, password, avatar } = userData;
        
        // Validate required fields
        if ([fullName, email, username, password].some(field => !field || field.trim() === '')) {
          throw new Error('All details are required');
        }
        
        // Check if user exists
        const existedUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email },
              { username }
            ]
          }
        });
        
        if (existedUser) {
          throw new Error('Email or username already exists');
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const user = await prisma.user.create({
          data: {
            fullName,
            email,
            username: username.toLowerCase(),
            password: hashedPassword,
            avatar: avatar || '',
            coverImage: userData.coverImage || '',
          }
        });
        
        // Get user without password
        const createdUser = {
          id: user.id,
          fullName: user.fullName,
          avatar: user.avatar,
          coverImage: user.coverImage,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        };
        
        // Send response back
        this.channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify({ user: createdUser })),
          { correlationId: msg.properties.correlationId }
        );
        
        this.channel.ack(msg);
      } catch (error) {
        console.error('Error processing registration:', error);
        if (msg.properties.replyTo) {
          this.channel.sendToQueue(
            msg.properties.replyTo,
            Buffer.from(JSON.stringify({ error: error.message })),
            { correlationId: msg.properties.correlationId }
          );
        }
        this.channel.ack(msg);
      }
    });
    
    console.log('Registration consumer started');
  }

  async startRefreshTokenConsumer() {
    this.channel.consume(QUEUES.REFRESH_TOKEN, async (msg) => {
      try {
        const { refreshToken } = JSON.parse(msg.content.toString());
        
        // Verify refresh token
        const decodedToken = UserTokenService.verifyRefreshToken(refreshToken);
        
        if (!decodedToken) {
          throw new Error('Invalid refresh token');
        }
        
        // Find user by ID and check if refresh token matches
        const user = await prisma.user.findFirst({
          where: {
            id: decodedToken.id,
            refreshToken
          }
        });
        
        if (!user) {
          throw new Error('Invalid refresh token or user not found');
        }
        
        // Generate new tokens
        const accessToken = UserTokenService.generateAccessToken(user);
        const newRefreshToken = UserTokenService.generateRefreshToken(user);
        
        // Update user's refresh token
        await prisma.user.update({
          where: { id: user.id },
          data: { refreshToken: newRefreshToken }
        });
        
        // Send response back
        this.channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify({ accessToken, refreshToken: newRefreshToken })),
          { correlationId: msg.properties.correlationId }
        );
        
        this.channel.ack(msg);
      } catch (error) {
        console.error('Error processing refresh token:', error);
        if (msg.properties.replyTo) {
          this.channel.sendToQueue(
            msg.properties.replyTo,
            Buffer.from(JSON.stringify({ error: error.message })),
            { correlationId: msg.properties.correlationId }
          );
        }
        this.channel.ack(msg);
      }
    });
    
    console.log('Refresh token consumer started');
  }

  async disconnect() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}

// Create and start the service
const authService = new AuthService();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down auth service...');
  await authService.disconnect();
  process.exit(0);
});

// Start the service
(async () => {
  try {
    await authService.connect();
    await authService.startConsumers();
    console.log('Auth service is running');
  } catch (error) {
    console.error('Failed to start auth service:', error);
    process.exit(1);
  }
})();

export default authService;