import amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUES = {
  TOKEN_GENERATION: 'auth.token.generation',
  LOGIN: 'auth.login',
  REGISTER: 'auth.register',
  REFRESH_TOKEN: 'auth.refresh.token'
};

class AuthClient {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.responseQueue = null;
    this.callbacks = {};
  }

  async connect() {
    try {
      console.log("[AuthClient] Connecting to RabbitMQ...");
      this.connection = await amqp.connect(RABBITMQ_URL);
      this.channel = await this.connection.createChannel();

      // Create a response queue with a unique name
      const queueResponse = await this.channel.assertQueue('', { exclusive: true });
      this.responseQueue = queueResponse.queue;

      // Set up the response queue consumer
      this.channel.consume(this.responseQueue, (msg) => {
        const correlationId = msg.properties.correlationId;
        const callback = this.callbacks[correlationId];

        if (callback) {
          console.log(`[AuthClient] Received response for correlationId: ${correlationId}`);
          const content = JSON.parse(msg.content.toString());
          callback(content);
          delete this.callbacks[correlationId]; // Cleanup
        }
      }, { noAck: true });

      console.log("[AuthClient] Connected to RabbitMQ and listening for responses.");
    } catch (error) {
      console.error("[AuthClient] Failed to connect to RabbitMQ:", error);
      throw error;
    }
  }

// Enhanced error handling and logging
async sendRequest(queue, message) {
  return new Promise((resolve, reject) => {
    const correlationId = uuidv4();
    const timeout = setTimeout(() => {
      delete this.callbacks[correlationId];
      reject(new Error(`Request timeout for correlationId: ${correlationId}`));
    }, 10000); // 10-second timeout

    this.callbacks[correlationId] = (response) => {
      clearTimeout(timeout);
      
      if (response.error) {
        console.error(`[AuthClient] Detailed error for correlationId ${correlationId}:`, response.error);
        reject(new Error(response.error));
      } else {
        console.log(`[AuthClient] Full response for correlationId ${correlationId}:`, response);
        resolve(response);
      }
    };

    try {
      this.channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        {
          correlationId,
          replyTo: this.responseQueue,
          persistent: true
        }
      );
    } catch (sendError) {
      clearTimeout(timeout);
      console.error('[AuthClient] Message send error:', sendError);
      reject(sendError);
    }
  });
}

  async generateTokens(userId) {
    console.log(`[AuthClient] Generating tokens for userId: ${userId}`);
    return this.sendRequest(QUEUES.TOKEN_GENERATION, { userId });
  }

  async login(credentials) {
    console.log(`[AuthClient] Processing login for user: ${credentials.username || credentials.email}`);
    return this.sendRequest(QUEUES.LOGIN, credentials);
  }

  async register(userData) {
    console.log(`[AuthClient] Processing registration for user: ${userData.username}`);
    return this.sendRequest(QUEUES.REGISTER, userData);
  }

  async refreshToken(refreshToken) {
    console.log("[AuthClient] Processing refresh token request");
    return this.sendRequest(QUEUES.REFRESH_TOKEN, { refreshToken });
  }

  async disconnect() {
    console.log("[AuthClient] Disconnecting from RabbitMQ...");
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    console.log("[AuthClient] Disconnected.");
  }
}

// Create a singleton instance
const authClient = new AuthClient();

// Initialize the connection
(async () => {
  try {
    await authClient.connect();
    console.log('[AuthClient] Successfully connected to RabbitMQ');
  } catch (error) {
    console.error('[AuthClient] Failed to connect to RabbitMQ:', error);
  }
})();

export default authClient;
