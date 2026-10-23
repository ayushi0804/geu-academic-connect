import { Schema, model } from 'mongoose';
const OID = Schema.Types.ObjectId;
const T = { timestamps: true };

export const Department = model<any>(
  'Department',
  new Schema(
    {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 12 },
      description: { type: String, maxlength: 500 },
    },
    T,
  ),
);

export const Program = model<any>(
  'Program',
  new Schema(
    {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 16 },
      department: { type: OID, ref: 'Department', required: true, index: true },
      durationSemesters: { type: Number, min: 1, max: 12, default: 8 },
    },
    T,
  ),
);

export const AcademicYear = model<any>(
  'AcademicYear',
  new Schema(
    {
      label: { type: String, required: true, unique: true, trim: true }, // e.g. 2025-26
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      isCurrent: { type: Boolean, default: false },
    },
    T,
  ),
);

const semesterSchema = new Schema(
  {
    academicYear: { type: OID, ref: 'AcademicYear', required: true },
    number: { type: Number, min: 1, max: 12, required: true },
    name: { type: String, trim: true, maxlength: 60 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
  },
  T,
);
semesterSchema.index({ academicYear: 1, number: 1 }, { unique: true });
export const Semester = model<any>('Semester', semesterSchema);

export const Subject = model<any>(
  'Subject',
  new Schema(
    {
      code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 16 },
      name: { type: String, required: true, trim: true, maxlength: 140 },
      credits: { type: Number, required: true, min: 1, max: 12 },
      department: { type: OID, ref: 'Department', required: true, index: true },
      program: { type: OID, ref: 'Program' },
      semester: { type: Number, min: 1, max: 12, required: true },
      type: { type: String, enum: ['theory', 'lab', 'elective'], default: 'theory' },
    },
    T,
  ),
);

const faSchema = new Schema(
  {
    subject: { type: OID, ref: 'Subject', required: true },
    faculty: { type: OID, ref: 'User', required: true, index: true },
    section: { type: String, required: true, trim: true, default: 'A' },
    academicYear: { type: OID, ref: 'AcademicYear', required: true },
  },
  T,
);
faSchema.index({ subject: 1, section: 1, academicYear: 1 }, { unique: true });
export const FacultyAssignment = model<any>('FacultyAssignment', faSchema);

const enrSchema = new Schema(
  {
    student: { type: OID, ref: 'User', required: true },
    subject: { type: OID, ref: 'Subject', required: true, index: true },
    academicYear: { type: OID, ref: 'AcademicYear', required: true },
    status: { type: String, enum: ['active', 'dropped', 'completed'], default: 'active' },
  },
  T,
);
enrSchema.index({ student: 1, subject: 1, academicYear: 1 }, { unique: true });
export const Enrollment = model<any>('Enrollment', enrSchema);

export const AcademicEvent = model<any>(
  'AcademicEvent',
  new Schema(
    {
      title: { type: String, required: true, trim: true, maxlength: 160 },
      type: { type: String, enum: ['exam', 'holiday', 'event', 'deadline'], default: 'event' },
      startDate: { type: Date, required: true, index: true },
      endDate: { type: Date },
      description: { type: String, maxlength: 1000 },
      department: { type: OID, ref: 'Department' }, // empty => university-wide
    },
    T,
  ),
);

const ttSchema = new Schema(
  {
    subject: { type: OID, ref: 'Subject', required: true },
    faculty: { type: OID, ref: 'User', required: true, index: true },
    section: { type: String, required: true, trim: true },
    room: { type: String, required: true, trim: true, maxlength: 30 },
    dayOfWeek: { type: Number, min: 1, max: 7, required: true }, // 1 = Monday
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    semester: { type: Number, min: 1, max: 12 },
  },
  T,
);
ttSchema.index({ dayOfWeek: 1, section: 1 });
export const Timetable = model<any>('Timetable', ttSchema);
