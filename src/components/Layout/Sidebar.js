import React from 'react';
import { NavLink } from 'react-router-dom';
import { FiHome, FiCalendar, FiUsers, FiHeart, FiSettings, FiBarChart2 } from 'react-icons/fi';

function Sidebar() {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className="sidebar-link">
          <FiHome />
          <span>Dashboard</span>
        </NavLink>
        
        <NavLink to="/book-session" className="sidebar-link">
          <FiCalendar />
          <span>Book Session</span>
        </NavLink>
        
        <NavLink to="/sessions" className="sidebar-link">
          <FiUsers />
          <span>My Sessions</span>
        </NavLink>
        
        <NavLink to="/favorites" className="sidebar-link">
          <FiHeart />
          <span>Favorites</span>
        </NavLink>
        
        <NavLink to="/stats" className="sidebar-link">
          <FiBarChart2 />
          <span>Statistics</span>
        </NavLink>
        
        <NavLink to="/settings" className="sidebar-link">
          <FiSettings />
          <span>Settings</span>
        </NavLink>
      </nav>
    </aside>
  );
}

export default Sidebar;