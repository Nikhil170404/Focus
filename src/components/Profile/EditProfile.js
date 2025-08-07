import React, { useState } from 'react';
import { FiUser, FiMail, FiGlobe, FiSave, FiX } from 'react-icons/fi';

function EditProfile({ userData, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: userData?.name || '',
    bio: userData?.bio || '',
    timezone: userData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    linkedin: userData?.linkedin || '',
    twitter: userData?.twitter || '',
    website: userData?.website || ''
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="edit-profile-container">
      <div className="edit-profile-card">
        <h2>Edit Profile</h2>
        
        <form onSubmit={handleSubmit} className="edit-profile-form">
          <div className="form-group">
            <label>
              <FiUser /> Display Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your name"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Bio</label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              placeholder="Tell us about yourself..."
              rows={4}
            />
          </div>
          
          <div className="form-group">
            <label>
              <FiGlobe /> Timezone
            </label>
            <select
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
            >
              <option value="Asia/Kolkata">India (IST)</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Asia/Singapore">Singapore (SGT)</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>LinkedIn Profile</label>
            <input
              type="url"
              name="linkedin"
              value={formData.linkedin}
              onChange={handleChange}
              placeholder="https://linkedin.com/in/yourprofile"
            />
          </div>
          
          <div className="form-group">
            <label>Twitter Profile</label>
            <input
              type="url"
              name="twitter"
              value={formData.twitter}
              onChange={handleChange}
              placeholder="https://twitter.com/yourhandle"
            />
          </div>
          
          <div className="form-group">
            <label>Personal Website</label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://yourwebsite.com"
            />
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              <FiSave /> Save Changes
            </button>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              <FiX /> Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditProfile;