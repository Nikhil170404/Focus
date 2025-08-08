import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { FiHome, FiCalendar, FiUser, FiHeart, FiLogOut, FiMenu, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';

function Header() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const mobileMenuRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };

    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleResize);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Disable body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/login');
      setMobileMenuOpen(false);
    } catch (error) {
      toast.error('Error logging out');
    }
  };

  const isActive = (path) => location.pathname === path;

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);

  const navItems = [
    { path: '/dashboard', icon: FiHome, label: 'Dashboard' },
    { path: '/book-session', icon: FiCalendar, label: 'Book Session' },
    { path: '/favorites', icon: FiHeart, label: 'Favorites' },
    { path: '/profile', icon: FiUser, label: 'Profile' }
  ];

  return (
    <>
      <header className={`compact-header ${isScrolled ? 'scrolled' : ''}`}>
        <div className="header-content">
          <Link to="/" className="compact-logo" onClick={closeMobileMenu}>
            <span className="logo-icon">🎯</span>
            <span className="logo-text">FocusMate</span>
            <span className="logo-text-mobile">FM</span>
          </Link>
          
          {user && (
            <>
              {/* Desktop Navigation */}
              <nav className="desktop-nav">
                {navItems.map(({ path, icon: Icon, label }) => (
                  <Link
                    key={path}
                    to={path}
                    className={`nav-link ${isActive(path) ? 'active' : ''}`}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </Link>
                ))}
              </nav>
              
              {/* User Section */}
              <div className="user-section">
                {/* User Avatar */}
                <div className="user-avatar" onClick={() => navigate('/profile')}>
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName} />
                  ) : (
                    <span className="avatar-text">
                      {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                
                {/* Desktop Logout */}
                <button 
                  className="logout-btn desktop-only" 
                  onClick={handleLogout} 
                  title="Logout"
                >
                  <FiLogOut size={18} />
                </button>
                
                {/* Mobile Menu Toggle */}
                <button
                  className="mobile-menu-btn"
                  onClick={toggleMobileMenu}
                  aria-label="Toggle menu"
                  aria-expanded={mobileMenuOpen}
                >
                  {mobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Mobile Navigation Overlay */}
      {user && (
        <div 
          className={`mobile-nav-overlay ${mobileMenuOpen ? 'open' : ''}`}
          aria-hidden={!mobileMenuOpen}
        >
          <div 
            className="mobile-nav-backdrop"
            onClick={closeMobileMenu}
          />
          
          <div 
            ref={mobileMenuRef}
            className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
          >
            <div className="mobile-nav-content">
              {/* Mobile Header */}
              <div className="mobile-nav-header">
                <h2 id="mobile-menu-title">Menu</h2>
                <button
                  className="mobile-close-btn"
                  onClick={closeMobileMenu}
                  aria-label="Close menu"
                >
                  <FiX size={24} />
                </button>
              </div>

              {/* Mobile User Info */}
              <div className="mobile-user-info">
                <div className="mobile-avatar">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName} />
                  ) : (
                    <span className="avatar-text">
                      {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="mobile-user-details">
                  <p className="user-name">{user.displayName || 'Focus Warrior'}</p>
                  <p className="user-email">{user.email}</p>
                </div>
              </div>
              
              {/* Mobile Navigation Links */}
              <nav className="mobile-nav-links" role="navigation">
                {navItems.map(({ path, icon: Icon, label }) => (
                  <Link
                    key={path}
                    to={path}
                    className={`mobile-nav-link ${isActive(path) ? 'active' : ''}`}
                    onClick={closeMobileMenu}
                  >
                    <Icon size={22} />
                    <span>{label}</span>
                    {isActive(path) && <span className="active-indicator" />}
                  </Link>
                ))}
                
                {/* Mobile Logout */}
                <button 
                  className="mobile-logout-btn" 
                  onClick={handleLogout}
                >
                  <FiLogOut size={22} />
                  <span>Logout</span>
                </button>
              </nav>

              {/* Mobile Footer */}
              <div className="mobile-nav-footer">
                <p>Made with ❤️ in India</p>
                <p>© 2024 FocusMate India</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation for Mobile */}
      {user && location.pathname !== '/login' && location.pathname !== '/signup' && (
        <nav className="bottom-nav mobile-only">
          {navItems.map(({ path, icon: Icon, label }) => (
            <Link
              key={path}
              to={path}
              className={`bottom-nav-item ${isActive(path) ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

export default Header;