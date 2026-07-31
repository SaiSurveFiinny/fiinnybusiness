import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Icons } from '../Icons';
import { db } from '../../lib/firebase';
import { StoryEditor } from './farmerSuccess/StoryEditor';
import { VideoEditor } from './farmerSuccess/VideoEditor';
import { TestimonialEditor } from './farmerSuccess/TestimonialEditor';
import { BeforeAfterEditor } from './farmerSuccess/BeforeAfterEditor';
import { CropResultEditor } from './farmerSuccess/CropResultEditor';
import { CaseStudyEditor } from './farmerSuccess/CaseStudyEditor';
import type { BeforeAfterCase, CaseStudy, CropResult, FarmerStory, FarmerVideo, Testimonial } from '../../data/farmerSuccess';

type FarmerSuccessSubTab = 'Dashboard' | 'Stories' | 'Videos' | 'Testimonials' | 'Before & After' | 'Crop Results' | 'Case Studies';
const SUB_TABS: FarmerSuccessSubTab[] = ['Dashboard', 'Stories', 'Videos', 'Testimonials', 'Before & After', 'Crop Results', 'Case Studies'];

/** Maps Firestore error codes to actionable admin-facing messages — same pattern established in CareerManager.tsx / CropSolutionsManager.tsx. */
function describeFirestoreError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'permission-denied':
      return 'Permission denied by Firestore security rules. Your account may not have write access to this collection.';
    case 'unavailable':
      return 'Could not reach Firestore. Check your internet connection and try again.';
    case 'unauthenticated':
      return 'Your session has expired. Please sign in again.';
    default:
      return err instanceof Error ? `Could not save: ${err.message}` : 'Could not save. Please try again.';
  }
}

