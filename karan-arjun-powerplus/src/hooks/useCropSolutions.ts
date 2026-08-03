import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import type { CropCategory, CropSolution } from '../data/cropSolutions';

/**
 * Shared read hook for the public Crop Solutions pages (landing, category,
 * detail) — one Firestore subscription per collection, reused across all
 * three pages rather than each re-subscribing independently. Only published
 * categories/crops are exposed here; unpublished ones remain visible in the
 * Admin manager (which reads the same collections directly, unfiltered).
 */
export function useCropSolutions() {
  const [categories, setCategories] = useState<CropCategory[]>([]);
  const [crops, setCrops] = useState<CropSolution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let categoriesLoaded = false;
    let cropsLoaded = false;
    const checkLoaded = () => {
      if (categoriesLoaded && cropsLoaded) setIsLoading(false);
    };

    const unsubscribeCategories = onSnapshot(query(collection(db, 'cropCategories'), orderBy('order', 'asc')), (snapshot) => {
      setCategories(
        snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<CropCategory, 'id'>) }))
          .filter((c) => c.published),
      );
      categoriesLoaded = true;
      checkLoaded();
    });

    const unsubscribeCrops = onSnapshot(collection(db, 'crops'), (snapshot) => {
      setCrops(
        snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<CropSolution, 'id'>) }))
          .filter((c) => c.published),
      );
      cropsLoaded = true;
      checkLoaded();
    });

    return () => {
      unsubscribeCategories();
      unsubscribeCrops();
    };
  }, []);

  return { categories, crops, isLoading };
}
