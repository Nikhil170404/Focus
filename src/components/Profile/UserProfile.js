import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { 
  FiUser, 
  FiMail, 
  FiCalendar, 
  FiAward, 
  FiSettings, 
  FiEdit3,
  FiBook,
  FiTarget,
  FiTrendingUp,
  FiMapPin,
  FiClock
} from 'react-icons/fi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

function UserProfile() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState([]);
  const [editData, setEditData] = useState({
    name: '',
    bio: '',
    studyGoal: '',
    targetExam: '',
    currentClass: '',
    subjects: [],
    dailyTarget: 4,
    preferredStudyTime: 'morning',
    city: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });

  const examOptions = [
    'JEE Main',
    'JEE Advanced', 
    'NEET',
    'AIIMS',
    'BITSAT',
    'VITEEE',
    'COMEDK',
    'MHT CET',
    'WBJEE',
    'KCET',
    'EAMCET',
    'GATE',
    'CAT',
    'CLAT',
    'Other Competitive Exam',
    'Board Exams',
    'Personal Development'
  ];

  const classOptions = [
    'Class 11',
    'Class 12',
    'Class 12 Passed (Drop Year)',
    'Undergraduate',
    'Postgraduate',
    'Working Professional'
  ];

  const subjectOptions = [
    'Physics',
    'Chemistry', 
    'Mathematics',
    'Biology',
    'English',
    'Computer Science',
    'Economics',
    'History',
    'Geography',
    'Political Science',
    'Hindi',
    'Sanskrit',
    'Other'
  ];

  const studyTimeOptions = [
    { value: 'early_morning', label: 'Early Morning (5-8 AM)' },
    { value: 'morning', label: 'Morning (8-12 PM)' },
    { value: 'afternoon', label: 'Afternoon (12-5 PM)' },
    { value: 'evening', label: 'Evening (5-8 PM)' },
    { value: 'night', label: 'Night (8-11 PM)' },
    { value: 'late_night', label: 'Late Night (11 PM+)' }
  ];

  const indianCities = [
    'Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata',
    'Pune', 'Ahmedabad', 'Surat', 'Jaipur', 'Lucknow', 'Kanpur',
    'Nagpur', 'Indore', 'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara',
    'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut',
    'Rajkot', 'Kalyan-Dombivali', 'Vasai-Virar', 'Varanasi', 'Srinagar',
    'Kota', 'Other'
  ];

  useEffect(() => {
    fetchUserData();
  }, [user]);

  useEffect(() => {
    if (userData) {
      calculateAchievements();
      setEditData({
        name: userData.name || user.displayName || '',
        bio: userData.bio || '',
        studyGoal: userData.studyGoal || '',
        targetExam: userData.targetExam || '',
        currentClass: userData.currentClass || '',
        subjects: userData.subjects || [],
        dailyTarget: userData.dailyTarget || 4,
        preferredStudyTime: userData.preferredStudyTime || 'morning',
        city: userData.city || '',
        timezone: userData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    }
  }, [userData, user]);

  const fetchUserData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data());
      } else {
        // Create default user data for new users
        const defaultData = {
          uid: user.uid,
          name: user.displayName || '',
          email: user.email,
          photoURL: user.photoURL,
          createdAt: new Date(),
          totalSessions: 0,
          totalMinutes: 0,
          currentStreak: 0,
          level: 1,
          studyGoal: '',
          targetExam: '',
          currentClass: '',
          subjects: [],
          dailyTarget: 4,
          preferredStudyTime: 'morning',
          city: '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        setUserData(defaultData);
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
        description: 'Completed your first study session',
        date: 'Recently'
      });
    }
    
    if (userData?.totalSessions >= 10) {
      userAchievements.push({
        icon: '⭐',
        title: 'Rising Scholar',
        description: 'Completed 10 study sessions',
        date: 'This month'
      });
    }
    
    if (userData?.totalSessions >= 50) {
      userAchievements.push({
        icon: '🏆',
        title: 'Study Champion',
        description: 'Completed 50 study sessions',
        date: 'Achievement unlocked'
      });
    }
    
    if (userData?.totalMinutes >= 1500) { // 25+ hours
      userAchievements.push({
        icon: '⏰',
        title: 'Time Master',
        description: '25+ hours of focused study',
        date: 'Milestone reached'
      });
    }
    
    if (userData?.currentStreak >= 7) {
      userAchievements.push({
        icon: '🔥',
        title: 'Week Warrior',
        description: '7 day study streak',
        date: 'Keep it up!'
      });
    }
    
    if (userData?.currentStreak >= 30) {
      userAchievements.push({
        icon: '💎',
        title: 'Monthly Master',
        description: '30 day study streak',
        date: 'Incredible!'
      });
    }

    // India-specific achievements
    if (userData?.targetExam?.includes('JEE')) {
      userAchievements.push({
        icon: '🔬',
        title: 'JEE Aspirant',
        description: 'Preparing for JEE',
        date: 'All the best!'
      });
    }

    if (userData?.targetExam?.includes('NEET')) {
      userAchievements.push({
        icon: '🩺',
        title: 'NEET Warrior',
        description: 'Future doctor in making',
        date: 'Keep studying!'
      });
    }
    
    setAchievements(userAchievements);
  };

  const handleSave = async () => {
    try {
      // Update Firebase Auth profile
      if (editData.name !== user.displayName) {
        await updateProfile(auth.currentUser, {
          displayName: editData.name
        });
      }
      
      // Update Firestore document
      await updateDoc(doc(db, 'users', user.uid), {
        ...editData,
        updatedAt: new Date()
      });
      
      setUserData({ ...userData, ...editData });
      setIsEditing(false);
      toast.success('Profile updated successfully! 🎉');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  const handleSubjectChange = (subject) => {
    const newSubjects = editData.subjects.includes(subject)
      ? editData.subjects.filter(s => s !== subject)
      : [...editData.subjects, subject];
    
    setEditData({ ...editData, subjects: newSubjects });
  };

  const getStudentLevel = (level) => {
    if (level >= 20) return { title: "Focus Master", color: "#8B5CF6", badge: "👑" };
    if (level >= 15) return { title: "Study Expert", color: "#06B6D4", badge: "🎓" };
    if (level >= 10) return { title: "Dedicated Learner", color: "#10B981", badge: "📚" };
    if (level >= 5) return { title: "Rising Scholar", color: "#F59E0B", badge: "⭐" };
    return { title: "Beginner", color: "#6B7280", badge: "🌱" };
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  const studentLevel = getStudentLevel(userData?.level || 1);

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
                {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          
          <div className="level-info">
            <span className="level-badge" style={{ backgroundColor: studentLevel.color }}>
              {studentLevel.badge} Level {userData?.level || 1}
            </span>
            <span className="level-title">{studentLevel.title}</span>
          </div>
          
          <button 
            className="btn-secondary edit-btn" 
            onClick={() => setIsEditing(!isEditing)}
          >
            <FiEdit3 size={16} />
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>
        
        <div className="profile-info">
          {isEditing ? (
            <div className="edit-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={editData.name}
                    onChange={(e) => setEditData({...editData, name: e.target.value})}
                    placeholder="Enter your name"
                  />
                </div>
                <div className="form-group">
                  <label>City</label>
                  <select
                    value={editData.city}
                    onChange={(e) => setEditData({...editData, city: e.target.value})}
                  >
                    <option value="">Select City</option>
                    {indianCities.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Bio / About You</label>
                <textarea
                  value={editData.bio}
                  onChange={(e) => setEditData({...editData, bio: e.target.value})}
                  placeholder="Tell us about yourself, your aspirations..."
                  rows={3}
                />
              </div>

              <div className="form-row">
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
                  <label>Current Class/Status</label>
                  <select
                    value={editData.currentClass}
                    onChange={(e) => setEditData({...editData, currentClass: e.target.value})}
                  >
                    <option value="">Select Class</option>
                    {classOptions.map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Study Goal</label>
                <input
                  type="text"
                  value={editData.studyGoal}
                  onChange={(e) => setEditData({...editData, studyGoal: e.target.value})}
                  placeholder="e.g., Clear JEE Main 2024, Score 95% in Boards..."
                />
              </div>

              <div className="form-group">
                <label>Subjects</label>
                <div className="subjects-grid">
                  {subjectOptions.map(subject => (
                    <label key={subject} className="subject-checkbox">
                      <input
                        type="checkbox"
                        checked={editData.subjects.includes(subject)}
                        onChange={() => handleSubjectChange(subject)}
                      />
                      <span>{subject}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Daily Study Target (hours)</label>
                  <select
                    value={editData.dailyTarget}
                    onChange={(e) => setEditData({...editData, dailyTarget: parseInt(e.target.value)})}
                  >
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map(hours => (
                      <option key={hours} value={hours}>{hours} hours</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Preferred Study Time</label>
                  <select
                    value={editData.preferredStudyTime}
                    onChange={(e) => setEditData({...editData, preferredStudyTime: e.target.value})}
                  >
                    {studyTimeOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-primary" onClick={handleSave}>
                  Save Changes
                </button>
                <button className="btn-secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-display">
              <h1>{userData?.name || user.displayName || 'Student'}</h1>
              <p className="profile-bio">{userData?.bio || 'Add your bio to let others know about you'}</p>
              
              <div className="profile-details">
                <div className="detail-item">
                  <FiMail size={16} />
                  <span>{user.email}</span>
                </div>
                {userData?.city && (
                  <div className="detail-item">
                    <FiMapPin size={16} />
                    <span>{userData.city}</span>
                  </div>
                )}
                {userData?.targetExam && (
                  <div className="detail-item">
                    <FiTarget size={16} />
                    <span>Target: {userData.targetExam}</span>
                  </div>
                )}
                {userData?.currentClass && (
                  <div className="detail-item">
                    <FiBook size={16} />
                    <span>{userData.currentClass}</span>
                  </div>
                )}
                <div className="detail-item">
                  <FiCalendar size={16} />
                  <span>Joined {format(new Date(userData?.createdAt || Date.now()), 'MMMM yyyy')}</span>
                </div>
              </div>

              {userData?.studyGoal && (
                <div className="study-goal">
                  <h3>📌 Study Goal</h3>
                  <p>{userData.studyGoal}</p>
                </div>
              )}

              {userData?.subjects && userData.subjects.length > 0 && (
                <div className="subjects-display">
                  <h3>📚 Subjects</h3>
                  <div className="subjects-tags">
                    {userData.subjects.map(subject => (
                      <span key={subject} className="subject-tag">{subject}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Study Statistics */}
      <div className="profile-stats">
        <div className="stat-box primary">
          <div className="stat-value">{userData?.totalSessions || 0}</div>
          <div className="stat-label">Study Sessions</div>
        </div>
        <div className="stat-box success">
          <div className="stat-value">{Math.floor((userData?.totalMinutes || 0) / 60)}h</div>
          <div className="stat-label">Focus Hours</div>
        </div>
        <div className="stat-box warning">
          <div className="stat-value">{userData?.currentStreak || 0}</div>
          <div className="stat-label">Day Streak</div>
        </div>
        <div className="stat-box secondary">
          <div className="stat-value">{userData?.level || 1}</div>
          <div className="stat-label">Current Level</div>
        </div>
      </div>

      {/* Study Progress */}
      <div className="study-progress">
        <h2><FiTrendingUp size={20} /> Study Progress</h2>
        <div className="progress-cards">
          <div className="progress-card">
            <h4>Daily Target Progress</h4>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${Math.min(100, ((userData?.totalMinutes || 0) / (userData?.dailyTarget * 60 || 240)) * 100)}%` }}
              ></div>
            </div>
            <span>{Math.floor((userData?.totalMinutes || 0) / 60)} / {userData?.dailyTarget || 4} hours today</span>
          </div>
          
          <div className="progress-card">
            <h4>Next Level Progress</h4>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${((userData?.totalSessions || 0) % 10) * 10}%` }}
              ></div>
            </div>
            <span>{(userData?.totalSessions || 0) % 10} / 10 sessions to next level</span>
          </div>
        </div>
      </div>
      
      {/* Achievements Section */}
      <div className="achievements-section">
        <h2><FiAward size={20} /> Achievements & Badges</h2>
        <div className="achievements-grid">
          {achievements.length > 0 ? (
            achievements.map((achievement, index) => (
              <div key={index} className="achievement-card earned">
                <div className="achievement-icon">{achievement.icon}</div>
                <div className="achievement-content">
                  <h3>{achievement.title}</h3>
                  <p>{achievement.description}</p>
                  <span className="achievement-date">{achievement.date}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="no-achievements">
              <p>🎯 Complete study sessions to unlock achievements!</p>
            </div>
          )}
          
          {/* Locked achievements preview */}
          {(userData?.totalSessions || 0) < 100 && (
            <div className="achievement-card locked">
              <div className="achievement-icon">🎖️</div>
              <div className="achievement-content">
                <h3>Century Club</h3>
                <p>Complete 100 study sessions</p>
                <span className="achievement-date">Locked</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Study Preferences */}
      <div className="preferences-section">
        <h2><FiSettings size={20} /> Study Preferences</h2>
        <div className="preferences-grid">
          {userData?.dailyTarget && (
            <div className="preference-item">
              <FiClock size={16} />
              <span>Daily Target: {userData.dailyTarget} hours</span>
            </div>
          )}
          {userData?.preferredStudyTime && (
            <div className="preference-item">
              <FiClock size={16} />
              <span>Preferred Time: {studyTimeOptions.find(opt => opt.value === userData.preferredStudyTime)?.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserProfile;