import React, { useState } from 'react';
import './App.css';
import ConnectionStringInput from './components/ConnectionStringInput';
import ServiceBusExplorer from './components/ServiceBusExplorer';

function App() {
  const [connectionString, setConnectionString] = useState('');

  return (
    <div className="App">
      {!connectionString ? (
        <ConnectionStringInput onConnect={setConnectionString} />
      ) : (
        <ServiceBusExplorer connectionString={connectionString} />
      )}
    </div>
  );
}

export default App;
