import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './hooks/useAuth';
import AuthGuard from './components/Auth/AuthGuard';
import Login from './components/Auth/Login';
import Signup from './components/Auth/Signup';
import Dashboard from './components/Dashboard/Dashboard';
import SessionBooking from './components/Session/SessionBooking';
import VideoSession from './components/Session/VideoSession';
import UserProfile from './components/Profile/UserProfile';
import Favorites from './components/Profile/Favorites';
import Header from './components/Layout/Header';
import './styles/index.css';
import './styles/components.css';
import './styles/animations.css';
import './styles/videoSession.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app">
          <Header />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route
              path="/dashboard"
              element={
                <AuthGuard>
                  <Dashboard />
                </AuthGuard>
              }
            />
            <Route
              path="/book-session"
              element={
                <AuthGuard>
                  <SessionBooking />
                </AuthGuard>
              }
            />
            <Route
              path="/session/:sessionId"
              element={
                <AuthGuard>
                  <VideoSession />
                </AuthGuard>
              }
            />
            <Route
              path="/profile"
              element={
                <AuthGuard>
                  <UserProfile />
                </AuthGuard>
              }
            />
            <Route
              path="/favorites"
              element={
                <AuthGuard>
                  <Favorites />
                </AuthGuard>
              }
            />
          </Routes>
          <Toaster position="top-right" />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;