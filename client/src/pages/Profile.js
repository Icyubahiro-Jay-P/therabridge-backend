import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Profile() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    axios.get('http://localhost:5000/api/profile', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => setUser(res.data.user)).catch(() => navigate('/login'));
  }, [token, navigate]);

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: 'auto' }}>
      <h1>Profile</h1>
      {user ? (
        <div>
          <p><strong>Name:</strong> {user.name || 'N/A'}</p>
          <p><strong>Email:</strong> {user.email}</p>
        </div>
      ) : <p>Loading...</p>}
      <button onClick={() => navigate('/home')}>Home</button>
      <button onClick={() => { localStorage.removeItem('token'); navigate('/login'); }}>Logout</button>
    </div>
  );
}

export default Profile;
