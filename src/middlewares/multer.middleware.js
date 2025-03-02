import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure temp folder exists
const tempFolder = "./public/temp";
if (!fs.existsSync(tempFolder)) {
  fs.mkdirSync(tempFolder, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log("Uploading file to temp folder:", file.originalname);
    cb(null, tempFolder);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Multer upload middleware
export const upload = multer({ storage });
