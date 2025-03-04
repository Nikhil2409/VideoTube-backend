import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const userSchema = new Schema(
  {
    username: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    avatar: {
      type: String, // cloudinary url
      required: true,
    },
    coverImage: {
      type: String, // cloudinary url
    },
    watchHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

//using the pre hook to trigger the event before saving.
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); //skip the rest if no modification.
  this.password = await bcrypt.hash(this.password, 10); //this refers to that particular object, 10 signifies number of rounds.
  next(); //pass it on to next hook, standard procedure
});

//defining a method which is part of the schema as well.
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password); //bcrypt does the comparison on its own, await is necessary as it takes time.
};

export const User = mongoose.model("User", userSchema);