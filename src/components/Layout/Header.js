import React, { useState } from 'react';
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

  return (
    <header className="compact-header">
      <div className="header-content">
        <Link to="/" className="compact-logo" onClick={closeMobileMenu}>
          <span className="logo-icon">🎯</span>
          <span className="logo-text">FocusMate</span>
        </Link>
        
        {user && (
          <>
            {/* Desktop Navigation */}
            <nav className="desktop-nav">
              <Link
                to="/dashboard"
                className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
              >
                <FiHome size={18} />
                <span>Dashboard</span>
              </Link>
              <Link
                to="/book-session"
                className={`nav-link ${isActive('/book-session') ? 'active' : ''}`}
              >
                <FiCalendar size={18} />
                <span>Book</span>
              </Link>
              <Link
                to="/favorites"
                className={`nav-link ${isActive('/favorites') ? 'active' : ''}`}
              >
                <FiHeart size={18} />
                <span>Favorites</span>
              </Link>
              <Link
                to="/profile"
                className={`nav-link ${isActive('/profile') ? 'active' : ''}`}
              >
                <FiUser size={18} />
                <span>Profile</span>
              </Link>
            </nav>
            
            {/* User Section */}
            <div className="user-section">
              <div className="user-avatar">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} />
                ) : (
                  <span className="avatar-text">
                    {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              
              {/* Desktop Logout */}
              <button className="logout-btn desktop-only" onClick={handleLogout} title="Logout">
                <FiLogOut size={18} />
              </button>
              
              {/* Mobile Menu Toggle */}
              <button
                className="mobile-menu-btn"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
              </button>
            </div>
            
            {/* Mobile Navigation */}
            <div className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`}>
              <div className="mobile-nav-content">
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
                
                <nav className="mobile-nav-links">
                  <Link
                    to="/dashboard"
                    className={`mobile-nav-link ${isActive('/dashboard') ? 'active' : ''}`}
                    onClick={closeMobileMenu}
                  >
                    <FiHome size={20} />
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    to="/book-session"
                    className={`mobile-nav-link ${isActive('/book-session') ? 'active' : ''}`}
                    onClick={closeMobileMenu}
                  >
                    <FiCalendar size={20} />
                    <span>Book Session</span>
                  </Link>
                  <Link
                    to="/favorites"
                    className={`mobile-nav-link ${isActive('/favorites') ? 'active' : ''}`}
                    onClick={closeMobileMenu}
                  >
                    <FiHeart size={20} />
                    <span>Favorites</span>
                  </Link>
                  <Link
                    to="/profile"
                    className={`mobile-nav-link ${isActive('/profile') ? 'active' : ''}`}
                    onClick={closeMobileMenu}
                  >
                    <FiUser size={20} />
                    <span>Profile</span>
                  </Link>
                  <button className="mobile-logout-btn" onClick={handleLogout}>
                    <FiLogOut size={20} />
                    <span>Logout</span>
                  </button>
                </nav>
              </div>
              
              {/* Mobile Menu Overlay */}
              <div 
                className="mobile-nav-overlay" 
                onClick={closeMobileMenu}
              />
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export default Header;