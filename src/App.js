import React, { useState } from 'react';
import './App.css';
import ConnectionStringInput from './components/ConnectionStringInput';
import ServiceBusExplorer from './components/ServiceBusExplorer';
import "primereact/resources/themes/lara-light-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

function App() {
  const [connectionString, setConnectionString] = useState('');

  const handleConnect = (connectionString) => {
    setConnectionString(connectionString);
  };

  const handleSignOut = () => {
    setConnectionString('');
  };

  return (
    <div className="App">
      {!connectionString ? (
        <ConnectionStringInput onConnect={handleConnect} />
      ) : (
        <ServiceBusExplorer connectionString={connectionString} onSignOut={handleSignOut} />
      )}
    </div>
  );
}

export default App;
