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
    } catch (error) {
      toast.error('Error logging out');
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <span>🎯</span>
          FocusMate India
        </Link>
        
        {user && (
          <>
            <nav className={`nav-menu ${mobileMenuOpen ? 'mobile-open' : ''}`}>
              <Link
                to="/dashboard"
                className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <FiHome /> Dashboard
              </Link>
              <Link
                to="/book-session"
                className={`nav-link ${isActive('/book-session') ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <FiCalendar /> Book Session
              </Link>
              <Link
                to="/favorites"
                className={`nav-link ${isActive('/favorites') ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <FiHeart /> Favorites
              </Link>
              <Link
                to="/profile"
                className={`nav-link ${isActive('/profile') ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <FiUser /> Profile
              </Link>
            </nav>
            
            <div className="user-info">
              <div className="user-avatar">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} />
                ) : (
                  user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()
                )}
              </div>
              <button className="logout-btn" onClick={handleLogout}>
                <FiLogOut />
              </button>
              <button
                className="mobile-menu-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <FiX /> : <FiMenu />}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export default Header;