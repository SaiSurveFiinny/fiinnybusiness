import React, { useEffect, useState } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Icons } from '../components/Icons';
import { PaymentDetailModal, type PaymentDetailOrder } from '../components/PaymentDetailModal';
import { CropSolutionsManager } from '../components/admin/CropSolutionsManager';
import { CareerManager } from '../components/admin/CareerManager';
import {
  initialAbout,
  initialBlogs,
  initialHomeVideos,
  initialProducts,
  type AboutInfo,
  type Blog,
  type Grievance,
  type Order,
  type Product,
  type User,
} from '../data/mockData';
import { db } from '../lib/firebase';

type AdminTab = 'Dashboard' | 'Orders' | 'Users' | 'Products' | 'Crop Solutions' | 'Career' | 'Blogs' | 'Support' | 'Company Info';

interface AdminUser extends User {
  email: string;
  role: 'admin' | 'customer';
  village: string;
  district: string;
  state: string;
  pincode: string;
}

interface UserEditFormState {
  name: string;
  phone: string;
  village: string;
  district: string;
  state: string;
  pincode: string;
  role: 'admin' | 'customer';
}

interface ProductFormState {
  name: string;
  desc: string;
  numericPrice: string;
  image: string;
  badge: string;
  featured: boolean;
}

interface BlogFormState {
  title: string;
  excerpt: string;
  category: string;
  date: string;
  content: string;
  imageUrlsText: string;
  videoUrlsText: string;
  linksText: string;
}

function formatPrice(price: number) {
  return `₹${price.toLocaleString('en-IN')}`;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function parseLineList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function toMultiline(value: string[] | undefined) {
  return (value ?? []).join('\n');
}

function parseLinksText(value: string): Array<{ label: string; url: string }> {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split('|');
      const url = (rest.length > 0 ? rest.join('|') : label).trim();
      return {
        label: label.trim(),
        url,
      };
    })
    .filter((link) => link.url.length > 0);
}

function linksToMultiline(links: Blog['links']) {
  return (links ?? [])
    .map((link) => `${link.label || link.url}|${link.url}`)
    .join('\n');
}

const defaultProductForm: ProductFormState = {
  name: '',
  desc: '',
  numericPrice: '',
  image: '/bottle-1l-Photoroom.png',
  badge: '',
  featured: false,
};

const defaultBlogForm: BlogFormState = {
  title: '',
  excerpt: '',
  category: 'General',
  date: new Date().toLocaleDateString('en-IN'),
  content: '',
  imageUrlsText: '',
  videoUrlsText: '',
  linksText: '',
};

export default function Admin() {
  const [activeTab, setActiveTab] = useState<AdminTab>('Dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PaymentDetailOrder | null>(null);
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [about, setAbout] = useState<AboutInfo>(initialAbout);
  const [homeVideos, setHomeVideos] = useState<string[]>(initialHomeVideos);
  const [homeVideoInput, setHomeVideoInput] = useState('');
  const [status, setStatus] = useState('');
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [isSavingHomeVideos, setIsSavingHomeVideos] = useState(false);

  const [productForm, setProductForm] = useState<ProductFormState>(defaultProductForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [pendingProductDeleteId, setPendingProductDeleteId] = useState<string | null>(null);

  const [blogForm, setBlogForm] = useState<BlogFormState>(defaultBlogForm);
  const [editingBlogId, setEditingBlogId] = useState<string | null>(null);
  const [isSavingBlog, setIsSavingBlog] = useState(false);
  const [isBlogFormOpen, setIsBlogFormOpen] = useState(false);
  const [pendingBlogDeleteId, setPendingBlogDeleteId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingTicketId, setReplyingTicketId] = useState<string | null>(null);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUserEmail, setEditingUserEmail] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userEditForm, setUserEditForm] = useState<UserEditFormState>({
    name: '',
    phone: '',
    village: '',
    district: '',
    state: '',
    pincode: '',
    role: 'customer',
  });

  useEffect(() => {
    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const value: Product[] = snapshot.docs.map((docItem) => {
        const data = docItem.data();
        const numericPrice = Number(data.numericPrice ?? data.price ?? 0);
        return {
          id: docItem.id,
          name: String(data.name ?? ''),
          desc: String(data.desc ?? ''),
          price: typeof data.price === 'string' ? data.price : formatPrice(numericPrice),
          numericPrice,
          image: String(data.image ?? '/bottle-1l-Photoroom.png'),
          badge: data.badge ? String(data.badge) : undefined,
          featured: Boolean(data.featured),
        };
      });
      setProducts(value);
    });

    const unsubscribeBlogs = onSnapshot(collection(db, 'blogs'), (snapshot) => {
      const value: Blog[] = snapshot.docs.map((docItem) => {
        const data = docItem.data();
        return {
          id: docItem.id,
          title: String(data.title ?? ''),
          excerpt: String(data.excerpt ?? ''),
          date: String(data.date ?? ''),
          category: String(data.category ?? ''),
          content: String(data.content ?? ''),
          imageUrls: toStringArray(data.imageUrls),
          videoUrls: toStringArray(data.videoUrls),
          links: Array.isArray(data.links)
            ? data.links
                .map((item) => ({
                  label: String(item?.label ?? ''),
                  url: String(item?.url ?? ''),
                }))
                .filter((item) => item.url.trim().length > 0)
            : [],
        };
      });
      setBlogs(value);
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const value: AdminUser[] = snapshot.docs.map((docItem) => {
        const data = docItem.data();
        return {
          id: docItem.id,
          name: String(data.name ?? 'Unknown'),
          phone: String(data.phone ?? ''),
          email: String(data.email ?? ''),
          role: (data.role === 'admin' ? 'admin' : 'customer') as 'admin' | 'customer',
          village: String(data.village ?? ''),
          district: String(data.district ?? ''),
          state: String(data.state ?? ''),
          pincode: String(data.pincode ?? ''),
          totalOrders: Number(data.totalOrders ?? 0),
          joinDate: String(data.createdAt?.toDate?.()?.toISOString?.().slice(0, 10) ?? '-'),
        };
      });
      setUsers(value);
    });

    const unsubscribeOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const value: Order[] = snapshot.docs.map((docItem) => {
        const data = docItem.data();
        return {
          id: docItem.id,
          uid: String(data.uid ?? ''),
          customerName: String(data.customerName ?? ''),
          customerPhone: String(data.customerPhone ?? ''),
          customerEmail: String(data.customerEmail ?? ''),
          state: String(data.state ?? ''),
          district: String(data.district ?? ''),
          address: String(data.address ?? ''),
          pinCode: String(data.pinCode ?? ''),
          items: Array.isArray(data.items) ? data.items : [],
          totalAmount: Number(data.totalAmount ?? 0),
          status: String(data.status ?? 'Placed'),
          paymentStatus: (data.paymentStatus ?? 'pending') as Order['paymentStatus'],
          razorpayPaymentId:  data.razorpayPaymentId  ? String(data.razorpayPaymentId)  : undefined,
          razorpayOrderId:    data.razorpayOrderId    ? String(data.razorpayOrderId)    : undefined,
          failureReason:      data.failureReason      ? String(data.failureReason)      : undefined,
          shipmentStatus:     data.shipmentStatus     ? (data.shipmentStatus as Order['shipmentStatus']) : undefined,
          trackingId:         data.trackingId         ? String(data.trackingId)         : undefined,
          shiprocketOrderId:  data.shiprocketOrderId  ? String(data.shiprocketOrderId)  : undefined,
          createdAt: data.createdAt?.toDate?.()?.toLocaleString('en-IN') ?? '-',
        };
      });
      setOrders(value.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });

    const unsubscribeGrievances = onSnapshot(collection(db, 'grievances'), (snapshot) => {
      const value: Grievance[] = snapshot.docs.map((docItem) => {
        const data = docItem.data();
        const messages: NonNullable<Grievance['messages']> = Array.isArray(data.messages)
          ? data.messages
              .map((item) => ({
                id: String(item?.id ?? ''),
                sender: (item?.sender === 'customer' ? 'customer' : 'admin') as 'admin' | 'customer',
                text: String(item?.text ?? ''),
                createdAt: Number(item?.createdAt ?? 0),
              }))
              .filter((item) => item.id && item.text)
              .sort((a, b) => a.createdAt - b.createdAt)
          : [];
        return {
          id: docItem.id,
          ticketId: String(data.ticketId ?? `GRV-${docItem.id.slice(0, 8).toUpperCase()}`),
          userId: String(data.uid ?? ''),
          userName: String(data.userName ?? 'User'),
          subject: String(data.subject ?? ''),
          description: String(data.description ?? ''),
          status: (data.status as Grievance['status']) ?? 'Pending',
          date: String(data.date ?? '-'),
          messages,
        };
      });
      setGrievances(value);
    });

    const unsubscribeCompany = onSnapshot(doc(db, 'settings', 'company'), (snapshot) => {
      if (!snapshot.exists()) {
        setAbout(initialAbout);
        return;
      }
      const data = snapshot.data();
      setAbout({
        tagline: String(data.tagline ?? initialAbout.tagline),
        manufacturer: String(data.manufacturer ?? initialAbout.manufacturer),
        location: String(data.location ?? initialAbout.location),
        phone: String(data.phone ?? initialAbout.phone),
        certification: String(data.certification ?? initialAbout.certification),
      });
    });

    const unsubscribeHomepage = onSnapshot(doc(db, 'settings', 'homepage'), (snapshot) => {
      if (!snapshot.exists()) {
        setHomeVideos(initialHomeVideos);
        return;
      }
      const data = snapshot.data();
      setHomeVideos(toStringArray(data.videos));
    });

    return () => {
      unsubscribeProducts();
      unsubscribeBlogs();
      unsubscribeUsers();
      unsubscribeOrders();
      unsubscribeGrievances();
      unsubscribeCompany();
      unsubscribeHomepage();
    };
  }, []);

  const resetProductForm = () => {
    setProductForm(defaultProductForm);
    setEditingProductId(null);
    setIsProductFormOpen(false);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericPrice = Number(productForm.numericPrice);
    if (!productForm.name.trim()) {
      setStatus('Product name is required.');
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setStatus('Product price must be a valid number.');
      return;
    }

    setIsSavingProduct(true);
    const payload = {
      name: productForm.name.trim(),
      desc: productForm.desc.trim(),
      numericPrice,
      price: formatPrice(numericPrice),
      image: productForm.image.trim() || '/bottle-1l-Photoroom.png',
      badge: productForm.badge.trim(),
      featured: productForm.featured,
      updatedAt: serverTimestamp(),
    };

    if (editingProductId) {
      await updateDoc(doc(db, 'products', editingProductId), payload);
      setStatus('Product updated.');
    } else {
      await addDoc(collection(db, 'products'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      setStatus('Product created.');
    }
    setIsSavingProduct(false);
    resetProductForm();
  };

  const handleEditProduct = (product: Product) => {
    setIsProductFormOpen(true);
    setPendingProductDeleteId(null);
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      desc: product.desc,
      numericPrice: String(product.numericPrice),
      image: product.image,
      badge: product.badge ?? '',
      featured: Boolean(product.featured),
    });
  };

  const requestDeleteProduct = (productId: string) => {
    setPendingProductDeleteId(productId);
  };

  const cancelDeleteProduct = () => {
    setPendingProductDeleteId(null);
  };

  const confirmDeleteProduct = async (product: Product) => {
    await deleteDoc(doc(db, 'products', product.id));
    if (editingProductId === product.id) {
      resetProductForm();
    }
    setPendingProductDeleteId(null);
    setStatus('Product deleted.');
  };

  const resetBlogForm = () => {
    setBlogForm({
      ...defaultBlogForm,
      date: new Date().toLocaleDateString('en-IN'),
    });
    setEditingBlogId(null);
    setIsBlogFormOpen(false);
  };

  const handleSaveBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blogForm.title.trim()) {
      setStatus('Blog title is required.');
      return;
    }

    const imageUrls = parseLineList(blogForm.imageUrlsText);
    const videoUrls = parseLineList(blogForm.videoUrlsText);
    const links = parseLinksText(blogForm.linksText);
    const excerpt = blogForm.excerpt.trim()
      || blogForm.content.trim().slice(0, 180)
      || 'Read this article to learn more.';

    setIsSavingBlog(true);
    const payload = {
      title: blogForm.title.trim(),
      excerpt,
      category: blogForm.category.trim() || 'General',
      date: blogForm.date.trim() || new Date().toLocaleDateString('en-IN'),
      content: blogForm.content.trim(),
      imageUrls,
      videoUrls,
      links,
      updatedAt: serverTimestamp(),
    };

    if (editingBlogId) {
      await updateDoc(doc(db, 'blogs', editingBlogId), payload);
      setStatus('Blog updated.');
    } else {
      await addDoc(collection(db, 'blogs'), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      setStatus('Blog post created.');
    }
    setIsSavingBlog(false);
    resetBlogForm();
  };

  const handleEditBlog = (blog: Blog) => {
    setIsBlogFormOpen(true);
    setPendingBlogDeleteId(null);
    setEditingBlogId(blog.id);
    setBlogForm({
      title: blog.title,
      excerpt: blog.excerpt,
      category: blog.category,
      date: blog.date || new Date().toLocaleDateString('en-IN'),
      content: blog.content ?? '',
      imageUrlsText: toMultiline(blog.imageUrls),
      videoUrlsText: toMultiline(blog.videoUrls),
      linksText: linksToMultiline(blog.links),
    });
  };

  const requestDeleteBlog = (blogId: string) => {
    setPendingBlogDeleteId(blogId);
  };

  const cancelDeleteBlog = () => {
    setPendingBlogDeleteId(null);
  };

  const confirmDeleteBlog = async (blog: Blog) => {
    await deleteDoc(doc(db, 'blogs', blog.id));
    if (editingBlogId === blog.id) {
      resetBlogForm();
    }
    setPendingBlogDeleteId(null);
    setStatus('Blog deleted.');
  };

  const handleResolveTicket = async (ticket: Grievance) => {
    await updateDoc(doc(db, 'grievances', ticket.id), {
      status: 'Resolved',
      updatedAt: serverTimestamp(),
    });
    setStatus(`Ticket ${ticket.ticketId ?? ticket.id} marked as resolved.`);
  };

  const handleReplyToTicket = async (ticket: Grievance) => {
    const replyText = (replyDrafts[ticket.id] ?? '').trim();
    if (!replyText) {
      setStatus('Please enter a reply message before sending.');
      return;
    }
    setReplyingTicketId(ticket.id);
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await updateDoc(doc(db, 'grievances', ticket.id), {
        status: ticket.status === 'Resolved' ? 'Resolved' : 'In Progress',
        messages: arrayUnion({
          id: messageId,
          sender: 'admin',
          text: replyText,
          createdAt: Date.now(),
        }),
        updatedAt: serverTimestamp(),
      });
      setReplyDrafts((prev) => ({ ...prev, [ticket.id]: '' }));
      setStatus(`Reply sent for ${ticket.ticketId ?? ticket.id}.`);
    } finally {
      setReplyingTicketId(null);
    }
  };

  const resetUserEditForm = () => {
    setEditingUserId(null);
    setEditingUserEmail('');
    setUserEditForm({ name: '', phone: '', village: '', district: '', state: '', pincode: '', role: 'customer' });
  };

  const handleEditUser = (account: AdminUser) => {
    setEditingUserId(account.id);
    setEditingUserEmail(account.email);
    setUserEditForm({
      name: account.name,
      phone: account.phone,
      village: account.village,
      district: account.district,
      state: account.state,
      pincode: account.pincode,
      role: account.role,
    });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    if (!userEditForm.name.trim()) {
      setStatus('User name is required.');
      return;
    }
    setIsSavingUser(true);
    await updateDoc(doc(db, 'users', editingUserId), {
      name: userEditForm.name.trim(),
      phone: userEditForm.phone.trim(),
      village: userEditForm.village.trim(),
      district: userEditForm.district.trim(),
      state: userEditForm.state.trim(),
      pincode: userEditForm.pincode.trim(),
      role: userEditForm.role,
      updatedAt: serverTimestamp(),
    });
    setIsSavingUser(false);
    setStatus('User updated successfully.');
    resetUserEditForm();
  };

  const handleSaveCompanyInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCompany(true);
    await setDoc(
      doc(db, 'settings', 'company'),
      {
        ...about,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    setIsSavingCompany(false);
    setStatus('Company information saved.');
  };

  const handleAddHomeVideo = () => {
    const trimmed = homeVideoInput.trim();
    if (!trimmed) {
      return;
    }
    if (homeVideos.includes(trimmed)) {
      setStatus('This video link is already added.');
      setHomeVideoInput('');
      return;
    }
    setHomeVideos((prev) => [...prev, trimmed]);
    setHomeVideoInput('');
  };

  const handleRemoveHomeVideo = (videoUrl: string) => {
    setHomeVideos((prev) => prev.filter((video) => video !== videoUrl));
  };

  const handleSaveHomeVideos = async () => {
    setIsSavingHomeVideos(true);
    await setDoc(
      doc(db, 'settings', 'homepage'),
      {
        videos: homeVideos,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    setIsSavingHomeVideos(false);
    setStatus('Homepage videos saved.');
  };

  const seedInitialData = async () => {
    const batch = writeBatch(db);
    const productsSnapshot = await getDocs(collection(db, 'products'));
    const blogsSnapshot = await getDocs(collection(db, 'blogs'));
    const homepageSnapshot = await getDoc(doc(db, 'settings', 'homepage'));

    if (productsSnapshot.empty) {
      initialProducts.forEach((product) => {
        const ref = doc(collection(db, 'products'));
        batch.set(ref, {
          ...product,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    }

    if (blogsSnapshot.empty) {
      initialBlogs.forEach((blog) => {
        const ref = doc(collection(db, 'blogs'));
        batch.set(ref, {
          ...blog,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    }

    batch.set(
      doc(db, 'settings', 'company'),
      {
        ...initialAbout,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    if (!homepageSnapshot.exists()) {
      batch.set(
        doc(db, 'settings', 'homepage'),
        {
          videos: initialHomeVideos,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    await batch.commit();
    setStatus('Initial Firestore data seeded.');
  };

  return (
    <div className="absolute inset-0 flex bg-slate-50 overflow-hidden">
      <aside className="w-64 bg-primary-container text-white px-6 pb-6 pt-24 flex flex-col border-r border-white/5 shrink-0 h-full">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center font-sans font-black text-2xl">P</div>
          <div className="flex flex-col">
            <span className="font-sans font-bold text-base leading-tight">Karan Arjun Pvt. Ltd.</span>
            <span className="text-xs text-white/40 uppercase tracking-widest font-bold">Admin Console</span>
          </div>
        </div>

        <nav className="flex-grow space-y-2">
          {[
            { id: 'Dashboard', icon: Icons.LayoutDashboard, label: 'Dashboard' },
            { id: 'Orders', icon: Icons.PackageCheck, label: 'Orders' },
            { id: 'Users', icon: Icons.Users, label: 'Users' },
            { id: 'Products', icon: Icons.Box, label: 'Products' },
            { id: 'Crop Solutions', icon: Icons.Layers, label: 'Crop Solutions' },
            { id: 'Career', icon: Icons.Briefcase, label: 'Career' },
            { id: 'Blogs', icon: Icons.FileText, label: 'Blogs' },
            { id: 'Support', icon: Icons.AlertCircle, label: 'Support' },
            { id: 'Company Info', icon: Icons.Settings, label: 'Company Info' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as AdminTab)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-sans font-bold text-base ${
                activeTab === item.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-grow overflow-auto px-8 pb-8 pt-24">
        <header className="flex justify-between items-center mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
          <h1 className="text-2xl font-sans font-bold text-primary">{activeTab}</h1>
          <div className="flex items-center gap-3">
            <span className="font-sans font-bold text-sm text-primary">Admin Panel</span>
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <Icons.User className="w-5 h-5" />
            </div>
          </div>
        </header>

        {status && <p className="mb-6 text-sm font-sans font-semibold text-emerald-700">{status}</p>}

        {activeTab === 'Dashboard' && (
          <section className="space-y-8 mb-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest">Total Users</span>
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <Icons.Users className="w-4 h-4" />
                  </div>
                </div>
                <h4 className="text-3xl font-sans font-black text-primary mb-2">{users.length}</h4>
                <span className="text-emerald-600 text-xs font-sans font-bold">Active accounts</span>
              </div>
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest">Orders</span>
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <Icons.PackageCheck className="w-4 h-4" />
                  </div>
                </div>
                <h4 className="text-3xl font-sans font-black text-primary mb-2">{orders.length}</h4>
                <span className="text-blue-600 text-xs font-sans font-bold">Total placed</span>
              </div>
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest">Revenue</span>
                  <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                    <Icons.BadgeIndianRupee className="w-4 h-4" />
                  </div>
                </div>
                <h4 className="text-3xl font-sans font-black text-primary mb-2">
                  ₹{orders.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + o.totalAmount, 0).toLocaleString('en-IN')}
                </h4>
                <span className="text-emerald-600 text-xs font-sans font-bold">Paid revenue</span>
              </div>
              <div className="bg-primary-container p-8 rounded-[2rem] shadow-xl text-white">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-sans font-black text-white/40 uppercase tracking-widest">Articles</span>
                  <div className="p-2 bg-white/10 rounded-lg text-secondary-container">
                    <Icons.FileText className="w-4 h-4" />
                  </div>
                </div>
                <h4 className="text-3xl font-sans font-black mb-2">{blogs.length}</h4>
                <span className="text-emerald-400 text-xs font-sans font-bold">Published</span>
              </div>
            </div>
            <div>
              <button
                onClick={() => void seedInitialData()}
                className="bg-primary text-secondary-container px-5 py-3 rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors"
              >
                Seed Initial Data
              </button>
            </div>
          </section>
        )}

        {activeTab === 'Orders' && (
          <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
            <h2 className="font-sans text-xl font-bold text-primary mb-6">All Orders</h2>
            {orders.length === 0 ? (
              <p className="text-sm font-sans text-primary/60">No orders found yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans text-sm">
                  <thead>
                    <tr className="border-b border-primary/10">
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Customer</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Phone</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Items</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Total</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Payment</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Status</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Date</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Payment ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="border-b border-primary/5 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="py-4 font-bold text-primary">
                          <p>{order.customerName}</p>
                          <p className="text-xs text-primary/50 font-normal">{order.customerEmail}</p>
                          <p className="text-xs text-primary/50 font-normal">{order.district}, {order.state}</p>
                        </td>
                        <td className="py-4 text-primary/80">{order.customerPhone}</td>
                        <td className="py-4 text-primary/80">
                          {order.items.map((item) => (
                            <p key={item.id} className="text-xs">{item.name} × {item.quantity}</p>
                          ))}
                        </td>
                        <td className="py-4 font-bold text-primary">₹{order.totalAmount.toLocaleString('en-IN')}</td>
                        <td className="py-4">
                          <span className={`px-2 py-1 rounded text-[10px] font-sans font-bold uppercase tracking-wider ${
                            order.paymentStatus === 'paid'
                              ? 'bg-emerald-100 text-emerald-700'
                              : order.paymentStatus === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}>
                            {order.paymentStatus}
                          </span>
                        </td>
                        <td className="py-4">
                          <span className="px-2 py-1 rounded text-[10px] font-sans font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                            {order.status}
                          </span>
                        </td>
                        <td className="py-4 text-primary/70 text-xs">{order.createdAt}</td>
                        <td className="py-4 text-primary/50 text-xs font-mono">{order.razorpayPaymentId ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <PaymentDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          isAdmin
          onShipmentUpdate={async (orderId, data) => {
            await updateDoc(doc(db, 'orders', orderId), {
              ...data,
              updatedAt: serverTimestamp(),
            });
            // Reflect update in the currently-open modal
            setSelectedOrder((prev) =>
              prev ? { ...prev, ...(data as Partial<PaymentDetailOrder>) } : prev,
            );
          }}
          onCreateShiprocket={async (orderId) => {
            const fns = getFunctions();
            const createShipment = httpsCallable<{ orderId: string }, { shiprocketOrderId: string }>(
              fns, 'createShiprocketShipment',
            );
            const result = await createShipment({ orderId });
            setSelectedOrder((prev) =>
              prev
                ? {
                    ...prev,
                    shiprocketOrderId: result.data.shiprocketOrderId,
                    shipmentStatus: 'processing',
                  }
                : prev,
            );
          }}
        />

        {activeTab === 'Users' && (
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
              <h2 className="font-sans text-xl font-bold text-primary mb-6">Registered Users</h2>

              {editingUserId && (
                <form onSubmit={handleSaveUser} className="space-y-4 mb-8 p-5 rounded-2xl border border-slate-200 bg-slate-50/70">
                  <div className="flex justify-between items-center">
                    <h3 className="font-sans text-lg font-bold text-primary">Edit User</h3>
                    <button
                      type="button"
                      onClick={resetUserEditForm}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300 font-sans font-semibold hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="mb-2">
                    <span className="font-sans text-xs text-primary/50 font-semibold uppercase tracking-wider">Email (read-only)</span>
                    <p className="font-sans text-sm text-primary/80 mt-1">{editingUserEmail || '-'}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Name</label>
                      <input
                        type="text"
                        value={userEditForm.name}
                        onChange={(e) => setUserEditForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Phone</label>
                      <input
                        type="text"
                        value={userEditForm.phone}
                        onChange={(e) => setUserEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Village</label>
                      <input
                        type="text"
                        value={userEditForm.village}
                        onChange={(e) => setUserEditForm((prev) => ({ ...prev, village: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">District</label>
                      <input
                        type="text"
                        value={userEditForm.district}
                        onChange={(e) => setUserEditForm((prev) => ({ ...prev, district: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">State</label>
                      <input
                        type="text"
                        value={userEditForm.state}
                        onChange={(e) => setUserEditForm((prev) => ({ ...prev, state: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Pincode</label>
                      <input
                        type="text"
                        value={userEditForm.pincode}
                        onChange={(e) => setUserEditForm((prev) => ({ ...prev, pincode: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Role</label>
                      <select
                        value={userEditForm.role}
                        onChange={(e) => setUserEditForm((prev) => ({ ...prev, role: e.target.value as 'admin' | 'customer' }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      >
                        <option value="customer">Customer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingUser}
                    className="bg-primary text-secondary-container px-6 py-2 rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60"
                  >
                    {isSavingUser ? 'Saving…' : 'Save Changes'}
                  </button>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans text-sm">
                  <thead>
                    <tr className="border-b border-primary/10">
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Name</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Email</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Phone</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Role</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Join Date</th>
                      <th className="py-4 text-right text-primary/60 font-semibold uppercase tracking-wider text-xs">Orders</th>
                      <th className="py-4 text-right text-primary/60 font-semibold uppercase tracking-wider text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((account) => (
                      <tr
                        key={account.id}
                        className={`border-b border-primary/5 hover:bg-slate-50 transition-colors ${editingUserId === account.id ? 'bg-slate-50' : ''}`}
                      >
                        <td className="py-4 font-bold text-primary">{account.name}</td>
                        <td className="py-4 text-primary/80 text-xs">{account.email || '-'}</td>
                        <td className="py-4 text-primary/80">{account.phone || '-'}</td>
                        <td className="py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${account.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-primary/60'}`}>
                            {account.role}
                          </span>
                        </td>
                        <td className="py-4 text-primary/80">{account.joinDate}</td>
                        <td className="py-4 text-right font-bold text-primary">{account.totalOrders}</td>
                        <td className="py-4 text-right">
                          <button
                            onClick={() => editingUserId === account.id ? resetUserEditForm() : handleEditUser(account)}
                            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-sans font-semibold hover:bg-white transition-colors"
                          >
                            {editingUserId === account.id ? 'Cancel' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Products' && (
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h2 className="font-sans text-xl font-bold text-primary">Products Catalog</h2>
                <button
                  onClick={() => {
                    setIsProductFormOpen(true);
                    setEditingProductId(null);
                    setProductForm(defaultProductForm);
                    setPendingProductDeleteId(null);
                  }}
                  className="bg-primary text-secondary-container px-4 py-2 rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors shrink-0"
                >
                  Add Product
                </button>
              </div>

              {isProductFormOpen && (
                <form onSubmit={handleSaveProduct} className="space-y-4 mb-8 p-5 rounded-2xl border border-slate-200 bg-slate-50/70">
                  <div className="flex justify-between items-center">
                    <h3 className="font-sans text-lg font-bold text-primary">
                      {editingProductId ? 'Edit Product' : 'Add Product'}
                    </h3>
                    <button
                      type="button"
                      onClick={resetProductForm}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300 font-sans font-semibold hover:bg-white"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Name</label>
                      <input
                        type="text"
                        value={productForm.name}
                        onChange={(e) => setProductForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Price (number)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={productForm.numericPrice}
                        onChange={(e) => setProductForm((prev) => ({ ...prev, numericPrice: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-sans text-sm font-semibold text-primary mb-2">Description</label>
                    <textarea
                      rows={3}
                      value={productForm.desc}
                      onChange={(e) => setProductForm((prev) => ({ ...prev, desc: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Image URL / Path</label>
                      <input
                        type="text"
                        value={productForm.image}
                        onChange={(e) => setProductForm((prev) => ({ ...prev, image: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Badge</label>
                      <input
                        type="text"
                        value={productForm.badge}
                        onChange={(e) => setProductForm((prev) => ({ ...prev, badge: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                      <input
                        type="checkbox"
                        checked={productForm.featured}
                        onChange={(e) => setProductForm((prev) => ({ ...prev, featured: e.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Featured product
                    </label>
                    <div className="pt-1">
                      <button
                        type="submit"
                        disabled={isSavingProduct}
                        className="bg-primary text-secondary-container px-6 py-3 rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60"
                      >
                        {isSavingProduct ? 'Saving...' : editingProductId ? 'Update Product' : 'Create Product'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans text-sm">
                  <thead>
                    <tr className="border-b border-primary/10">
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Name</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Price</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Badge</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Featured</th>
                      <th className="py-4 text-right text-primary/60 font-semibold uppercase tracking-wider text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} className="border-b border-primary/5 hover:bg-slate-50 transition-colors">
                        <td className="py-4 font-bold text-primary">{product.name}</td>
                        <td className="py-4 text-primary/80">{product.price}</td>
                        <td className="py-4 text-primary/80">{product.badge || '-'}</td>
                        <td className="py-4 text-primary/80">{product.featured ? 'Yes' : 'No'}</td>
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleEditProduct(product)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Icons.Edit className="w-4 h-4" />
                            </button>
                            {pendingProductDeleteId === product.id ? (
                              <>
                                <button
                                  onClick={() => void confirmDeleteProduct(product)}
                                  className="px-2 py-1 text-xs rounded-lg bg-red-100 text-red-700 font-bold"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={cancelDeleteProduct}
                                  className="px-2 py-1 text-xs rounded-lg bg-slate-100 text-slate-700 font-bold"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button onClick={() => requestDeleteProduct(product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Icons.Trash className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Crop Solutions' && <CropSolutionsManager />}

        {activeTab === 'Career' && <CareerManager />}

        {activeTab === 'Blogs' && (
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h2 className="font-sans text-xl font-bold text-primary">Blog Posts</h2>
                <button
                  onClick={() => {
                    setEditingBlogId(null);
                    resetBlogForm();
                    setIsBlogFormOpen(true);
                    setPendingBlogDeleteId(null);
                  }}
                  className="bg-primary text-secondary-container px-4 py-2 rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors shrink-0"
                >
                  Add Blog
                </button>
              </div>

              {isBlogFormOpen && (
                <form onSubmit={handleSaveBlog} className="space-y-4 mb-8 p-5 rounded-2xl border border-slate-200 bg-slate-50/70">
                  <div className="flex justify-between items-center">
                    <h3 className="font-sans text-lg font-bold text-primary">
                      {editingBlogId ? 'Edit Blog Post' : 'Add Blog Post'}
                    </h3>
                    <button
                      type="button"
                      onClick={resetBlogForm}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300 font-sans font-semibold hover:bg-white"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Title</label>
                      <input
                        type="text"
                        value={blogForm.title}
                        onChange={(e) => setBlogForm((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Category</label>
                      <input
                        type="text"
                        value={blogForm.category}
                        onChange={(e) => setBlogForm((prev) => ({ ...prev, category: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Display Date</label>
                      <input
                        type="text"
                        value={blogForm.date}
                        onChange={(e) => setBlogForm((prev) => ({ ...prev, date: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Excerpt</label>
                      <input
                        type="text"
                        value={blogForm.excerpt}
                        onChange={(e) => setBlogForm((prev) => ({ ...prev, excerpt: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                        placeholder="Short preview line (optional)"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-sans text-sm font-semibold text-primary mb-2">Full Content</label>
                    <textarea
                      rows={5}
                      value={blogForm.content}
                      onChange={(e) => setBlogForm((prev) => ({ ...prev, content: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      placeholder="Write the full blog content..."
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Image URLs (one per line)</label>
                      <textarea
                        rows={4}
                        value={blogForm.imageUrlsText}
                        onChange={(e) => setBlogForm((prev) => ({ ...prev, imageUrlsText: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Video URLs (one per line)</label>
                      <textarea
                        rows={4}
                        value={blogForm.videoUrlsText}
                        onChange={(e) => setBlogForm((prev) => ({ ...prev, videoUrlsText: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-sm font-semibold text-primary mb-2">Links (Label|URL, one per line)</label>
                      <textarea
                        rows={4}
                        value={blogForm.linksText}
                        onChange={(e) => setBlogForm((prev) => ({ ...prev, linksText: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingBlog}
                    className="bg-primary text-secondary-container px-6 py-3 rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60"
                  >
                    {isSavingBlog ? 'Saving...' : editingBlogId ? 'Update Blog' : 'Create Blog'}
                  </button>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans text-sm">
                  <thead>
                    <tr className="border-b border-primary/10">
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Title</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Category</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Date</th>
                      <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Media</th>
                      <th className="py-4 text-right text-primary/60 font-semibold uppercase tracking-wider text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blogs.map((blog) => (
                      <tr key={blog.id} className="border-b border-primary/5 hover:bg-slate-50 transition-colors">
                        <td className="py-4 font-bold text-primary truncate max-w-xs">{blog.title}</td>
                        <td className="py-4 text-primary/80">{blog.category}</td>
                        <td className="py-4 text-primary/80">{blog.date}</td>
                        <td className="py-4 text-primary/80 text-xs">
                          Img:{blog.imageUrls?.length ?? 0} / Vid:{blog.videoUrls?.length ?? 0} / Link:{blog.links?.length ?? 0}
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleEditBlog(blog)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Icons.Edit className="w-4 h-4" />
                            </button>
                            {pendingBlogDeleteId === blog.id ? (
                              <>
                                <button
                                  onClick={() => void confirmDeleteBlog(blog)}
                                  className="px-2 py-1 text-xs rounded-lg bg-red-100 text-red-700 font-bold"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={cancelDeleteBlog}
                                  className="px-2 py-1 text-xs rounded-lg bg-slate-100 text-slate-700 font-bold"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button onClick={() => requestDeleteBlog(blog.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Icons.Trash className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Support' && (
          <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
            <h2 className="font-sans text-xl font-bold text-primary mb-6">User Support & Grievances</h2>
            <div className="space-y-4">
              {grievances.map((ticket) => (
                <article key={ticket.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <p className="font-sans text-[10px] uppercase tracking-wider text-primary/60 mb-1">{ticket.ticketId ?? ticket.id}</p>
                      <h3 className="font-sans font-bold text-primary text-base">{ticket.subject}</h3>
                      <p className="text-sm text-primary/70 font-sans mt-1">Raised by {ticket.userName} • {ticket.date}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-[10px] h-fit font-sans font-bold uppercase tracking-wider ${
                        ticket.status === 'Resolved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : ticket.status === 'In Progress'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </div>

                  <p className="text-sm text-primary/80">{ticket.description}</p>

                  {ticket.messages && ticket.messages.length > 0 && (
                    <div className="space-y-2">
                      {ticket.messages.map((message) => (
                        <div key={message.id} className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                          <p className="font-sans text-[10px] uppercase tracking-wider text-primary/60 mb-1">
                            {message.sender === 'admin' ? 'Admin Reply' : 'Customer Message'}
                          </p>
                          <p className="font-sans text-sm text-primary/90">{message.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {ticket.status === 'Resolved' ? (
                    <p className="font-sans text-sm text-emerald-600 font-semibold">
                      Ticket resolved — closed for further replies.
                    </p>
                  ) : (
                    <div className="flex flex-col md:flex-row gap-3">
                      <input
                        type="text"
                        value={replyDrafts[ticket.id] ?? ''}
                        onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                        placeholder="Write a reply for this ticket..."
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-sans"
                      />
                      <button
                        onClick={() => void handleReplyToTicket(ticket)}
                        disabled={replyingTicketId === ticket.id}
                        className="px-4 py-3 rounded-xl bg-primary text-secondary-container text-sm font-sans font-bold hover:bg-primary-container transition-colors disabled:opacity-60"
                      >
                        {replyingTicketId === ticket.id ? 'Sending...' : 'Send Reply'}
                      </button>
                      <button
                        onClick={() => void handleResolveTicket(ticket)}
                        className="px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-sans font-bold hover:bg-emerald-100 transition-colors"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {grievances.length === 0 && (
                <p className="text-sm font-sans text-primary/60">No grievances found.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Company Info' && (
          <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm max-w-4xl space-y-8">
            <h2 className="font-sans text-xl font-bold text-primary mb-6">Edit Company Information</h2>
            <form onSubmit={handleSaveCompanyInfo} className="space-y-4">
              <div>
                <label className="block font-sans text-sm font-semibold text-primary mb-2">Tagline</label>
                <input
                  type="text"
                  value={about.tagline}
                  onChange={(e) => setAbout({ ...about, tagline: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary/20 bg-slate-50 font-sans text-sm"
                />
              </div>
              <div>
                <label className="block font-sans text-sm font-semibold text-primary mb-2">Manufacturer</label>
                <input
                  type="text"
                  value={about.manufacturer}
                  onChange={(e) => setAbout({ ...about, manufacturer: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary/20 bg-slate-50 font-sans text-sm"
                />
              </div>
              <div>
                <label className="block font-sans text-sm font-semibold text-primary mb-2">Location</label>
                <input
                  type="text"
                  value={about.location}
                  onChange={(e) => setAbout({ ...about, location: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary/20 bg-slate-50 font-sans text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-sans text-sm font-semibold text-primary mb-2">Support Phone</label>
                  <input
                    type="text"
                    value={about.phone}
                    onChange={(e) => setAbout({ ...about, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary/20 bg-slate-50 font-sans text-sm"
                  />
                </div>
                <div>
                  <label className="block font-sans text-sm font-semibold text-primary mb-2">Certification</label>
                  <input
                    type="text"
                    value={about.certification}
                    onChange={(e) => setAbout({ ...about, certification: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary/20 bg-slate-50 font-sans text-sm"
                  />
                </div>
              </div>
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSavingCompany}
                  className="bg-primary text-secondary-container px-6 py-3 rounded-xl font-sans font-bold text-sm w-full hover:bg-primary-container transition-colors disabled:opacity-60"
                >
                  {isSavingCompany ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>

            <section className="pt-6 border-t border-slate-100">
              <h3 className="font-sans text-lg font-bold text-primary mb-4">Homepage Videos</h3>
              <p className="text-sm text-primary/70 font-sans mb-4">
                Add YouTube Shorts or YouTube video links that should appear on the home page.
              </p>
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <input
                  type="url"
                  value={homeVideoInput}
                  onChange={(e) => setHomeVideoInput(e.target.value)}
                  placeholder="https://www.youtube.com/shorts/..."
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary/20 bg-slate-50 font-sans text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddHomeVideo}
                  className="bg-primary text-secondary-container px-5 py-3 rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors"
                >
                  Add Video
                </button>
              </div>

              <div className="space-y-2 mb-5">
                {homeVideos.map((video) => (
                  <div key={video} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-xs md:text-sm text-primary/80 font-sans truncate">{video}</p>
                    <button
                      type="button"
                      onClick={() => handleRemoveHomeVideo(video)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {homeVideos.length === 0 && (
                  <p className="text-sm text-primary/60 font-sans">No videos added yet.</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => void handleSaveHomeVideos()}
                disabled={isSavingHomeVideos}
                className="bg-primary text-secondary-container px-6 py-3 rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60"
              >
                {isSavingHomeVideos ? 'Saving...' : 'Save Videos'}
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
