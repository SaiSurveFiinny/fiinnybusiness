import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import {
  isCaseStudyPubliclyVisible,
  isStoryPubliclyVisible,
  type BeforeAfterCase,
  type CaseStudy,
  type CropResult,
  type FarmerStory,
  type FarmerVideo,
  type Testimonial,
} from '../data/farmerSuccess';

/**
 * Shared read hook for all public Farmer Success pages (landing, story
 * detail, case study detail, video library) — mirrors
 * hooks/useCareerData.ts exactly. Only published (and, for stories/case
 * studies, publish-date-elapsed) items are exposed here; drafts remain
 * visible in the Admin FarmerSuccessManager, which reads each collection
 * directly, unfiltered.
 */
export function useFarmerSuccessData() {
  const [stories, setStories] = useState<FarmerStory[]>([]);
  const [videos, setVideos] = useState<FarmerVideo[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [beforeAfterCases, setBeforeAfterCases] = useState<BeforeAfterCase[]>([]);
  const [cropResults, setCropResults] = useState<CropResult[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loaded: Record<string, boolean> = {};
    const checkLoaded = (key: string) => {
      loaded[key] = true;
      if (['stories', 'videos', 'testimonials', 'beforeAfter', 'cropResults', 'caseStudies'].every((k) => loaded[k])) {
        setIsLoading(false);
      }
    };

    const unsubscribeStories = onSnapshot(collection(db, 'farmerStories'), (snapshot) => {
      setStories(
        snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<FarmerStory, 'id'>) }))
          .filter(isStoryPubliclyVisible),
      );
      checkLoaded('stories');
    });

    const unsubscribeVideos = onSnapshot(collection(db, 'farmerVideos'), (snapshot) => {
      setVideos(
        snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<FarmerVideo, 'id'>) }))
          .filter((v) => v.published),
      );
      checkLoaded('videos');
    });

    const unsubscribeTestimonials = onSnapshot(query(collection(db, 'testimonials'), orderBy('order', 'asc')), (snapshot) => {
      setTestimonials(
        snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<Testimonial, 'id'>) }))
          .filter((t) => t.published),
      );
      checkLoaded('testimonials');
    });

    const unsubscribeBeforeAfter = onSnapshot(query(collection(db, 'beforeAfterCases'), orderBy('order', 'asc')), (snapshot) => {
      setBeforeAfterCases(
        snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<BeforeAfterCase, 'id'>) }))
          .filter((c) => c.published),
      );
      checkLoaded('beforeAfter');
    });

    const unsubscribeCropResults = onSnapshot(query(collection(db, 'cropResults'), orderBy('order', 'asc')), (snapshot) => {
      setCropResults(
        snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<CropResult, 'id'>) }))
          .filter((r) => r.published),
      );
      checkLoaded('cropResults');
    });

    const unsubscribeCaseStudies = onSnapshot(collection(db, 'caseStudies'), (snapshot) => {
      setCaseStudies(
        snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<CaseStudy, 'id'>) }))
          .filter(isCaseStudyPubliclyVisible),
      );
      checkLoaded('caseStudies');
    });

    return () => {
      unsubscribeStories();
      unsubscribeVideos();
      unsubscribeTestimonials();
      unsubscribeBeforeAfter();
      unsubscribeCropResults();
      unsubscribeCaseStudies();
    };
  }, []);

  return { stories, videos, testimonials, beforeAfterCases, cropResults, caseStudies, isLoading };
}
