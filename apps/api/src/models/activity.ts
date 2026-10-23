import { Schema, model } from 'mongoose';
const OID = Schema.Types.ObjectId;
const T = { timestamps: true };

const attSchema = new Schema(
  {
    subject: { type: OID, ref: 'Subject', required: true },
    student: { type: OID, ref: 'User', required: true },
    section: { type: String, required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, enum: ['present', 'absent', 'late', 'leave'], required: true },
    markedBy: { type: OID, ref: 'User', required: true },
    history: [{ _id: false, by: { type: OID, ref: 'User' }, at: Date, from: String, to: String }],
  },
  T,
);
attSchema.index({ subject: 1, student: 1, date: 1 }, { unique: true });
attSchema.index({ student: 1, date: -1 });
attSchema.index({ subject: 1, section: 1, date: 1 });
export const Attendance = model<any>('Attendance', attSchema);

export const UploadedFile = model<any>(
  'UploadedFile',
  new Schema(
    {
      originalName: { type: String, required: true },
      storedName: { type: String, required: true, unique: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
      owner: { type: OID, ref: 'User', required: true, index: true },
      purpose: { type: String, enum: ['avatar', 'assignment', 'submission', 'material', 'notice', 'resume'], required: true },
      subject: { type: OID, ref: 'Subject' },
      attached: { type: Boolean, default: false },
    },
    T,
  ),
);

const asgSchema = new Schema(
  {
    subject: { type: OID, ref: 'Subject', required: true, index: true },
    section: { type: String, trim: true }, // empty => all sections
    title: { type: String, required: true, trim: true, maxlength: 160 },
    instructions: { type: String, maxlength: 5000 },
    attachments: [{ type: OID, ref: 'UploadedFile' }],
    dueDate: { type: Date, required: true, index: true },
    maxMarks: { type: Number, required: true, min: 1, max: 1000, default: 10 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    allowLate: { type: Boolean, default: false },
    allowResubmission: { type: Boolean, default: true },
    createdBy: { type: OID, ref: 'User', required: true },
  },
  T,
);
export const Assignment = model<any>('Assignment', asgSchema);

const subSchema = new Schema(
  {
    assignment: { type: OID, ref: 'Assignment', required: true },
    student: { type: OID, ref: 'User', required: true },
    file: { type: OID, ref: 'UploadedFile', required: true },
    comment: { type: String, maxlength: 1000 },
    submittedAt: { type: Date, required: true },
    isLate: { type: Boolean, default: false },
    attempts: { type: Number, default: 1 },
    status: { type: String, enum: ['submitted', 'graded'], default: 'submitted' },
    marks: { type: Number, min: 0 },
    feedback: { type: String, maxlength: 2000 },
    gradedBy: { type: OID, ref: 'User' },
    gradedAt: Date,
  },
  T,
);
subSchema.index({ assignment: 1, student: 1 }, { unique: true });
subSchema.index({ student: 1, submittedAt: -1 });
export const Submission = model<any>('Submission', subSchema);

export const LearningMaterial = model<any>(
  'LearningMaterial',
  new Schema(
    {
      subject: { type: OID, ref: 'Subject', required: true, index: true },
      title: { type: String, required: true, trim: true, maxlength: 160 },
      description: { type: String, maxlength: 1000 },
      category: { type: String, enum: ['lecture', 'notes', 'reference', 'lab', 'previous-paper', 'other'], default: 'lecture' },
      file: { type: OID, ref: 'UploadedFile', required: true },
      uploadedBy: { type: OID, ref: 'User', required: true },
    },
    T,
  ),
);

const assessSchema = new Schema(
  {
    subject: { type: OID, ref: 'Subject', required: true, index: true },
    academicYear: { type: OID, ref: 'AcademicYear', required: true },
    section: { type: String, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ['internal', 'assignment', 'quiz', 'exam'], required: true },
    maxMarks: { type: Number, required: true, min: 1, max: 1000 },
    weightage: { type: Number, required: true, min: 0, max: 100 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    publishedAt: Date,
    createdBy: { type: OID, ref: 'User', required: true },
  },
  T,
);
export const Assessment = model<any>('Assessment', assessSchema);

const resSchema = new Schema(
  {
    assessment: { type: OID, ref: 'Assessment', required: true },
    subject: { type: OID, ref: 'Subject', required: true }, // denormalised from assessment (immutable)
    student: { type: OID, ref: 'User', required: true },
    marks: { type: Number, required: true, min: 0 },
    remarks: { type: String, maxlength: 300 },
    history: [{ _id: false, by: { type: OID, ref: 'User' }, at: Date, from: Number, to: Number }],
    enteredBy: { type: OID, ref: 'User' },
  },
  T,
);
resSchema.index({ assessment: 1, student: 1 }, { unique: true });
resSchema.index({ student: 1, subject: 1 });
export const Result = model<any>('Result', resSchema);

const noticeSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 10000 },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    pinned: { type: Boolean, default: false },
    publishAt: { type: Date, default: Date.now },
    expiresAt: Date,
    audience: {
      roles: [{ type: String, enum: ['student', 'faculty', 'admin', 'placement'] }],
      departments: [{ type: OID, ref: 'Department' }],
      semesters: [{ type: Number }],
      sections: [{ type: String }],
    },
    attachments: [{ type: OID, ref: 'UploadedFile' }],
    readBy: [{ type: OID, ref: 'User' }],
    notifiedAt: Date,
    createdBy: { type: OID, ref: 'User', required: true },
  },
  T,
);
noticeSchema.index({ status: 1, publishAt: -1 });
export const Notice = model<any>('Notice', noticeSchema);

const notifSchema = new Schema(
  {
    user: { type: OID, ref: 'User', required: true },
    type: { type: String, enum: ['assignment', 'notice', 'marks', 'attendance', 'timetable', 'placement', 'system'], required: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, maxlength: 500 },
    link: { type: String, maxlength: 200 },
    read: { type: Boolean, default: false },
    dedupeKey: String,
  },
  T,
);
notifSchema.index({ user: 1, read: 1, createdAt: -1 });
notifSchema.index({ user: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
export const Notification = model<any>('Notification', notifSchema);

export const AuditLog = model<any>(
  'AuditLog',
  new Schema(
    {
      actor: { type: OID, ref: 'User', index: true },
      actorEmail: String,
      action: { type: String, required: true, index: true },
      resourceType: { type: String, index: true },
      resourceId: String,
      metadata: Schema.Types.Mixed,
      ip: String,
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  ),
);

export const AppSettings = model<any>(
  'AppSettings',
  new Schema(
    {
      key: { type: String, default: 'app', unique: true },
      attendanceThreshold: { type: Number, default: 75, min: 0, max: 100 },
      lateWeight: { type: Number, default: 0.5, min: 0, max: 1 }, // fraction of a present counted for "late"
      attendanceEditWindowDays: { type: Number, default: 7, min: 0, max: 365 },
      gradingPolicy: {
        type: [{ _id: false, min: Number, grade: String, points: Number }],
        default: () => [
          { min: 90, grade: 'O', points: 10 },
          { min: 80, grade: 'A+', points: 9 },
          { min: 70, grade: 'A', points: 8 },
          { min: 60, grade: 'B+', points: 7 },
          { min: 50, grade: 'B', points: 6 },
          { min: 40, grade: 'C', points: 5 },
          { min: 0, grade: 'F', points: 0 },
        ],
      },
      currentAcademicYear: { type: OID, ref: 'AcademicYear' },
      seedVersion: Number,
    },
    T,
  ),
);
