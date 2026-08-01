/**
 * Career module domain types. Three flat top-level Firestore collections —
 * no nesting, matching this project's established pattern (see
 * data/cropSolutions.ts for the precedent this follows):
 *
 *  - departments: simple list, admin-managed, mirrors cropCategories.
 *  - jobs: one document per posting. Responsibilities/requirements/
 *    qualifications/benefits are plain string arrays (not repeatable
 *    objects-with-their-own-fields like crop problems), so they live as
 *    simple fields on the job document, not a nested array-of-objects.
 *  - applications: one document per submission, referencing jobId. Kept
 *    separate from `jobs` (never embedded) because applications are
 *    queried independently (admin's applicant list spans all jobs) and
 *    contain personal applicant data that needs stricter access rules
 *    than job postings.
 */

export type JobStatus = 'draft' | 'published' | 'closed' | 'archived';
export type EmploymentType = 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
export type ApplicationStatus =
  | 'New'
  | 'Reviewing'
  | 'Shortlisted'
  | 'Interview Scheduled'
  | 'Selected'
  | 'Rejected'
  | 'Hired';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'New', 'Reviewing', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected', 'Hired',
];

export interface Department {
  id: string;
  name: string;
  slug: string;
  image: string;
  order: number;
}

export interface JobSeo {
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  ogImage: string;
}

export interface Job {
  id: string;
  title: string;
  slug: string;
  departmentId: string;
  employmentType: EmploymentType;
  experience: string;
  location: string;
  salaryMin: string;
  salaryMax: string;
  showSalary: boolean;
  status: JobStatus;
  /** Job is only publicly visible once status === 'published' AND publishAt <= now. */
  publishAt: string;
  applicationDeadline: string;
  acceptApplications: boolean;
  featured: boolean;
  urgentHiring: boolean;

  overview: string;
  responsibilities: string[];
  requirements: string[];
  preferredSkills: string[];
  qualifications: string[];
  benefits: string[];

  heroImage: string;
  departmentImage: string;
  attachments: string[];

  seo: JobSeo;

  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ApplicationHistoryEntry {
  status: ApplicationStatus;
  note: string;
  changedAt: number;
}

export interface Application {
  id: string;
  jobId: string;
  jobTitle: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  resumeUrl: string;
  coverLetter: string;
  linkedIn: string;
  portfolio: string;
  status: ApplicationStatus;
  notes: string;
  history: ApplicationHistoryEntry[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const emptyJobSeo: JobSeo = { metaTitle: '', metaDescription: '', keywords: '', ogImage: '' };

export const emptyJob: Omit<Job, 'id'> = {
  title: '',
  slug: '',
  departmentId: '',
  employmentType: 'Full-time',
  experience: '',
  location: '',
  salaryMin: '',
  salaryMax: '',
  showSalary: false,
  status: 'draft',
  publishAt: '',
  applicationDeadline: '',
  acceptApplications: true,
  featured: false,
  urgentHiring: false,
  overview: '',
  responsibilities: [],
  requirements: [],
  preferredSkills: [],
  qualifications: [],
  benefits: [],
  heroImage: '',
  departmentImage: '',
  attachments: [],
  seo: emptyJobSeo,
};

export const initialDepartments: Omit<Department, 'id'>[] = [
  { name: 'Agronomy & R&D', slug: 'agronomy-rd', image: '', order: 0 },
  { name: 'Sales & Field Operations', slug: 'sales-field', image: '', order: 1 },
  { name: 'Production & Manufacturing', slug: 'production', image: '', order: 2 },
  { name: 'Quality Assurance', slug: 'quality', image: '', order: 3 },
  { name: 'Corporate & Administration', slug: 'corporate', image: '', order: 4 },
];

export function isJobPubliclyVisible(job: Job): boolean {
  if (job.status !== 'published') return false;
  if (!job.publishAt) return true;
  return new Date(job.publishAt).getTime() <= Date.now();
}