/** Shared row chrome for the four simpler content types (Videos/Testimonials/Before&After/Crop Results) — title, meta line, featured/published toggles, edit, two-click delete. */
function ContentRow({
  title,
  meta,
  featured,
  published,
  onToggleFeatured,
  onTogglePublished,
  onEdit,
  pendingDelete,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  title: string;
  meta: string;
  featured: boolean;
  published: boolean;
  onToggleFeatured: () => void;
  onTogglePublished: () => void;
  onEdit: () => void;
  pendingDelete: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-sans font-bold text-primary">{title || 'Untitled'}</span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase ${published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {published ? 'Published' : 'Unpublished'}
          </span>
          {featured && <span className="px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase bg-secondary-container/20 text-secondary">Featured</span>}
        </div>
        <p className="text-xs text-slate-400 font-sans mt-1">{meta}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onToggleFeatured} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Toggle featured">
          <Icons.Star className={`w-4 h-4 ${featured ? 'text-secondary fill-secondary' : ''}`} />
        </button>
        <button onClick={onTogglePublished} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Toggle published">
          {published ? <Icons.CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Icons.X className="w-4 h-4" />}
        </button>
        <button onClick={onEdit} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          <Icons.Edit className="w-4 h-4" />
        </button>
        {pendingDelete ? (
          <>
            <button onClick={onConfirmDelete} className="px-2 py-1 text-[10px] rounded-lg bg-red-100 text-red-700 font-bold">Confirm</button>
            <button onClick={onCancelDelete} className="px-2 py-1 text-[10px] rounded-lg bg-slate-100 text-slate-700 font-bold">Cancel</button>
          </>
        ) : (
          <button onClick={onRequestDelete} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Icons.Trash className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Admin entry point for the Farmer Success module — dashboard stats plus
 * CRUD for all six content types (Stories, Videos, Testimonials,
 * Before & After, Crop Results, Case Studies). Follows the exact structure
 * and error-handling discipline of CareerManager.tsx / CropSolutionsManager.tsx:
 * onSnapshot + setDoc/updateDoc/deleteDoc, every write wrapped in try/catch,
 * two-click delete confirmation, no silent failures.
 */
export function FarmerSuccessManager() {
  const [subTab, setSubTab] = useState<FarmerSuccessSubTab>('Dashboard');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error'>('success');

  const showStatus = (message: string, type: 'success' | 'error' = 'success') => {
    setStatus(message);
    setStatusType(type);
  };

  const [stories, setStories] = useState<FarmerStory[]>([]);
  const [videos, setVideos] = useState<FarmerVideo[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [beforeAfterCases, setBeforeAfterCases] = useState<BeforeAfterCase[]>([]);
  const [cropResults, setCropResults] = useState<CropResult[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(collection(db, 'farmerStories'), (snapshot) => setStories(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FarmerStory, 'id'>) }))), (err) => showStatus(`Could not load stories: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(collection(db, 'farmerVideos'), (snapshot) => setVideos(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FarmerVideo, 'id'>) }))), (err) => showStatus(`Could not load videos: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(query(collection(db, 'testimonials'), orderBy('order', 'asc')), (snapshot) => setTestimonials(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Testimonial, 'id'>) }))), (err) => showStatus(`Could not load testimonials: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(query(collection(db, 'beforeAfterCases'), orderBy('order', 'asc')), (snapshot) => setBeforeAfterCases(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BeforeAfterCase, 'id'>) }))), (err) => showStatus(`Could not load before/after cases: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(query(collection(db, 'cropResults'), orderBy('order', 'asc')), (snapshot) => setCropResults(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CropResult, 'id'>) }))), (err) => showStatus(`Could not load crop results: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(collection(db, 'caseStudies'), (snapshot) => setCaseStudies(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CaseStudy, 'id'>) }))), (err) => showStatus(`Could not load case studies: ${describeFirestoreError(err)}`, 'error')),
    ];
    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  // --- Stories ---
  const [isStoryEditorOpen, setIsStoryEditorOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<FarmerStory | null>(null);
  const [pendingStoryDeleteId, setPendingStoryDeleteId] = useState<string | null>(null);

  const handleSaveStory = async (form: Omit<FarmerStory, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'farmerStories', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Story "${payload.title}" updated.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'farmerStories')), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Story "${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteStory = async (story: FarmerStory) => {
    try {
      await deleteDoc(doc(db, 'farmerStories', story.id));
      showStatus('Story deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingStoryDeleteId(null);
    }
  };
  const toggleStoryFeatured = async (story: FarmerStory) => {
    try {
      await updateDoc(doc(db, 'farmerStories', story.id), { featured: !story.featured, updatedAt: serverTimestamp() });
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };
  const toggleStoryPublished = async (story: FarmerStory) => {
    try {
      await updateDoc(doc(db, 'farmerStories', story.id), { status: story.status === 'published' ? 'draft' : 'published', updatedAt: serverTimestamp() });
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  // --- Videos ---
  const [isVideoEditorOpen, setIsVideoEditorOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<FarmerVideo | null>(null);
  const [pendingVideoDeleteId, setPendingVideoDeleteId] = useState<string | null>(null);

  const handleSaveVideo = async (form: Omit<FarmerVideo, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'farmerVideos', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Video "${payload.title}" updated.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'farmerVideos')), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Video "${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteVideo = async (video: FarmerVideo) => {
    try {
      await deleteDoc(doc(db, 'farmerVideos', video.id));
      showStatus('Video deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingVideoDeleteId(null);
    }
  };
  const toggleVideoFeatured = async (video: FarmerVideo) => {
    try { await updateDoc(doc(db, 'farmerVideos', video.id), { featured: !video.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleVideoPublished = async (video: FarmerVideo) => {
    try { await updateDoc(doc(db, 'farmerVideos', video.id), { published: !video.published, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- Testimonials ---
  const [isTestimonialEditorOpen, setIsTestimonialEditorOpen] = useState(false);
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [pendingTestimonialDeleteId, setPendingTestimonialDeleteId] = useState<string | null>(null);

  const handleSaveTestimonial = async (form: Omit<Testimonial, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'testimonials', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Testimonial from "${payload.farmerName}" updated.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'testimonials')), { ...payload, order: testimonials.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Testimonial from "${payload.farmerName}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteTestimonial = async (testimonial: Testimonial) => {
    try {
      await deleteDoc(doc(db, 'testimonials', testimonial.id));
      showStatus('Testimonial deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingTestimonialDeleteId(null);
    }
  };
  const toggleTestimonialFeatured = async (testimonial: Testimonial) => {
    try { await updateDoc(doc(db, 'testimonials', testimonial.id), { featured: !testimonial.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleTestimonialPublished = async (testimonial: Testimonial) => {
    try { await updateDoc(doc(db, 'testimonials', testimonial.id), { published: !testimonial.published, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- Before & After ---
  const [isBeforeAfterEditorOpen, setIsBeforeAfterEditorOpen] = useState(false);
  const [editingBeforeAfter, setEditingBeforeAfter] = useState<BeforeAfterCase | null>(null);
  const [pendingBeforeAfterDeleteId, setPendingBeforeAfterDeleteId] = useState<string | null>(null);

  const handleSaveBeforeAfter = async (form: Omit<BeforeAfterCase, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'beforeAfterCases', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" updated.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'beforeAfterCases')), { ...payload, order: beforeAfterCases.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteBeforeAfter = async (entry: BeforeAfterCase) => {
    try {
      await deleteDoc(doc(db, 'beforeAfterCases', entry.id));
      showStatus('Entry deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingBeforeAfterDeleteId(null);
    }
  };
  const toggleBeforeAfterFeatured = async (entry: BeforeAfterCase) => {
    try { await updateDoc(doc(db, 'beforeAfterCases', entry.id), { featured: !entry.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleBeforeAfterPublished = async (entry: BeforeAfterCase) => {
    try { await updateDoc(doc(db, 'beforeAfterCases', entry.id), { published: !entry.published, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- Crop Results ---
  const [isCropResultEditorOpen, setIsCropResultEditorOpen] = useState(false);
  const [editingCropResult, setEditingCropResult] = useState<CropResult | null>(null);
  const [pendingCropResultDeleteId, setPendingCropResultDeleteId] = useState<string | null>(null);

  const handleSaveCropResult = async (form: Omit<CropResult, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'cropResults', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Result for "${payload.crop}" updated.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'cropResults')), { ...payload, order: cropResults.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Result for "${payload.crop}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteCropResult = async (result: CropResult) => {
    try {
      await deleteDoc(doc(db, 'cropResults', result.id));
      showStatus('Crop result deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingCropResultDeleteId(null);
    }
  };
  const toggleCropResultFeatured = async (result: CropResult) => {
    try { await updateDoc(doc(db, 'cropResults', result.id), { featured: !result.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleCropResultPublished = async (result: CropResult) => {
    try { await updateDoc(doc(db, 'cropResults', result.id), { published: !result.published, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- Case Studies ---
  const [isCaseStudyEditorOpen, setIsCaseStudyEditorOpen] = useState(false);
  const [editingCaseStudy, setEditingCaseStudy] = useState<CaseStudy | null>(null);
  const [pendingCaseStudyDeleteId, setPendingCaseStudyDeleteId] = useState<string | null>(null);

  const handleSaveCaseStudy = async (form: Omit<CaseStudy, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'caseStudies', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Case study "${payload.title}" updated.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'caseStudies')), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Case study "${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteCaseStudy = async (caseStudy: CaseStudy) => {
    try {
      await deleteDoc(doc(db, 'caseStudies', caseStudy.id));
      showStatus('Case study deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingCaseStudyDeleteId(null);
    }
  };
  const toggleCaseStudyFeatured = async (caseStudy: CaseStudy) => {
    try { await updateDoc(doc(db, 'caseStudies', caseStudy.id), { featured: !caseStudy.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleCaseStudyPublished = async (caseStudy: CaseStudy) => {
    try { await updateDoc(doc(db, 'caseStudies', caseStudy.id), { status: caseStudy.status === 'published' ? 'draft' : 'published', updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  const stats = {
    stories: stories.length,
    publishedStories: stories.filter((s) => s.status === 'published').length,
    videos: videos.length,
    testimonials: testimonials.length,
    beforeAfter: beforeAfterCases.length,
    cropResults: cropResults.length,
    caseStudies: caseStudies.length,
    publishedCaseStudies: caseStudies.filter((c) => c.status === 'published').length,
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="font-sans text-xl font-bold text-primary">Farmer Success</h2>
            <p className="text-sm text-primary/60 font-sans mt-1">Manage stories, videos, testimonials, and results shown at /farmer-success.</p>
          </div>
        </div>
        {status && (
          <div className={`flex items-center gap-2 mt-4 px-4 py-3 rounded-xl text-sm font-sans font-semibold ${statusType === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {statusType === 'error' ? <Icons.AlertCircle className="w-4 h-4 shrink-0" /> : <Icons.CheckCircle2 className="w-4 h-4 shrink-0" />}
            {status}
            <button onClick={() => setStatus('')} className="ml-auto text-current opacity-60 hover:opacity-100"><Icons.X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex gap-1 mt-6 border-b border-slate-100 overflow-x-auto">
          {SUB_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={`px-4 py-2.5 font-sans text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                subTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-primary/70'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'Dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Total Stories', value: stats.stories },
            { label: 'Published Stories', value: stats.publishedStories },
            { label: 'Videos', value: stats.videos },
            { label: 'Testimonials', value: stats.testimonials },
            { label: 'Before & After', value: stats.beforeAfter },
            { label: 'Crop Results', value: stats.cropResults },
            { label: 'Case Studies', value: stats.caseStudies },
            { label: 'Published Case Studies', value: stats.publishedCaseStudies },
          ].map((stat) => (
            <div key={stat.label} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
              <span className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
              <h4 className="text-3xl font-sans font-black text-primary mt-3">{stat.value}</h4>
            </div>
          ))}
        </div>
      )}

      {subTab === 'Stories' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingStory(null); setIsStoryEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Story
            </button>
          </div>
          {stories.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No stories yet. Click "Add Story" to create your first one.</p>
            </div>
          )}
          {stories.map((story) => (
            <ContentRow
              key={story.id}
              title={story.title}
              meta={`${story.crop || 'No crop'} · ${story.location || 'No location'} · ${story.status} · /farmer-success/story/${story.slug}`}
              featured={story.featured}
              published={story.status === 'published'}
              onToggleFeatured={() => void toggleStoryFeatured(story)}
              onTogglePublished={() => void toggleStoryPublished(story)}
              onEdit={() => { setEditingStory(story); setIsStoryEditorOpen(true); }}
              pendingDelete={pendingStoryDeleteId === story.id}
              onRequestDelete={() => setPendingStoryDeleteId(story.id)}
              onConfirmDelete={() => void confirmDeleteStory(story)}
              onCancelDelete={() => setPendingStoryDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Videos' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingVideo(null); setIsVideoEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Video
            </button>
          </div>
          {videos.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No videos yet. Click "Add Video" and paste a YouTube URL.</p>
            </div>
          )}
          {videos.map((video) => (
            <ContentRow
              key={video.id}
              title={video.title}
              meta={`${video.kind === 'short' ? 'Short' : 'Video'} · ${video.crop || 'No crop'}`}
              featured={video.featured}
              published={video.published}
              onToggleFeatured={() => void toggleVideoFeatured(video)}
              onTogglePublished={() => void toggleVideoPublished(video)}
              onEdit={() => { setEditingVideo(video); setIsVideoEditorOpen(true); }}
              pendingDelete={pendingVideoDeleteId === video.id}
              onRequestDelete={() => setPendingVideoDeleteId(video.id)}
              onConfirmDelete={() => void confirmDeleteVideo(video)}
              onCancelDelete={() => setPendingVideoDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Testimonials' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingTestimonial(null); setIsTestimonialEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Testimonial
            </button>
          </div>
          {testimonials.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No testimonials yet.</p>
            </div>
          )}
          {testimonials.map((testimonial) => (
            <ContentRow
              key={testimonial.id}
              title={testimonial.farmerName}
              meta={`${testimonial.crop || 'No crop'} · ${testimonial.location || 'No location'}${testimonial.slug ? ` · /farmer-success/testimonials/${testimonial.slug}` : ''}`}
              featured={testimonial.featured}
              published={testimonial.published}
              onToggleFeatured={() => void toggleTestimonialFeatured(testimonial)}
              onTogglePublished={() => void toggleTestimonialPublished(testimonial)}
              onEdit={() => { setEditingTestimonial(testimonial); setIsTestimonialEditorOpen(true); }}
              pendingDelete={pendingTestimonialDeleteId === testimonial.id}
              onRequestDelete={() => setPendingTestimonialDeleteId(testimonial.id)}
              onConfirmDelete={() => void confirmDeleteTestimonial(testimonial)}
              onCancelDelete={() => setPendingTestimonialDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Before & After' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingBeforeAfter(null); setIsBeforeAfterEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Entry
            </button>
          </div>
          {beforeAfterCases.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No before/after entries yet.</p>
            </div>
          )}
          {beforeAfterCases.map((entry) => (
            <ContentRow
              key={entry.id}
              title={entry.title}
              meta={`${entry.crop || 'No crop'} · ${entry.duration || 'No duration'}`}
              featured={entry.featured}
              published={entry.published}
              onToggleFeatured={() => void toggleBeforeAfterFeatured(entry)}
              onTogglePublished={() => void toggleBeforeAfterPublished(entry)}
              onEdit={() => { setEditingBeforeAfter(entry); setIsBeforeAfterEditorOpen(true); }}
              pendingDelete={pendingBeforeAfterDeleteId === entry.id}
              onRequestDelete={() => setPendingBeforeAfterDeleteId(entry.id)}
              onConfirmDelete={() => void confirmDeleteBeforeAfter(entry)}
              onCancelDelete={() => setPendingBeforeAfterDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Crop Results' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingCropResult(null); setIsCropResultEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Result
            </button>
          </div>
          {cropResults.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No crop results yet.</p>
            </div>
          )}
          {cropResults.map((result) => (
            <ContentRow
              key={result.id}
              title={result.crop}
              meta={`Yield +${result.yieldIncrease || '—'} · Disease -${result.diseaseReduction || '—'}`}
              featured={result.featured}
              published={result.published}
              onToggleFeatured={() => void toggleCropResultFeatured(result)}
              onTogglePublished={() => void toggleCropResultPublished(result)}
              onEdit={() => { setEditingCropResult(result); setIsCropResultEditorOpen(true); }}
              pendingDelete={pendingCropResultDeleteId === result.id}
              onRequestDelete={() => setPendingCropResultDeleteId(result.id)}
              onConfirmDelete={() => void confirmDeleteCropResult(result)}
              onCancelDelete={() => setPendingCropResultDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Case Studies' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingCaseStudy(null); setIsCaseStudyEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Case Study
            </button>
          </div>
          {caseStudies.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No case studies yet.</p>
            </div>
          )}
          {caseStudies.map((caseStudy) => (
            <ContentRow
              key={caseStudy.id}
              title={caseStudy.title}
              meta={`${caseStudy.status} · /farmer-success/case-study/${caseStudy.slug}`}
              featured={caseStudy.featured}
              published={caseStudy.status === 'published'}
              onToggleFeatured={() => void toggleCaseStudyFeatured(caseStudy)}
              onTogglePublished={() => void toggleCaseStudyPublished(caseStudy)}
              onEdit={() => { setEditingCaseStudy(caseStudy); setIsCaseStudyEditorOpen(true); }}
              pendingDelete={pendingCaseStudyDeleteId === caseStudy.id}
              onRequestDelete={() => setPendingCaseStudyDeleteId(caseStudy.id)}
              onConfirmDelete={() => void confirmDeleteCaseStudy(caseStudy)}
              onCancelDelete={() => setPendingCaseStudyDeleteId(null)}
            />
          ))}
        </div>
      )}

      {isStoryEditorOpen && (
        <StoryEditor story={editingStory} onSave={handleSaveStory} onClose={() => { setIsStoryEditorOpen(false); setEditingStory(null); }} />
      )}
      {isVideoEditorOpen && (
        <VideoEditor video={editingVideo} onSave={handleSaveVideo} onClose={() => { setIsVideoEditorOpen(false); setEditingVideo(null); }} />
      )}
      {isTestimonialEditorOpen && (
        <TestimonialEditor testimonial={editingTestimonial} onSave={handleSaveTestimonial} onClose={() => { setIsTestimonialEditorOpen(false); setEditingTestimonial(null); }} />
      )}
      {isBeforeAfterEditorOpen && (
        <BeforeAfterEditor entry={editingBeforeAfter} onSave={handleSaveBeforeAfter} onClose={() => { setIsBeforeAfterEditorOpen(false); setEditingBeforeAfter(null); }} />
      )}
      {isCropResultEditorOpen && (
        <CropResultEditor result={editingCropResult} onSave={handleSaveCropResult} onClose={() => { setIsCropResultEditorOpen(false); setEditingCropResult(null); }} />
      )}
      {isCaseStudyEditorOpen && (
        <CaseStudyEditor caseStudy={editingCaseStudy} onSave={handleSaveCaseStudy} onClose={() => { setIsCaseStudyEditorOpen(false); setEditingCaseStudy(null); }} />
      )}
    </div>
  );
}
