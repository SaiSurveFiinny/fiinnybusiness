import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { isJobPubliclyVisible, type Department, type Job } from '../data/career';

/**
 * Shared read hook for the public Career pages (landing, job detail) —
 * mirrors hooks/useCropSolutions.ts exactly. Only jobs that are published
 * AND past their publishAt time are exposed here; draft/closed/archived and
 * not-yet-scheduled jobs remain visible in the Admin CareerManager (which
 * reads the same collection directly, unfiltered).
 */
export function useCareerData() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let departmentsLoaded = false;
    let jobsLoaded = false;
    const checkLoaded = () => {
      if (departmentsLoaded && jobsLoaded) setIsLoading(false);
    };

    const unsubscribeDepartments = onSnapshot(query(collection(db, 'departments'), orderBy('order', 'asc')), (snapshot) => {
      setDepartments(snapshot.docs.map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<Department, 'id'>) })));
      departmentsLoaded = true;
      checkLoaded();
    });

    const unsubscribeJobs = onSnapshot(collection(db, 'jobs'), (snapshot) => {
      setJobs(
        snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<Job, 'id'>) }))
          .filter(isJobPubliclyVisible),
      );
      jobsLoaded = true;
      checkLoaded();
    });

    return () => {
      unsubscribeDepartments();
      unsubscribeJobs();
    };
  }, []);

  return { departments, jobs, isLoading };
}
