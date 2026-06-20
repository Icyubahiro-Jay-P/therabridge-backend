import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:5000/api/register', { name, email, password });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px' }}>
      <h2>Signup for TheraBridge</h2>
      {error && <p style={{color: 'red'}}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required style={{display: 'block', margin: '10px 0', width: '100%'}} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required style={{display: 'block', margin: '10px 0', width: '100%'}} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required style={{display: 'block', margin: '10px 0', width: '100%'}} />
        <button type="submit" style={{width: '100%'}}>Signup</button>
      </form>
      <p>Have an account? <a href="/login">Login</a></p>
    </div>
  );
}

export default Signup;
