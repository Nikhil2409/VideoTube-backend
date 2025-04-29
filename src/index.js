import express from "express";
import logger from "./logger.js";
import morgan from "morgan";
import { httpServer, app } from "./app.js";
import dotenv from "dotenv";
import connectDB from "./db/index.js";
dotenv.config({ path: "./src/.env" });
import authClient from "./workers/authClient.js";

const morganFormat = ":method :url :status :response-time ms";

const port = process.env.PORT || 3900;

app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => {
        const logObject = {
          method: message.split(" ")[0],
          url: message.split(" ")[1],
          status: message.split(" ")[2],
          responseTime: message.split(" ")[3],
        };
        logger.info(JSON.stringify(logObject));
      },
    },
  })
);

connectDB()
  .then(() => {
    httpServer.listen(port, () => {
      const deployedUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
      console.log(`🚀 Server is running at: ${deployedUrl}`);
      console.log(`📡 Listening on port: ${port}`);
      console.log(`🧩 Socket.IO server is ready for connections`);
    });
  });
