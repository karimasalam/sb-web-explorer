import React, { useState } from 'react';
import './ConnectionStringInput.css';

const ConnectionStringInput = ({ onConnect }) => {
  const [connectionString, setConnectionString] = useState('');

  const handleConnect = () => {
    if (connectionString.trim()) {
      onConnect(connectionString.trim());
    }
  };

  return (
    <div className="connection-string-container">
      <h2>Azure Service Bus Explorer</h2>
      <div className="input-group">
        <input
          type="password"
          value={connectionString}
          onChange={(e) => setConnectionString(e.target.value)}
          placeholder="Enter Service Bus Connection String"
          className="connection-input"
        />
        <button 
          onClick={handleConnect}
          disabled={!connectionString.trim()}
          className="connect-button"
        >
          Connect
        </button>
      </div>
    </div>
  );
};

export default ConnectionStringInput;
