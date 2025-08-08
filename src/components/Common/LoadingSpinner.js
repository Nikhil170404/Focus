import React from 'react';

function LoadingSpinner({ 
  size = 'medium', 
  color = 'primary', 
  message = 'Loading...', 
  showMessage = true,
  className = '' 
}) {
  const sizeClasses = {
    small: 'w-6 h-6 border-2',
    medium: 'w-10 h-10 border-3',
    large: 'w-16 h-16 border-4',
    xlarge: 'w-24 h-24 border-4'
  };

  const colorClasses = {
    primary: 'border-gray-200 border-t-primary',
    secondary: 'border-gray-200 border-t-secondary', 
    success: 'border-gray-200 border-t-success',
    warning: 'border-gray-200 border-t-warning',
    danger: 'border-gray-200 border-t-danger',
    white: 'border-gray-400 border-t-white'
  };

  return (
    <div className={`loading-spinner-container ${className}`}>
      <div 
        className={`
          loading-spinner 
          ${sizeClasses[size]} 
          ${colorClasses[color]}
          border-solid 
          rounded-full 
          animate-spin
        `}
        role="status"
        aria-label={message}
      />
      {showMessage && message && (
        <p className="loading-message">{message}</p>
      )}
    </div>
  );
}

// Alternative usage with CSS classes
export function CSSLoadingSpinner({ 
  size = 'medium', 
  message = 'Loading...', 
  showMessage = true,
  className = '' 
}) {
  return (
    <div className={`loading-container ${className}`}>
      <div className={`spinner ${size}`} />
      {showMessage && message && (
        <p className="loading-text">{message}</p>
      )}
    </div>
  );
}

// Skeleton loader for content
export function SkeletonLoader({ lines = 3, className = '' }) {
  return (
    <div className={`skeleton-loader ${className}`}>
      {Array.from({ length: lines }, (_, index) => (
        <div 
          key={index}
          className={`skeleton-line ${index === lines - 1 ? 'short' : ''}`}
        />
      ))}
    </div>
  );
}

// Pulse loader for cards
export function PulseLoader({ className = '' }) {
  return (
    <div className={`pulse-container ${className}`}>
      <div className="pulse-avatar" />
      <div className="pulse-content">
        <div className="pulse-title" />
        <div className="pulse-subtitle" />
        <div className="pulse-text" />
      </div>
    </div>
  );
}

// Full page loading overlay
export function LoadingOverlay({ message = 'Loading...', isVisible = true }) {
  if (!isVisible) return null;

  return (
    <div className="loading-overlay">
      <div className="loading-overlay-content">
        <CSSLoadingSpinner size="large" message={message} />
      </div>
    </div>
  );
}

export default LoadingSpinner;