import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile, signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../../config/firebase';
import { FcGoogle } from 'react-icons/fc';
import { FiUser, FiMail, FiLock } from 'react-icons/fi';
import toast from 'react-hot-toast';

function Signup() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleEmailSignup = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match!');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters!');
      return;
    }

    setLoading(true);
    try {
      // Create user account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      // Update display name
      await updateProfile(userCredential.user, {
        displayName: formData.name
      });

      // Create user document in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        name: formData.name,
        email: formData.email,
        photoURL: null,
        createdAt: new Date(),
        totalSessions: 0,
        totalMinutes: 0,
        streak: 0,
        bio: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        preferences: {
          sessionReminders: true,
          emailNotifications: true,
          soundEnabled: true
        }
      });

      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.message);
    }
    setLoading(false);
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      
      // Check if user document exists, if not create it
      await setDoc(doc(db, 'users', result.user.uid), {
        uid: result.user.uid,
        name: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL,
        createdAt: new Date(),
        totalSessions: 0,
        totalMinutes: 0,
        streak: 0,
        bio: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        preferences: {
          sessionReminders: true,
          emailNotifications: true,
          soundEnabled: true
        }
      }, { merge: true });

      toast.success('Welcome to FocusMate India!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="auth-title">Create Account</h2>
        <p className="auth-subtitle">Join India's #1 virtual coworking community</p>
        
        <form onSubmit={handleEmailSignup} className="auth-form">
          <div className="input-group">
            <FiUser className="input-icon" />
            <input
              type="text"
              name="name"
              placeholder="Full Name"
              value={formData.name}
              onChange={handleChange}
              required
              className="auth-input"
            />
          </div>
          
          <div className="input-group">
            <FiMail className="input-icon" />
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              className="auth-input"
            />
          </div>
          
          <div className="input-group">
            <FiLock className="input-icon" />
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
              className="auth-input"
            />
          </div>
          
          <div className="input-group">
            <FiLock className="input-icon" />
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              className="auth-input"
            />
          </div>
          
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>
        
        <div className="divider">
          <span>OR</span>
        </div>
        
        <button onClick={handleGoogleSignup} className="btn-google" disabled={loading}>
          <FcGoogle size={24} />
          Continue with Google
        </button>
        
        <p className="auth-footer">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;