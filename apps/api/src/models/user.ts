import { Schema, model } from 'mongoose';

export const ROLES = ['student', 'faculty', 'admin', 'placement'] as const;
const OID = Schema.Types.ObjectId;

const prefs = {
  assignment: { type: Boolean, default: true },
  notice: { type: Boolean, default: true },
  marks: { type: Boolean, default: true },
  attendance: { type: Boolean, default: true },
  timetable: { type: Boolean, default: true },
  placement: { type: Boolean, default: true },
  email: { type: Boolean, default: false },
};

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    status: { type: String, enum: ['invited', 'active', 'inactive'], default: 'invited', index: true },
    idNumber: { type: String, trim: true, maxlength: 40 }, // student ID or faculty ID
    department: { type: OID, ref: 'Department', index: true },
    program: { type: OID, ref: 'Program' },
    academicYear: { type: OID, ref: 'AcademicYear' },
    semester: { type: Number, min: 1, max: 12 },
    section: { type: String, trim: true, maxlength: 10 },
    designation: { type: String, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 20 },
    photo: { type: OID, ref: 'UploadedFile' },
    tokenVersion: { type: Number, default: 0, select: false },
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    lastLoginAt: Date,
    notificationPrefs: { type: new Schema(prefs, { _id: false }), default: () => ({}) },
  },
  { timestamps: true },
);
userSchema.index({ idNumber: 1 }, { unique: true, partialFilterExpression: { idNumber: { $type: 'string' } } });
userSchema.index({ role: 1, department: 1, semester: 1, section: 1 });

export const User = model<any>('User', userSchema);

const tokenSchema = new Schema(
  {
    user: { type: OID, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ['reset', 'invite'], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true },
);
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 * 7 });
export const PasswordResetToken = model<any>('PasswordResetToken', tokenSchema);
