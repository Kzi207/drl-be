/**
 * Shared backend domain types.
 */

export interface Student {
  id: string;
  lastName: string;
  firstName: string;
  dob: string;
  classId: string;
  email?: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  description?: string;
}

export interface Subject {
  id: string;
  name: string;
  classId: string;
  credits?: number;
  midtermWeight?: number;
  finalWeight?: number;
  semester?: string;
}

export interface Activity {
  id: string;
  name: string;
  dateTime: string;
  subjectId: string;
  classId: string;
}

export interface AttendanceRecord {
  id: string;
  activityId: string;
  studentId: string;
  timestamp: string;
}

export interface SubjectGrade {
  id: string;
  studentId: string;
  subjectId: string;
  midtermScore?: number;
  finalScore?: number;
}

export type UserRole = 'admin' | 'monitor' | 'student' | 'bch' | 'doankhoa';

export interface User {
  username: string;
  password: string;
  name: string;
  role: UserRole;
  classId?: string;
  email?: string;
}

export type DRLStatus = 'submitted' | 'approved' | 'finalized';
export type DRLStatusInternal = DRLStatus | 'not_submitted'; // Internal tracking

export interface GradingPeriod {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  isDefault?: boolean;
}

export interface DRLScore {
  id: string;
  studentId: string;
  semester: string;
  selfScore: number;
  classScore: number;
  finalScore: number;
  details: unknown;
  status: DRLStatus;
  completedAt?: string | null;
  returnedAt?: string | null;
  updatedAt?: string | null;
}

export interface FileUpload {
  id?: number;
  studentId: string;
  category: string;
  fileName: string;
  filePath: string;
  fileUrl?: string;
}
