import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import { createServer } from "http"
import { Server } from "socket.io"
import cron from "node-cron"
import { flushVideoViewCountsToDB, flushTweetViewCountsToDB } from "./utils/dbUpdates.js"
import { SQSClient, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import dotenv from "dotenv";

// Fix dotenv loading
dotenv.config();

// Initialize Express app
const app = express()

// Create HTTP server using the Express app
const httpServer = createServer(app)

// Get allowed origins from environment or use defaults
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3900").split(',');
console.log("Allowed CORS origins:", allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // Check if the origin is in our allowedOrigins list
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.log("Blocked origin:", origin, "Allowed origins:", allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // CRITICAL: This allows cookies to be sent and received
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin', 
    'Access-Control-Request-Method', 
    'Access-Control-Request-Headers',
    'x-access-token',
    'Cache-Control',
    'Pragma',
    'Expires'
  ],
  exposedHeaders: ['Content-Length', 'X-Total-Count', 'Content-Range']
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Initialize Socket.IO with the HTTP server
const io = new Server(httpServer, {
  cors: corsOptions
})

cron.schedule('*/1 * * * *', async () => {
  //console.log('Running scheduled view count flush to database...');
  await flushVideoViewCountsToDB();
  //console.log('Running scheduled tweet view count flush to database...');
  await flushTweetViewCountsToDB();
});

app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))
app.use(cookieParser())

// Special route to handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Routes import
import userRouter from './routes/user.routes.js'
import healthcheckRouter from "./routes/healthcheck.routes.js"
import tweetRouter from "./routes/tweet.routes.js"
import subscriptionRouter from "./routes/subscription.routes.js"
import videoRouter from "./routes/video.routes.js"
import commentRouter from "./routes/comment.routes.js"
import likeRouter from "./routes/like.routes.js"
import playlistRouter from "./routes/playlist.routes.js"
import dashboardRouter from "./routes/dashboard.routes.js"

// Routes declaration
app.use("/api/v1/healthcheck", healthcheckRouter)
app.use("/api/v1/users", userRouter)
app.use("/api/v1/tweets", tweetRouter)
app.use("/api/v1/subscriptions", subscriptionRouter)
app.use("/api/v1/videos", videoRouter)
app.use("/api/v1/comments", commentRouter)
app.use("/api/v1/likes", likeRouter)
app.use("/api/v1/playlist", playlistRouter)
app.use("/api/v1/dashboard", dashboardRouter)

// Make sure the QUEUE_URL is defined before using it
const QUEUE_URL = process.env.QUEUE_URL;

