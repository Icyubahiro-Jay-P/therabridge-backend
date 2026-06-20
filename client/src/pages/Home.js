import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Home() {
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    axios.get('http://localhost:5000/api/home', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => setMessage(res.data.message)).catch(() => navigate('/login'));
  }, [token, navigate]);

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Welcome to TheraBridge Home</h1>
      <p>{message}</p>
      <button onClick={() => navigate('/profile')}>Go to Profile</button>
      <button onClick={() => { localStorage.removeItem('token'); navigate('/login'); }}>Logout</button>
    </div>
  );
}

export default Home;
