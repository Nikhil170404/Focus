import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateProfile, updatePassword } from 'firebase/auth';
import { db, auth } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import EditProfile from './EditProfile';
import { FiUser, FiMail, FiCalendar, FiAward, FiSettings } from 'react-icons/fi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

function UserProfile() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState([]);

  useEffect(() => {
    fetchUserData();
    calculateAchievements();
  }, [user]);

  const fetchUserData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data());
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      toast.error('Failed to load profile');
    }
    setLoading(false);
  };

  const calculateAchievements = () => {
    const userAchievements = [];
    
    if (userData?.totalSessions >= 1) {
      userAchievements.push({
        icon: '🎯',
        title: 'First Focus',
        description: 'Completed your first session'
      });
    }
    
    if (userData?.totalSessions >= 10) {
      userAchievements.push({
        icon: '⭐',
        title: 'Rising Star',
        description: 'Completed 10 sessions'
      });
    }
    
    if (userData?.totalSessions >= 50) {
      userAchievements.push({
        icon: '🏆',
        title: 'Focus Champion',
        description: 'Completed 50 sessions'
      });
    }
    
    if (userData?.totalMinutes >= 1000) {
      userAchievements.push({
        icon: '⏰',
        title: 'Time Master',
        description: '1000+ minutes of focus'
      });
    }
    
    if (userData?.streak >= 7) {
      userAchievements.push({
        icon: '🔥',
        title: 'Week Warrior',
        description: '7 day streak'
      });
    }
    
    if (userData?.streak >= 30) {
      userAchievements.push({
        icon: '💎',
        title: 'Monthly Master',
        description: '30 day streak'
      });
    }
    
    setAchievements(userAchievements);
  };

  const handleUpdateProfile = async (updatedData) => {
    try {
      // Update Firebase Auth profile
      if (updatedData.displayName !== user.displayName) {
        await updateProfile(auth.currentUser, {
          displayName: updatedData.displayName
        });
      }
      
      // Update Firestore document
      await updateDoc(doc(db, 'users', user.uid), updatedData);
      
      setUserData({ ...userData, ...updatedData });
      setIsEditing(false);
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <EditProfile
        userData={userData}
        onSave={handleUpdateProfile}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <div className="profile-avatar-section">
          <div className="profile-avatar-large">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} />
            ) : (
              <div className="avatar-placeholder">
                {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <button className="btn-secondary" onClick={() => setIsEditing(true)}>
            <FiSettings /> Edit Profile
          </button>
        </div>
        
        <div className="profile-info">
          <h1>{userData?.name || user.displayName || 'Focus Warrior'}</h1>
          <p className="profile-bio">{userData?.bio || 'No bio added yet'}</p>
          
          <div className="profile-details">
            <div className="detail-item">
              <FiMail />
              <span>{user.email}</span>
            </div>
            <div className="detail-item">
              <FiCalendar />
              <span>Joined {format(new Date(userData?.createdAt || Date.now()), 'MMMM yyyy')}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="profile-stats">
        <div className="stat-box">
          <div className="stat-value">{userData?.totalSessions || 0}</div>
          <div className="stat-label">Total Sessions</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{Math.floor((userData?.totalMinutes || 0) / 60)}h</div>
          <div className="stat-label">Focus Hours</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{userData?.streak || 0}</div>
          <div className="stat-label">Day Streak</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{userData?.favorites || 0}</div>
          <div className="stat-label">Favorites</div>
        </div>
      </div>
      
      <div className="achievements-section">
        <h2><FiAward /> Achievements</h2>
        <div className="achievements-grid">
          {achievements.length > 0 ? (
            achievements.map((achievement, index) => (
              <div key={index} className="achievement-card">
                <div className="achievement-icon">{achievement.icon}</div>
                <div className="achievement-content">
                  <h3>{achievement.title}</h3>
                  <p>{achievement.description}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="no-achievements">Complete sessions to unlock achievements!</p>
          )}
        </div>
      </div>
      
      <div className="preferences-section">
        <h2>Preferences</h2>
        <div className="preferences-list">
          <div className="preference-item">
            <label>
              <input
                type="checkbox"
                checked={userData?.preferences?.sessionReminders || false}
                onChange={(e) => handleUpdateProfile({
                  preferences: {
                    ...userData?.preferences,
                    sessionReminders: e.target.checked
                  }
                })}
              />
              Session Reminders
            </label>
          </div>
          <div className="preference-item">
            <label>
              <input
                type="checkbox"
                checked={userData?.preferences?.emailNotifications || false}
                onChange={(e) => handleUpdateProfile({
                  preferences: {
                    ...userData?.preferences,
                    emailNotifications: e.target.checked
                  }
                })}
              />
              Email Notifications
            </label>
          </div>
          <div className="preference-item">
            <label>
              <input
                type="checkbox"
                checked={userData?.preferences?.soundEnabled || false}
                onChange={(e) => handleUpdateProfile({
                  preferences: {
                    ...userData?.preferences,
                    soundEnabled: e.target.checked
                  }
                })}
              />
              Sound Effects
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserProfile;