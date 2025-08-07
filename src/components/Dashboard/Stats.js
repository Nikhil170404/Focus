import React from 'react';
import { FiActivity, FiClock, FiTrendingUp, FiHeart } from 'react-icons/fi';

function Stats({ stats }) {
  const formatMinutes = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hrs`;
  };

  const statsData = [
    {
      icon: <FiActivity />,
      label: 'Total Sessions',
      value: stats.totalSessions || 0,
      color: 'primary'
    },
    {
      icon: <FiClock />,
      label: 'Focus Time',
      value: formatMinutes(stats.totalMinutes || 0),
      color: 'success'
    },
    {
      icon: <FiTrendingUp />,
      label: 'Current Streak',
      value: `${stats.streak || 0} days`,
      color: 'warning'
    },
    {
      icon: <FiHeart />,
      label: 'Favorites',
      value: stats.favorites || 0,
      color: 'secondary'
    }
  ];

  return (
    <div className="stats-grid">
      {statsData.map((stat, index) => (
        <div key={index} className="stat-card">
          <div className={`stat-icon ${stat.color}`}>
            {stat.icon}
          </div>
          <div className="stat-content">
            <h3>{stat.label}</h3>
            <p>{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default Stats;