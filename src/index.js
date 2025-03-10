import express from "express";
import logger from "./logger.js";
import morgan from "morgan";
import { httpServer, app } from "./app.js";
import dotenv from "dotenv";
import connectDB from "./db/index.js";
dotenv.config({ path: "./src/.env" });

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
    // Use httpServer instead of app.listen
    httpServer.listen(port, () => {
      console.log(`Server is running at port number ${port}`);
      console.log(`Socket.IO server is ready for connections`);
    });
  })
  .catch((err) => {
    console.log("MongoDB connection error", err);
  });