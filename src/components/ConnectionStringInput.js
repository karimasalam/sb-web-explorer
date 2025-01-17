import React, { useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import './ConnectionStringInput.css';

const ConnectionStringInput = ({ onConnect }) => {
  const [connectionString, setConnectionString] = useState('');

  const handleConnect = () => {
    if (connectionString.trim()) {
      onConnect(connectionString.trim());
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && connectionString.trim()) {
      handleConnect();
    }
  };

  return (
    <div className="connection-string-container">
      <Card className="connection-card">
        <h2>Azure Service Bus Explorer</h2>
        <div className="p-inputgroup">
          <InputText
            type="password"
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter Service Bus Connection String"
            className="w-full"
          />
          <Button 
            onClick={handleConnect}
            disabled={!connectionString.trim()}
            icon="pi pi-link"
            label="Connect"
            severity="primary"
          />
        </div>
      </Card>
    </div>
  );
};

export default ConnectionStringInput;
