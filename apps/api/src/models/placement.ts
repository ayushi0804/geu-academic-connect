import { Schema, model } from 'mongoose';
const OID = Schema.Types.ObjectId;
const T = { timestamps: true };

export const Company = model<any>(
  'Company',
  new Schema(
    {
      name: { type: String, required: true, unique: true, trim: true, maxlength: 140 },
      industry: { type: String, trim: true, maxlength: 80 },
      website: { type: String, trim: true, maxlength: 200 },
      description: { type: String, maxlength: 2000 },
      location: { type: String, maxlength: 120 },
      recruiters: [{ _id: false, name: String, email: String, phone: String }],
    },
    T,
  ),
);

export const PlacementDrive = model<any>(
  'PlacementDrive',
  new Schema(
    {
      title: { type: String, required: true, trim: true, maxlength: 160 },
      company: { type: OID, ref: 'Company', required: true, index: true },
      date: { type: Date, required: true },
      venue: { type: String, maxlength: 160 },
      description: { type: String, maxlength: 2000 },
      status: { type: String, enum: ['upcoming', 'ongoing', 'completed', 'cancelled'], default: 'upcoming' },
    },
    T,
  ),
);

export const Opportunity = model<any>(
  'Opportunity',
  new Schema(
    {
      company: { type: OID, ref: 'Company', required: true, index: true },
      drive: { type: OID, ref: 'PlacementDrive' },
      title: { type: String, required: true, trim: true, maxlength: 160 },
      kind: { type: String, enum: ['job', 'internship'], required: true },
      description: { type: String, maxlength: 5000 },
      skills: [{ type: String, trim: true }],
      location: { type: String, maxlength: 120 },
      workMode: { type: String, enum: ['onsite', 'remote', 'hybrid'], default: 'onsite' },
      stipendPerMonth: { type: Number, min: 0 },
      packageLpa: { type: Number, min: 0 },
      minCgpa: { type: Number, min: 0, max: 10, default: 0 },
      minSemester: { type: Number, min: 1, max: 12, default: 1 },
      eligibleDepartments: [{ type: OID, ref: 'Department' }], // empty => all
      deadline: { type: Date, required: true },
      status: { type: String, enum: ['draft', 'open', 'closed'], default: 'draft', index: true },
      createdBy: { type: OID, ref: 'User', required: true },
    },
    T,
  ),
);

const appSchema = new Schema(
  {
    opportunity: { type: OID, ref: 'Opportunity', required: true },
    student: { type: OID, ref: 'User', required: true },
    resume: { type: OID, ref: 'UploadedFile', required: true },
    coverNote: { type: String, maxlength: 1500 },
    cgpaAtApply: Number,
    status: { type: String, enum: ['applied', 'shortlisted', 'interview', 'selected', 'rejected', 'withdrawn'], default: 'applied', index: true },
    history: [{ _id: false, status: String, by: { type: OID, ref: 'User' }, at: Date, note: String }],
  },
  T,
);
appSchema.index({ opportunity: 1, student: 1 }, { unique: true });
appSchema.index({ student: 1, createdAt: -1 });
export const Application = model<any>('Application', appSchema);

export const Interview = model<any>(
  'Interview',
  new Schema(
    {
      application: { type: OID, ref: 'Application', required: true, index: true },
      scheduledAt: { type: Date, required: true },
      mode: { type: String, enum: ['online', 'onsite'], default: 'online' },
      locationOrLink: { type: String, maxlength: 300 },
      notes: { type: String, maxlength: 1000 },
      status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
      createdBy: { type: OID, ref: 'User' },
    },
    T,
  ),
);

export const Offer = model<any>(
  'Offer',
  new Schema(
    {
      application: { type: OID, ref: 'Application', required: true, unique: true },
      roleTitle: { type: String, required: true, maxlength: 160 },
      packageLpa: { type: Number, min: 0 },
      stipendPerMonth: { type: Number, min: 0 },
      joiningDate: Date,
      status: { type: String, enum: ['offered', 'accepted', 'declined'], default: 'offered' },
      createdBy: { type: OID, ref: 'User' },
    },
    T,
  ),
);
