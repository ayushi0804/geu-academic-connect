export type Role = 'student' | 'faculty' | 'admin' | 'placement';
export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  name: string;
  department?: string;
  semester?: number;
  section?: string;
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
