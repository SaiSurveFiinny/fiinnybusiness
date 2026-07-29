import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Icons } from '../Icons';
import { ImageUploadField } from './ImageUploadField';
import { CropEditor } from './CropEditor';
import { db } from '../../lib/firebase';
import {
  generateId,
  initialCropCategories,
  slugify,
  type CropCategory,
  type CropSolution,
} from '../../data/cropSolutions';

interface CategoryFormState {
  name: string;
  slug: string;
  description: string;
  coverImage: string;
}

const defaultCategoryForm: CategoryFormState = { name: '', slug: '', description: '', coverImage: '' };
const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

/** Maps Firestore/Firebase error codes to messages an admin can actually act on. */
function describeFirestoreError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'permission-denied':
      return 'Permission denied by Firestore security rules. Your account may not have write access to this collection — contact whoever manages the project\'s Firestore rules.';
    case 'unavailable':
      return 'Could not reach Firestore. Check your internet connection and try again.';
    case 'unauthenticated':
      return 'Your session has expired. Please sign in again.';
    default:
      return err instanceof Error ? `Could not save: ${err.message}` : 'Could not save. Please try again.';
  }
}

/**
 * Admin management surface for the Crop Solutions module — category CRUD
 * (with reorder/publish) and, per category, crop CRUD (with reorder/publish)
 * via the CropEditor tabbed modal. Firestore access follows the same
 * onSnapshot + addDoc/updateDoc/deleteDoc pattern already used throughout
 * Admin.tsx for products/blogs — no new data-access style introduced.
 */
