import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { 
  FiHome, 
  FiCalendar, 
  FiUser, 
  FiHeart, 
  FiLogOut, 
  FiMenu, 
  FiX,
  FiZap,
  FiSettings,
  FiUsers
} from 'react-icons/fi';
import toast from 'react-hot-toast';

// Navigation items configuration
const NAV_ITEMS = [
  { 
    path: '/dashboard', 
    icon: FiHome, 
    label: 'Dashboard',
    description: 'Overview & stats'
  },
  { 
    path: '/book-session', 
    icon: FiCalendar, 
    label: 'Book Session',
    description: 'Find focus partner',
    highlight: true
  },
  { 
    path: '/favorites', 
    icon: FiHeart, 
    label: 'Favorites',
    description: 'Saved partners'
  },
  { 
    path: '/profile', 
    icon: FiUser, 
    label: 'Profile',
    description: 'Settings & progress'
  }
];

// Quick actions for mobile
const QUICK_ACTIONS = [
  {
    icon: FiZap,
    label: 'Quick Match',
    path: '/book-session?tab=quick',
    color: 'primary'
  },
  {
    icon: FiUsers,
    label: 'Join Session',
    path: '/book-session?tab=join',
    color: 'success'
  }
];

function Header() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // UI State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  // Refs
  const mobileMenuRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  
  // Memoized values
  const userName = useMemo(() => {
    return user?.displayName || user?.email?.split('@')[0] || 'User';
  }, [user]);

  const userInitials = useMemo(() => {
    if (user?.displayName) {
      const names = user.displayName.split(' ');
      return names.length > 1 
        ? names[0][0] + names[names.length - 1][0] 
        : names[0].substring(0, 2);
    }
    return user?.email?.charAt(0).toUpperCase() || 'U';
  }, [user]);

  // Check if current path is active
  const isActive = useCallback((path) => {
    if (path === '/book-session') {
      return location.pathname === '/book-session';
    }
    return location.pathname === path;
  }, [location.pathname]);

  // Handle scroll effect with throttling
  useEffect(() => {
    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolled(window.scrollY > 10);
      }, 10);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      
      // Close mobile menu on desktop
      if (!mobile) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Handle click outside mobile menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/login');
      setMobileMenuOpen(false);
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Error logging out');
    }
  }, [navigate]);

  // Toggle mobile menu
  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen(!mobileMenuOpen);
  }, [mobileMenuOpen]);

  // Handle quick action
  const handleQuickAction = useCallback((action) => {
    navigate(action.path);
    setMobileMenuOpen(false);
  }, [navigate]);

  // Don't render header on auth pages
  if (!user || location.pathname === '/login' || location.pathname === '/signup') {
    return null;
  }

  return (
    <>
      {/* Main Header */}
      <header className={`modern-header ${isScrolled ? 'scrolled' : ''}`}>
        <div className="header-container">
          {/* Logo */}
          <Link to="/dashboard" className="logo">
            <div className="logo-icon">🎯</div>
            <div className="logo-text">
              <span className="logo-main">FocusMate</span>
              <span className="logo-sub">India</span>
            </div>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="desktop-nav" role="navigation">
            {NAV_ITEMS.map(({ path, icon: Icon, label, highlight }) => (
              <Link
                key={path}
                to={path}
                className={`nav-link ${isActive(path) ? 'active' : ''} ${highlight ? 'highlight' : ''}`}
                title={label}
              >
                <Icon size={20} />
                <span className="nav-label">{label}</span>
                {highlight && <span className="highlight-dot" />}
              </Link>
            ))}
          </nav>
          
          {/* User Section */}
          <div className="user-section">
            {/* User Avatar - clickable on desktop */}
            <button 
              className="user-avatar"
              onClick={() => navigate('/profile')}
              title={`${userName} - View Profile`}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={userName} />
              ) : (
                <span className="avatar-text">{userInitials}</span>
              )}
              <div className="online-indicator" />
            </button>
            
            {/* Desktop Logout */}
            <button 
              className="logout-btn desktop-only" 
              onClick={handleLogout} 
              title="Logout"
            >
              <FiLogOut size={20} />
            </button>
            
            {/* Mobile Menu Toggle */}
            <button
              className="mobile-menu-toggle"
              onClick={toggleMobileMenu}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Overlay */}
      <div 
        className={`mobile-nav-overlay ${mobileMenuOpen ? 'open' : ''}`}
        aria-hidden={!mobileMenuOpen}
      >
        <div className="mobile-nav-backdrop" onClick={() => setMobileMenuOpen(false)} />
        
        <nav 
          ref={mobileMenuRef}
          className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-nav-title"
        >
          {/* Mobile Header */}
          <div className="mobile-nav-header">
            <div className="mobile-user-info">
              <div className="mobile-avatar">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={userName} />
                ) : (
                  <span className="avatar-text">{userInitials}</span>
                )}
              </div>
              <div className="mobile-user-details">
                <h3 id="mobile-nav-title">{userName}</h3>
                <p>{user.email}</p>
              </div>
            </div>
            
            <button
              className="mobile-close-btn"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <FiX size={24} />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="mobile-quick-actions">
            <h4>Quick Actions</h4>
            <div className="quick-actions-grid">
              {QUICK_ACTIONS.map((action, index) => (
                <button
                  key={index}
                  className={`quick-action-btn ${action.color}`}
                  onClick={() => handleQuickAction(action)}
                >
                  <action.icon size={20} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Navigation Links */}
          <div className="mobile-nav-links">
            <h4>Navigation</h4>
            {NAV_ITEMS.map(({ path, icon: Icon, label, description }) => (
              <Link
                key={path}
                to={path}
                className={`mobile-nav-link ${isActive(path) ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <div className="nav-link-icon">
                  <Icon size={22} />
                </div>
                <div className="nav-link-content">
                  <span className="nav-link-label">{label}</span>
                  <span className="nav-link-desc">{description}</span>
                </div>
                {isActive(path) && <div className="active-indicator" />}
              </Link>
            ))}
          </div>

          {/* Settings & Logout */}
          <div className="mobile-nav-footer">
            <Link
              to="/settings"
              className="mobile-nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div className="nav-link-icon">
                <FiSettings size={22} />
              </div>
              <div className="nav-link-content">
                <span className="nav-link-label">Settings</span>
                <span className="nav-link-desc">Preferences</span>
              </div>
            </Link>
            
            <button 
              className="mobile-logout-btn" 
              onClick={handleLogout}
            >
              <FiLogOut size={22} />
              <span>Logout</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Bottom Navigation for Mobile */}
      {isMobile && (
        <nav className="bottom-nav" role="navigation">
          {NAV_ITEMS.slice(0, 4).map(({ path, icon: Icon, label }) => (
            <Link
              key={path}
              to={path}
              className={`bottom-nav-item ${isActive(path) ? 'active' : ''}`}
              title={label}
            >
              <Icon size={20} />
              <span className="bottom-nav-label">{label}</span>
              {isActive(path) && <div className="bottom-active-indicator" />}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

export default Header;