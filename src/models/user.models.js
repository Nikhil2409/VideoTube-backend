/*
users [icon: user] {
  id string pk
  username string
  email string
  fullName string
  avatar string
  coverImage string
  watchHistory ObjectId[] videos
  password string
  refreshToken string
  createdAt Date
  updatedAt Date
}
 */

import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true, //all extra spaces are removed
      index: true, //indexing is done
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
        ref: "Video", //referencing what u export in the other model, not the file name neither the schema
      },
    ],
    password: {
      type: String,
      required: [true, "Password is required"], // controlling the error message
    },
    refreshToken: {
      type: String,
    },
  },
  //another object is made.
  {
    timestamps: true, // this gives the the db the data of createdAt and updatedAt
  }
);

export const User = mongoose.model("User", userSchema);