export function CropSolutionsManager() {
  const [categories, setCategories] = useState<CropCategory[]>([]);
  const [crops, setCrops] = useState<CropSolution[]>([]);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error'>('success');
  const [lastCreatedCategoryId, setLastCreatedCategoryId] = useState<string | null>(null);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const showStatus = (message: string, type: 'success' | 'error' = 'success') => {
    setStatus(message);
    setStatusType(type);
  };

  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(defaultCategoryForm);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryFormError, setCategoryFormError] = useState('');
  const [pendingCategoryDeleteId, setPendingCategoryDeleteId] = useState<string | null>(null);

  const [editingCrop, setEditingCrop] = useState<CropSolution | null>(null);
  const [isCropEditorOpen, setIsCropEditorOpen] = useState(false);
  const [newCropCategoryId, setNewCropCategoryId] = useState<string | null>(null);
  const [pendingCropDeleteId, setPendingCropDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeCategories = onSnapshot(
      query(collection(db, 'cropCategories'), orderBy('order', 'asc')),
      (snapshot) => {
        setCategories(snapshot.docs.map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<CropCategory, 'id'>) })));
      },
      (err) => showStatus(`Could not load categories: ${describeFirestoreError(err)}`, 'error'),
    );
    const unsubscribeCrops = onSnapshot(
      collection(db, 'crops'),
      (snapshot) => {
        setCrops(snapshot.docs.map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<CropSolution, 'id'>) })));
      },
      (err) => showStatus(`Could not load crops: ${describeFirestoreError(err)}`, 'error'),
    );
    return () => {
      unsubscribeCategories();
      unsubscribeCrops();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!lastCreatedCategoryId) return;
    const node = categoryRefs.current[lastCreatedCategoryId];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.add('ring-2', 'ring-secondary-container');
      const timeout = setTimeout(() => {
        node.classList.remove('ring-2', 'ring-secondary-container');
        setLastCreatedCategoryId(null);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [lastCreatedCategoryId, categories]);

  const seedCategories = async () => {
    try {
      const batch = writeBatch(db);
      initialCropCategories.forEach((category) => {
        const ref = doc(collection(db, 'cropCategories'));
        batch.set(ref, { ...category, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      await batch.commit();
      showStatus('Initial crop categories seeded.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm(defaultCategoryForm);
    setEditingCategoryId(null);
    setIsCategoryFormOpen(false);
    setCategoryFormError('');
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryFormError('');

    const name = categoryForm.name.trim();
    if (!name) {
      setCategoryFormError('Category name is required.');
      return;
    }
    const slug = categoryForm.slug.trim() || slugify(name);
    if (!slug) {
      setCategoryFormError('Slug is required (it is generated from the name if left blank).');
      return;
    }
    const duplicate = categories.find((c) => c.slug === slug && c.id !== editingCategoryId);
    if (duplicate) {
      setCategoryFormError(`Slug "${slug}" is already used by "${duplicate.name}". Choose a different slug.`);
      return;
    }

    const payload = {
      name,
      slug,
      description: categoryForm.description.trim(),
      coverImage: categoryForm.coverImage.trim(),
      updatedAt: serverTimestamp(),
    };

    setIsSavingCategory(true);
    try {
      if (editingCategoryId) {
        await updateDoc(doc(db, 'cropCategories', editingCategoryId), payload);
        showStatus(`Category "${name}" updated.`, 'success');
      } else {
        const newRef = doc(collection(db, 'cropCategories'));
        await setDoc(newRef, {
          ...payload,
          order: categories.length,
          published: true,
          createdAt: serverTimestamp(),
        });
        showStatus(`Category "${name}" created.`, 'success');
        setLastCreatedCategoryId(newRef.id);
      }
      resetCategoryForm();
    } catch (err) {
      setCategoryFormError(describeFirestoreError(err));
      showStatus(`Could not save category "${name}".`, 'error');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleEditCategory = (category: CropCategory) => {
    setEditingCategoryId(category.id);
    setCategoryForm({ name: category.name, slug: category.slug, description: category.description, coverImage: category.coverImage });
    setIsCategoryFormOpen(true);
  };

  const confirmDeleteCategory = async (category: CropCategory) => {
    try {
      await deleteDoc(doc(db, 'cropCategories', category.id));
      showStatus('Category deleted. Crops in this category remain but are now uncategorized.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingCategoryDeleteId(null);
    }
  };

  const toggleCategoryPublished = async (category: CropCategory) => {
    try {
      await updateDoc(doc(db, 'cropCategories', category.id), { published: !category.published, updatedAt: serverTimestamp() });
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  const moveCategory = async (category: CropCategory, direction: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((c) => c.id === category.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const other = sorted[swapIndex];
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'cropCategories', category.id), { order: other.order });
      batch.update(doc(db, 'cropCategories', other.id), { order: category.order });
      await batch.commit();
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  const cropsForCategory = (categoryId: string) => crops.filter((c) => c.categoryId === categoryId).sort((a, b) => a.order - b.order);

  const openNewCrop = (categoryId: string) => {
    setEditingCrop(null);
    setNewCropCategoryId(categoryId);
    setIsCropEditorOpen(true);
  };

  const openEditCrop = (crop: CropSolution) => {
    setEditingCrop(crop);
    setNewCropCategoryId(null);
    setIsCropEditorOpen(true);
  };

  const handleSaveCrop = async (form: Omit<CropSolution, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'crops', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Crop "${payload.name}" updated.`, 'success');
      } else {
        const categoryCropCount = cropsForCategory(payload.categoryId).length;
        await setDoc(doc(collection(db, 'crops')), {
          ...payload,
          order: categoryCropCount,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showStatus(`Crop "${payload.name}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err; // let CropEditor keep its modal open and show the error too
    }
  };

  const confirmDeleteCrop = async (crop: CropSolution) => {
    try {
      await deleteDoc(doc(db, 'crops', crop.id));
      showStatus('Crop deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingCropDeleteId(null);
    }
  };

  const toggleCropPublished = async (crop: CropSolution) => {
    try {
      await updateDoc(doc(db, 'crops', crop.id), { published: !crop.published, updatedAt: serverTimestamp() });
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  const moveCrop = async (crop: CropSolution, direction: -1 | 1) => {
    const sorted = cropsForCategory(crop.categoryId);
    const index = sorted.findIndex((c) => c.id === crop.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const other = sorted[swapIndex];
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'crops', crop.id), { order: other.order });
      batch.update(doc(db, 'crops', other.id), { order: crop.order });
      await batch.commit();
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="font-sans text-xl font-bold text-primary">Crop Solutions</h2>
            <p className="text-sm text-primary/60 font-sans mt-1">
              Manage categories and crops shown at /crop-solutions. Nothing here is hardcoded — everything is admin-managed.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {categories.length === 0 && (
              <button onClick={() => void seedCategories()} className="px-4 py-2 rounded-xl border border-primary/20 text-primary font-sans font-bold text-sm hover:bg-primary/5 transition-colors">
                Seed Categories
              </button>
            )}
            <button
              onClick={() => { setEditingCategoryId(null); setCategoryForm(defaultCategoryForm); setIsCategoryFormOpen(true); }}
              className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors"
            >
              Add Category
            </button>
          </div>
        </div>
        {status && (
          <div className={`flex items-center gap-2 mt-4 px-4 py-3 rounded-xl text-sm font-sans font-semibold ${
            statusType === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {statusType === 'error' ? <Icons.AlertCircle className="w-4 h-4 shrink-0" /> : <Icons.CheckCircle2 className="w-4 h-4 shrink-0" />}
            {status}
            <button onClick={() => setStatus('')} className="ml-auto text-current opacity-60 hover:opacity-100">
              <Icons.X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {isCategoryFormOpen && (
        <form onSubmit={(e) => void handleSaveCategory(e)} className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-sans text-lg font-bold text-primary">{editingCategoryId ? 'Edit Category' : 'Add Category'}</h3>
            <button type="button" onClick={resetCategoryForm} className="px-3 py-2 text-xs rounded-lg border border-slate-300 font-sans font-semibold hover:bg-slate-50">Close</button>
          </div>
          {categoryFormError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-sans font-semibold">
              <Icons.AlertCircle className="w-4 h-4 shrink-0" /> {categoryFormError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Category Name *</label>
              <input type="text" required value={categoryForm.name} onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value, slug: p.slug || slugify(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input type="text" value={categoryForm.slug} onChange={(e) => setCategoryForm((p) => ({ ...p, slug: slugify(e.target.value) }))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea rows={2} value={categoryForm.description} onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))} className={`${inputClass} resize-none`} />
          </div>
          <ImageUploadField label="Cover Image" value={categoryForm.coverImage} onChange={(url) => setCategoryForm((p) => ({ ...p, coverImage: url }))} folder="crop-solutions/categories" previewClassName="w-full h-32 object-cover rounded-xl border border-slate-200" />
          <button
            type="submit"
            disabled={isSavingCategory}
            className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {isSavingCategory && <div className="w-4 h-4 border-2 border-secondary-container/30 border-t-secondary-container rounded-full animate-spin" />}
            {isSavingCategory ? 'Saving...' : editingCategoryId ? 'Update Category' : 'Create Category'}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {categories.map((category, index) => {
          const categoryCrops = cropsForCategory(category.id);
          const isExpanded = expandedCategoryId === category.id;
          return (
            <div
              key={category.id}
              ref={(node) => { categoryRefs.current[category.id] = node; }}
              className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden transition-shadow"
            >
              <div className="flex items-center gap-4 p-6">
                <button onClick={() => setExpandedCategoryId(isExpanded ? null : category.id)} className="p-1 text-slate-400 hover:text-primary transition-colors">
                  <Icons.ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                {category.coverImage ? (
                  <img src={category.coverImage} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary shrink-0">
                    <Icons.Layers className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-sans font-bold text-primary">{category.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider ${category.published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {category.published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-primary/50 font-sans">{categoryCrops.length} crop(s)</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => void moveCategory(category, -1)} disabled={index === 0} className="p-2 text-slate-400 hover:text-primary disabled:opacity-30 transition-colors">
                    <Icons.ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => void moveCategory(category, 1)} disabled={index === categories.length - 1} className="p-2 text-slate-400 hover:text-primary disabled:opacity-30 transition-colors">
                    <Icons.ArrowDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => void toggleCategoryPublished(category)} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Toggle published">
                    <Icons.CheckCircle2 className={`w-4 h-4 ${category.published ? 'text-emerald-600' : ''}`} />
                  </button>
                  <button onClick={() => handleEditCategory(category)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Icons.Edit className="w-4 h-4" />
                  </button>
                  {pendingCategoryDeleteId === category.id ? (
                    <>
                      <button onClick={() => void confirmDeleteCategory(category)} className="px-2 py-1 text-xs rounded-lg bg-red-100 text-red-700 font-bold">Confirm</button>
                      <button onClick={() => setPendingCategoryDeleteId(null)} className="px-2 py-1 text-xs rounded-lg bg-slate-100 text-slate-700 font-bold">Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setPendingCategoryDeleteId(category.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Icons.Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 p-6 bg-slate-50/50 space-y-3">
                  <div className="flex justify-end">
                    <button onClick={() => openNewCrop(category.id)} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                      <Icons.Plus className="w-4 h-4" /> Add Crop
                    </button>
                  </div>
                  {categoryCrops.length === 0 && <p className="text-sm text-slate-400 font-sans">No crops in this category yet.</p>}
                  {categoryCrops.map((crop, cropIndex) => (
                    <div key={crop.id} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                      {crop.heroImage ? (
                        <img src={crop.heroImage} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center text-primary shrink-0">
                          <Icons.Sprout className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-semibold text-primary text-sm">{crop.name || 'Untitled crop'}</span>
                          {crop.featured && <span className="px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase bg-secondary-container/20 text-secondary">Featured</span>}
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase ${crop.published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {crop.published ? 'Live' : 'Draft'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-sans">/crop-solutions/{category.slug}/{crop.slug}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => void moveCrop(crop, -1)} disabled={cropIndex === 0} className="p-1.5 text-slate-400 hover:text-primary disabled:opacity-30 transition-colors">
                          <Icons.ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => void moveCrop(crop, 1)} disabled={cropIndex === categoryCrops.length - 1} className="p-1.5 text-slate-400 hover:text-primary disabled:opacity-30 transition-colors">
                          <Icons.ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => void toggleCropPublished(crop)} className="p-1.5 text-slate-400 hover:text-primary transition-colors" title="Toggle published">
                          <Icons.CheckCircle2 className={`w-3.5 h-3.5 ${crop.published ? 'text-emerald-600' : ''}`} />
                        </button>
                        <button onClick={() => openEditCrop(crop)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Icons.Edit className="w-3.5 h-3.5" />
                        </button>
                        {pendingCropDeleteId === crop.id ? (
                          <>
                            <button onClick={() => void confirmDeleteCrop(crop)} className="px-2 py-1 text-[10px] rounded-lg bg-red-100 text-red-700 font-bold">Confirm</button>
                            <button onClick={() => setPendingCropDeleteId(null)} className="px-2 py-1 text-[10px] rounded-lg bg-slate-100 text-slate-700 font-bold">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setPendingCropDeleteId(crop.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Icons.Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {categories.length === 0 && (
          <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
            <p className="text-sm text-primary/60 font-sans">No categories yet. Click "Seed Categories" above to create the default set (Fruit Crops, Vegetables, Sugarcane, Cotton, Pulses, Cereals, Oil Seeds).</p>
          </div>
        )}
      </div>

      {isCropEditorOpen && (
        <CropEditor
          crop={editingCrop}
          categories={categories}
          defaultCategoryId={newCropCategoryId ?? undefined}
          onSave={handleSaveCrop}
          onClose={() => { setIsCropEditorOpen(false); setEditingCrop(null); setNewCropCategoryId(null); }}
        />
      )}
    </div>
  );
}
