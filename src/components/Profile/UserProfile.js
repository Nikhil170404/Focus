import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { 
  FiUser, 
  FiMail, 
  FiCalendar, 
  FiAward, 
  FiEdit3,
  FiBook,
  FiTarget,
  FiTrendingUp,
  FiClock,
  FiCheck
} from 'react-icons/fi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

function UserProfile() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editData, setEditData] = useState({
    name: '',
    bio: '',
    studyGoal: '',
    targetExam: '',
    dailyTarget: 4
  });

  const examOptions = [
    'JEE Main',
    'JEE Advanced', 
    'NEET',
    'GATE',
    'CAT',
    'Board Exams',
    'University Exams',
    'Other'
  ];

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);
        setEditData({
          name: data.name || user.displayName || '',
          bio: data.bio || '',
          studyGoal: data.studyGoal || '',
          targetExam: data.targetExam || '',
          dailyTarget: data.dailyTarget || 4
        });
      } else {
        // Create user document if it doesn't exist
        const newUserData = {
          uid: user.uid,
          name: user.displayName || '',
          email: user.email,
          photoURL: user.photoURL,
          createdAt: new Date(),
          totalSessions: 0,
          totalMinutes: 0,
          currentStreak: 0,
          level: 1,
          bio: '',
          studyGoal: '',
          targetExam: '',
          dailyTarget: 4
        };
        await setDoc(doc(db, 'users', user.uid), newUserData);
        setUserData(newUserData);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      toast.error('Failed to load profile');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    try {
      // Update Firebase Auth
      if (editData.name !== user.displayName) {
        await updateProfile(auth.currentUser, {
          displayName: editData.name
        });
      }
      
      // Update Firestore
      await setDoc(doc(db, 'users', user.uid), {
        ...editData,
        updatedAt: new Date()
      }, { merge: true });
      
      setUserData({ ...userData, ...editData });
      setIsEditing(false);
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  const getLevel = (level) => {
    if (level >= 20) return { title: "Master", color: "#8B5CF6", icon: "👑" };
    if (level >= 10) return { title: "Expert", color: "#10B981", icon: "🎓" };
    if (level >= 5) return { title: "Intermediate", color: "#F59E0B", icon: "⭐" };
    return { title: "Beginner", color: "#6B7280", icon: "🌱" };
  };

  const achievements = [
    { 
      icon: '🎯', 
      title: 'First Focus', 
      earned: userData?.totalSessions >= 1,
      requirement: 'Complete 1 session'
    },
    { 
      icon: '⭐', 
      title: 'Rising Star', 
      earned: userData?.totalSessions >= 10,
      requirement: 'Complete 10 sessions'
    },
    { 
      icon: '🔥', 
      title: 'Week Warrior', 
      earned: userData?.currentStreak >= 7,
      requirement: '7 day streak'
    },
    { 
      icon: '🏆', 
      title: 'Champion', 
      earned: userData?.totalSessions >= 50,
      requirement: 'Complete 50 sessions'
    }
  ];

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  const levelInfo = getLevel(userData?.level || 1);

  return (
    <div className="profile-container">
      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar-section">
          <div className="profile-avatar-large">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} />
            ) : (
              <div className="avatar-placeholder">
                {user.displayName?.charAt(0) || user.email?.charAt(0)}
              </div>
            )}
          </div>
          
          <div className="level-badge" style={{ backgroundColor: levelInfo.color }}>
            {levelInfo.icon} Level {userData?.level || 1}
          </div>
          
          <button 
            className="btn-secondary"
            onClick={() => setIsEditing(!isEditing)}
          >
            <FiEdit3 /> {isEditing ? 'Cancel' : 'Edit'}
          </button>
        </div>
        
        <div className="profile-info">
          {isEditing ? (
            <div className="edit-form">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => setEditData({...editData, name: e.target.value})}
                  placeholder="Your name"
                />
              </div>

              <div className="form-group">
                <label>Bio</label>
                <textarea
                  value={editData.bio}
                  onChange={(e) => setEditData({...editData, bio: e.target.value})}
                  placeholder="Tell us about yourself..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>Target Exam</label>
                <select
                  value={editData.targetExam}
                  onChange={(e) => setEditData({...editData, targetExam: e.target.value})}
                >
                  <option value="">Select Exam</option>
                  {examOptions.map(exam => (
                    <option key={exam} value={exam}>{exam}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Study Goal</label>
                <input
                  type="text"
                  value={editData.studyGoal}
                  onChange={(e) => setEditData({...editData, studyGoal: e.target.value})}
                  placeholder="Your main goal..."
                />
              </div>

              <div className="form-group">
                <label>Daily Target (hours)</label>
                <select
                  value={editData.dailyTarget}
                  onChange={(e) => setEditData({...editData, dailyTarget: parseInt(e.target.value)})}
                >
                  {[2, 3, 4, 5, 6, 7, 8].map(hours => (
                    <option key={hours} value={hours}>{hours} hours</option>
                  ))}
                </select>
              </div>

              <button className="btn-primary" onClick={handleSave}>
                <FiCheck /> Save Changes
              </button>
            </div>
          ) : (
            <div className="profile-display">
              <h1>{userData?.name || user.displayName || 'Student'}</h1>
              <p className="profile-bio">{userData?.bio || 'No bio yet'}</p>
              
              <div className="profile-details">
                <div className="detail-item">
                  <FiMail /> {user.email}
                </div>
                {userData?.targetExam && (
                  <div className="detail-item">
                    <FiTarget /> Target: {userData.targetExam}
                  </div>
                )}
                {userData?.studyGoal && (
                  <div className="detail-item">
                    <FiBook /> Goal: {userData.studyGoal}
                  </div>
                )}
                <div className="detail-item">
                  <FiCalendar /> Joined {format(new Date(userData?.createdAt || Date.now()), 'MMMM yyyy')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Stats */}
      <div className="profile-stats">
        <div className="stat-box">
          <div className="stat-value">{userData?.totalSessions || 0}</div>
          <div className="stat-label">Sessions</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{Math.floor((userData?.totalMinutes || 0) / 60)}h</div>
          <div className="stat-label">Focus Hours</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{userData?.currentStreak || 0}</div>
          <div className="stat-label">Day Streak</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{userData?.level || 1}</div>
          <div className="stat-label">Level</div>
        </div>
      </div>

      {/* Progress */}
      <div className="study-progress">
        <h2><FiTrendingUp /> Progress</h2>
        <div className="progress-cards">
          <div className="progress-card">
            <h4>Daily Target</h4>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${Math.min(100, ((userData?.todayMinutes || 0) / (userData?.dailyTarget * 60 || 240)) * 100)}%` }}
              />
            </div>
            <span>{Math.floor((userData?.todayMinutes || 0) / 60)} / {userData?.dailyTarget || 4} hours today</span>
          </div>
          
          <div className="progress-card">
            <h4>Next Level</h4>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${((userData?.totalSessions || 0) % 10) * 10}%` }}
              />
            </div>
            <span>{(userData?.totalSessions || 0) % 10} / 10 sessions to level up</span>
          </div>
        </div>
      </div>
      
      {/* Achievements */}
      <div className="achievements-section">
        <h2><FiAward /> Achievements</h2>
        <div className="achievements-grid">
          {achievements.map((achievement, index) => (
            <div 
              key={index} 
              className={`achievement-card ${achievement.earned ? 'earned' : 'locked'}`}
            >
              <div className="achievement-icon">{achievement.icon}</div>
              <h3>{achievement.title}</h3>
              <p>{achievement.requirement}</p>
              {achievement.earned && <FiCheck className="earned-check" />}
            </div>
          ))}
        </div>
      </div>

      {/* Study Preferences */}
      <div className="preferences-section">
        <h2><FiClock /> Preferences</h2>
        <div className="preferences-grid">
          <div className="preference-item">
            Daily Target: {userData?.dailyTarget || 4} hours
          </div>
          {userData?.targetExam && (
            <div className="preference-item">
              Preparing for: {userData.targetExam}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserProfile;