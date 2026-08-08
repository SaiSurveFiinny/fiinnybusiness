import React, { Component, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Navbar, { Footer } from './components/Layout';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetailPage from './pages/ProductDetailPage';
import Profile from './pages/Profile';
import Auth from './pages/Auth';
import Technical from './pages/Technical';
import Benefits from './pages/Benefits';
import Admin from './pages/Admin';
import About from './pages/About';
import WhoWeAre from './pages/WhoWeAre';
import WhatWeDo from './pages/WhatWeDo';
import CropSolutionsLanding from './pages/CropSolutionsLanding';
import CropCategoryPage from './pages/CropCategoryPage';
import CropDetailPage from './pages/CropDetailPage';
import CareerLanding from './pages/CareerLanding';
import JobDetailPage from './pages/JobDetailPage';
import FarmerSuccessLanding from './pages/FarmerSuccessLanding';
import StoryDetailPage from './pages/StoryDetailPage';
import CaseStudyDetailPage from './pages/CaseStudyDetailPage';
import VideoLibraryPage from './pages/VideoLibraryPage';
import VideoDetailPage from './pages/VideoDetailPage';
import TestimonialsListingPage from './pages/TestimonialsListingPage';
import TestimonialDetailPage from './pages/TestimonialDetailPage';
import ResourcesLanding from './pages/ResourcesLanding';
import BlogListingPage from './pages/BlogListingPage';
import ArticleListingPage from './pages/ArticleListingPage';
import ArticleDetailPage from './pages/ArticleDetailPage';
import CropGuideListingPage from './pages/CropGuideListingPage';
import CropGuideDetailPage from './pages/CropGuideDetailPage';
import DownloadsPage from './pages/DownloadsPage';
import FaqsPage from './pages/FaqsPage';
import SeasonalAdvicePage from './pages/SeasonalAdvicePage';
import ResourceVideosPage from './pages/ResourceVideosPage';
import NewsListingPage from './pages/NewsListingPage';
import NewsDetailPage from './pages/NewsDetailPage';
import AnnouncementListingPage from './pages/AnnouncementListingPage';
import AnnouncementDetailPage from './pages/AnnouncementDetailPage';
import Support from './pages/Support';
import Contact from './pages/Contact';
import PlaceholderPage from './pages/PlaceholderPage';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { ProtectedRoute } from './components/ProtectedRoute';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-surface px-6 text-center">
          <p className="font-sans text-lg font-semibold text-primary">Something went wrong loading this page.</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-6 py-3 bg-primary text-white rounded-xl font-sans font-bold hover:bg-primary-container transition-colors"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen flex flex-col bg-surface overflow-x-hidden">
      <Navbar />
      <main className="flex-grow">
        {children}
      </main>
      {!isAdminRoute && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          <Router>
            <ScrollToTop />
            <LayoutWrapper>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/products" element={<Shop />} />
                <Route path="/products/:productSlug" element={<ProductDetailPage />} />
                {/* /shop renamed to /products for a clean Products > Product Detail URL hierarchy; redirect preserves old bookmarked/indexed links and search rankings. */}
                <Route path="/shop" element={<Navigate to="/products" replace />} />
                {/* /blog moved to /resources/blogs as part of the Resources Center migration; redirect preserves old bookmarked/indexed links. */}
                <Route path="/blog" element={<Navigate to="/resources/blogs" replace />} />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route path="/auth" element={<Auth />} />
                <Route path="/technical" element={<Technical />} />
                <Route path="/benefits" element={<Benefits />} />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Admin />
                    </ProtectedRoute>
                  }
                />
                <Route path="/about" element={<About />} />
                <Route path="/who-we-are" element={<WhoWeAre />} />
                <Route path="/what-we-do" element={<WhatWeDo />} />
                <Route
                  path="/research-innovation"
                  element={<PlaceholderPage title="Research & Innovation" description="The science behind our agricultural solutions." />}
                />
                <Route path="/farmer-success" element={<FarmerSuccessLanding />} />
                <Route path="/farmer-success/story/:storySlug" element={<StoryDetailPage />} />
                <Route path="/farmer-success/case-study/:caseStudySlug" element={<CaseStudyDetailPage />} />
                <Route path="/farmer-success/videos" element={<VideoLibraryPage />} />
                <Route path="/farmer-success/video/:videoSlug" element={<VideoDetailPage />} />
                <Route path="/farmer-success/testimonials" element={<TestimonialsListingPage />} />
                <Route path="/farmer-success/testimonials/:testimonialSlug" element={<TestimonialDetailPage />} />
                <Route path="/crop-solutions" element={<CropSolutionsLanding />} />
                <Route path="/crop-solutions/:categorySlug" element={<CropCategoryPage />} />
                <Route path="/crop-solutions/:categorySlug/:cropSlug" element={<CropDetailPage />} />
                <Route path="/resources" element={<ResourcesLanding />} />
                <Route path="/resources/blogs" element={<BlogListingPage />} />
                <Route path="/resources/articles" element={<ArticleListingPage />} />
                <Route path="/resources/articles/:articleSlug" element={<ArticleDetailPage />} />
                <Route path="/resources/guides" element={<CropGuideListingPage />} />
                <Route path="/resources/guides/:guideSlug" element={<CropGuideDetailPage />} />
                <Route path="/resources/downloads" element={<DownloadsPage />} />
                <Route path="/resources/faqs" element={<FaqsPage />} />
                <Route path="/resources/seasonal-advice" element={<SeasonalAdvicePage />} />
                <Route path="/resources/videos" element={<ResourceVideosPage />} />
                <Route path="/resources/news" element={<NewsListingPage />} />
                <Route path="/resources/news/:newsSlug" element={<NewsDetailPage />} />
                <Route path="/resources/announcements" element={<AnnouncementListingPage />} />
                <Route path="/resources/announcements/:announcementSlug" element={<AnnouncementDetailPage />} />
                <Route path="/career" element={<CareerLanding />} />
                <Route path="/career/:jobSlug" element={<JobDetailPage />} />
                <Route path="/support" element={<Support />} />
                <Route path="/contact" element={<Contact />} />
              </Routes>
              <CartDrawer />
              <CheckoutModal />
            </LayoutWrapper>
          </Router>
        </CartProvider>
      </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