app.get('/api/v1/queue-status', async (req, res) => {
  try {
    if (!QUEUE_URL) {
      return res.status(500).json({ error: "Queue URL not configured" });
    }
    
    const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const { Attributes } = await sqsClient.send(new GetQueueAttributesCommand({
      QueueUrl: QUEUE_URL,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
    }));
    
    res.json({
      messagesAvailable: parseInt(Attributes.ApproximateNumberOfMessages),
      messagesInFlight: parseInt(Attributes.ApproximateNumberOfMessagesNotVisible),
      queueUrl: QUEUE_URL.split('/').pop() // Just the queue name for security
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track users and their rooms
const onlineUsers = new Map(); // userId -> {username, socketId, currentRoom}
const roomMembers = new Map(); // roomId -> Set of userIds

// Socket.IO event handlers
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id)
  
  // Store user information when they connect
  const userId = socket.handshake.query.userId || socket.id;
  const username = socket.handshake.query.username || "User";
  const initialRoom = socket.handshake.query.currentRoom || null;
  
  // Store user in our tracking map
  onlineUsers.set(userId, { socketId: socket.id, username, currentRoom: null });
  
  // If user specified an initial room, join them to it
  if (initialRoom) {
    joinUserToRoom(userId, initialRoom);
  }
  
  // Broadcast updated online users list to all connected clients
  broadcastOnlineUsers();
  
  // Handle public room events
  socket.on("join-room", (roomId) => {
    // Normalize room ID to prevent case sensitivity issues
    const normalizedRoomId = roomId.toLowerCase();
    
    socket.join(normalizedRoomId);
    console.log(`User ${socket.id} (${username}) joined room: ${normalizedRoomId}`);
    
    // Update room membership
    joinUserToRoom(userId, normalizedRoomId);
    
    // Broadcast to everyone in the room that a new user has joined
    io.to(normalizedRoomId).emit("user-joined", {
      userId: userId,
      username: username,
      roomId: normalizedRoomId,
      timestamp: new Date().toISOString()
    });
    
    // Send updated room count to all clients in the room
    broadcastRoomCount(normalizedRoomId);
  });
  
  socket.on("leave-room", (roomId) => {
    // Normalize room ID
    const normalizedRoomId = roomId.toLowerCase();
    
    socket.leave(normalizedRoomId);
    console.log(`User ${socket.id} (${username}) left room: ${normalizedRoomId}`);
    
    // Update room membership
    removeUserFromRoom(userId, normalizedRoomId);
    
    // Broadcast to everyone in the room that a user has left
    io.to(normalizedRoomId).emit("user-left", {
      userId: userId,
      username: username,
      roomId: normalizedRoomId,
      timestamp: new Date().toISOString()
    });
    
    // Send updated room count to all clients in the room
    broadcastRoomCount(normalizedRoomId);
  });
  
  socket.on("send-message", (data) => {
    // If roomId provided, broadcast to room
    if (data.roomId) {
      const normalizedRoomId = data.roomId.toLowerCase();
      
      socket.to(normalizedRoomId).emit("receive-message", {
        content: data.content,
        senderId: data.senderId,
        senderName: data.senderName,
        timestamp: new Date(),
        roomId: normalizedRoomId
      });
    } else {
      // Broadcast to all clients except sender
      socket.broadcast.emit("receive-message", {
        content: data.content,
        senderId: data.senderId,
        senderName: data.senderName,
        timestamp: new Date()
      });
    }
  });
  
  // Private messages
  socket.on("private-message", (data) => {
    const { receiverId, content, senderId, senderName } = data;
    const receiverData = onlineUsers.get(receiverId);
    
    if (receiverData) {
      // Send to specific user's socket
      io.to(receiverData.socketId).emit("private-message", {
        content,
        senderId,
        senderName,
        timestamp: new Date(),
        isPrivate: true
      });
      
      // Also send confirmation to sender
      socket.emit("private-message-delivered", {
        receiverId,
        receiverName: receiverData.username,
        messageId: data.messageId, // If provided by client for tracking
        timestamp: new Date()
      });
    } else {
      // Receiver is offline, notify sender
      socket.emit("private-message-failed", {
        receiverId,
        messageId: data.messageId,
        reason: "User is offline",
        timestamp: new Date()
      });
    }
  });
  
  // Typing indicators
  socket.on("typing", (data) => {
    if (data.roomId) {
      // Room typing indicator
      const normalizedRoomId = data.roomId.toLowerCase();
      
      socket.to(normalizedRoomId).emit("user-typing", {
        userId: data.userId,
        username: data.username,
        roomId: normalizedRoomId,
        isTyping: data.isTyping
      });
    } else if (data.receiverId) {
      // Private typing indicator
      const receiverData = onlineUsers.get(data.receiverId);
      if (receiverData) {
        io.to(receiverData.socketId).emit("user-typing", {
          userId: data.userId,
          username: data.username,
          isPrivate: true,
          isTyping: data.isTyping
        });
      }
    }
  });
  
  // Send online users list to requesting client
  socket.on("get-online-users", () => {
    socket.emit("online-users", getOnlineUsersArray());
  });
  
  // Handle client requests for room count
  socket.on("get-room-count", (roomId) => {
    const normalizedRoomId = roomId.toLowerCase();
    const count = getRoomMemberCount(normalizedRoomId);
    
    socket.emit("room-count", {
      roomId: normalizedRoomId,
      count: count
    });
  });
  
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    
    // Get user data before removing
    const userData = onlineUsers.get(userId);
    const userRoom = userData ? userData.currentRoom : null;
    
    // If the user was in a room, remove them and notify room members
    if (userRoom) {
      removeUserFromRoom(userId, userRoom);
      
      io.to(userRoom).emit("user-left", {
        userId: userId,
        username: username,
        roomId: userRoom,
        timestamp: new Date().toISOString()
      });
      
      // Send updated room count to all clients in the room
      broadcastRoomCount(userRoom);
    }
    
    // Remove user from online users map
    onlineUsers.delete(userId);
    
    // Broadcast updated online users list
    broadcastOnlineUsers();
  });
  
  // HELPER FUNCTIONS
  
  // Add a user to a room and update tracking
  function joinUserToRoom(userId, roomId) {
    // Normalize room ID
    const normalizedRoomId = roomId.toLowerCase();
    
    // Remove user from previous room if any
    const userData = onlineUsers.get(userId);
    if (userData && userData.currentRoom) {
      removeUserFromRoom(userId, userData.currentRoom);
    }
    
    // Update user data with new room
    if (userData) {
      userData.currentRoom = normalizedRoomId;
      onlineUsers.set(userId, userData);
    }
    
    // Add user to room members set
    if (!roomMembers.has(normalizedRoomId)) {
      roomMembers.set(normalizedRoomId, new Set());
    }
    roomMembers.get(normalizedRoomId).add(userId);
    
    // Broadcast updated data
    broadcastOnlineUsers();
    broadcastRoomCount(normalizedRoomId);
    
    console.log(`Room ${normalizedRoomId} now has ${getRoomMemberCount(normalizedRoomId)} members`);
  }
  
  // Remove a user from a room and update tracking
  function removeUserFromRoom(userId, roomId) {
    // Normalize room ID
    const normalizedRoomId = roomId.toLowerCase();
    
    // Update user data to remove room
    const userData = onlineUsers.get(userId);
    if (userData && userData.currentRoom === normalizedRoomId) {
      userData.currentRoom = null;
      onlineUsers.set(userId, userData);
    }
    
    // Remove user from room members set
    if (roomMembers.has(normalizedRoomId)) {
      roomMembers.get(normalizedRoomId).delete(userId);
      
      // Clean up empty rooms
      if (roomMembers.get(normalizedRoomId).size === 0) {
        roomMembers.delete(normalizedRoomId);
      }
    }
    
    // Broadcast updated data
    broadcastOnlineUsers();
    if (roomMembers.has(normalizedRoomId)) {
      broadcastRoomCount(normalizedRoomId);
    }
  }
  
  // Get count of members in a room
  function getRoomMemberCount(roomId) {
    // Normalize room ID
    const normalizedRoomId = roomId.toLowerCase();
    
    return roomMembers.has(normalizedRoomId) 
      ? roomMembers.get(normalizedRoomId).size 
      : 0;
  }
  
  // Send room count to all clients in the room
  function broadcastRoomCount(roomId) {
    // Normalize room ID
    const normalizedRoomId = roomId.toLowerCase();
    
    const count = getRoomMemberCount(normalizedRoomId);
    console.log(`Broadcasting room count for ${normalizedRoomId}: ${count} members`);
    
    io.to(normalizedRoomId).emit("room-count", {
      roomId: normalizedRoomId,
      count: count
    });
  }
  
  // Broadcast online users list to all clients
  function broadcastOnlineUsers() {
    const users = getOnlineUsersArray();
    io.emit("online-users", users);
  }
  
  // Convert online users map to array for clients
  function getOnlineUsersArray() {
    return Array.from(onlineUsers).map(([userId, data]) => ({
      userId,
      username: data.username,
      currentRoom: data.currentRoom
    }));
  }
});

// Export both the app and httpServer
export { app, httpServer, io }