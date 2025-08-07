import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { FiStar, FiTrash2, FiCalendar } from 'react-icons/fi';
import toast from 'react-hot-toast';

function Favorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFavorites();
  }, [user]);

  const fetchFavorites = async () => {
    try {
      const q = query(
        collection(db, 'favorites'),
        where('userId', '==', user.uid)
      );
      
      const snapshot = await getDocs(q);
      const favoritesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setFavorites(favoritesData);
    } catch (error) {
      console.error('Error fetching favorites:', error);
      toast.error('Failed to load favorites');
    }
    setLoading(false);
  };

  const removeFavorite = async (favoriteId) => {
    if (window.confirm('Remove this person from favorites?')) {
      try {
        await deleteDoc(doc(db, 'favorites', favoriteId));
        setFavorites(favorites.filter(fav => fav.id !== favoriteId));
        toast.success('Removed from favorites');
      } catch (error) {
        console.error('Error removing favorite:', error);
        toast.error('Failed to remove favorite');
      }
    }
  };

  const bookSessionWithFavorite = (favorite) => {
    // Navigate to booking page with pre-selected partner
    toast.info('Feature coming soon: Book directly with favorites');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading favorites...</p>
      </div>
    );
  }

  return (
    <div className="favorites-container">
      <div className="favorites-header">
        <h1><FiStar /> My Favorite Partners</h1>
        <p>People you've enjoyed working with</p>
      </div>
      
      {favorites.length === 0 ? (
        <div className="empty-favorites">
          <FiStar size={64} />
          <h3>No favorites yet</h3>
          <p>After completing sessions, you can mark partners as favorites to easily book with them again.</p>
        </div>
      ) : (
        <div className="favorites-grid">
          {favorites.map(favorite => (
            <div key={favorite.id} className="favorite-card">
              <div className="favorite-avatar">
                {favorite.partnerPhoto ? (
                  <img src={favorite.partnerPhoto} alt={favorite.partnerName} />
                ) : (
                  <div className="avatar-placeholder">
                    {favorite.partnerName?.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              
              <div className="favorite-info">
                <h3>{favorite.partnerName}</h3>
                <p className="sessions-count">
                  {favorite.sessionsCount || 1} sessions together
                </p>
                {favorite.lastSession && (
                  <p className="last-session">
                    Last session: {new Date(favorite.lastSession).toLocaleDateString()}
                  </p>
                )}
              </div>
              
              <div className="favorite-actions">
                <button
                  className="btn-primary btn-small"
                  onClick={() => bookSessionWithFavorite(favorite)}
                >
                  <FiCalendar /> Book Session
                </button>
                <button
                  className="btn-danger btn-small"
                  onClick={() => removeFavorite(favorite.id)}
                >
                  <FiTrash2 />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Favorites;