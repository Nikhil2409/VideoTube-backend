import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import { createServer } from "http"
import { Server } from "socket.io"

// Initialize Express app
const app = express()

// Create HTTP server using the Express app
const httpServer = createServer(app)

// Initialize Socket.IO with the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST"]
  }
})

// CORS and other middleware setup
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true 
}))
app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))
app.use(cookieParser())

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

// Keep track of online users
const onlineUsers = new Map(); // userId -> {username, socketId}

// Socket.IO event handlers
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id)
  
  // Store user information when they connect
  const userId = socket.handshake.query.userId;
  const username = socket.handshake.query.username || "User";
  
  if (userId) {
    onlineUsers.set(userId, { socketId: socket.id, username });
    
    // Broadcast updated online users list to all connected clients
    broadcastOnlineUsers();
  }
  
  // Handle public room events
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
    
    // Broadcast to everyone in the room that a new user has joined
    io.to(roomId).emit("user-joined", {
      userId: userId || socket.id,
      username: username,
      roomId: roomId,
      timestamp: new Date().toISOString()
    });
  });
  
  socket.on("leave-room", (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room: ${roomId}`);
    
    // Broadcast to everyone in the room that a user has left
    io.to(roomId).emit("user-left", {
      userId: userId || socket.id,
      username: username,
      roomId: roomId,
      timestamp: new Date().toISOString()
    });
  });
  
  socket.on("send-message", (data) => {
    // Broadcast to specific room if roomId is provided
    if (data.roomId) {
      socket.to(data.roomId).emit("receive-message", {
        content: data.content,
        senderId: data.senderId,
        senderName: data.senderName,
        timestamp: new Date(),
        roomId: data.roomId
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
  
  // New event handler for private messages
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
  
  // Updated typing event to handle both room and private typing indicators
  socket.on("typing", (data) => {
    if (data.roomId) {
      // Room typing indicator
      socket.to(data.roomId).emit("user-typing", {
        userId: data.userId,
        username: data.username,
        roomId: data.roomId,
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
  
  // Handle client requests for online users list
  socket.on("get-online-users", () => {
    socket.emit("online-users", getOnlineUsersArray());
  });
  
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    
    // Remove user from online users map
    if (userId) {
      onlineUsers.delete(userId);
      
      // Broadcast updated online users list
      broadcastOnlineUsers();
    }
  });
  
  // Helper function to broadcast online users to all clients
  function broadcastOnlineUsers() {
    io.emit("online-users", getOnlineUsersArray());
  }
  
  // Helper function to convert Map to array of user objects
  function getOnlineUsersArray() {
    return Array.from(onlineUsers).map(([userId, data]) => ({
      userId,
      username: data.username
    }));
  }
});

// Export both the app and httpServer
export { app, httpServer, io }