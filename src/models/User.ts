import { Schema, model, models, Model, Types } from 'mongoose';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  image?: string;
  googleId: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    image: { type: String },
    googleId: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

export const User: Model<IUser> = models.User || model<IUser>('User', UserSchema);

