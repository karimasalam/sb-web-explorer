# Service Bus Explorer Web

A web-based explorer for Azure Service Bus topics and subscriptions. This tool allows you to view, manage, and interact with your Azure Service Bus resources through a user-friendly interface in development environment.

## Features

- **Connection Management**
  - Connect to Azure Service Bus using connection string
  - Secure connection string handling

- **Topic & Subscription Exploration**
  - View all topics in your namespace
  - Browse subscriptions within topics
  - View message counts (active, dead-letter, total)

- **Message Management**
  - View messages in subscriptions
  - View dead-letter queue (DLQ) messages
  - Delete selected messages
  - Delete all messages
  - Resubmit selected messages back to the topic
  - Expandable message details
  - Pagination support

- **User Interface**
  - Modern, responsive design
  - Toast notifications for actions
  - Loading states and progress indicators
  - Confirmation dialogs for destructive actions

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Azure Service Bus namespace with topics and subscriptions

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/karimasalam/sb-web-explorer.git
   cd sb-web-explorer
   ```

2. Install dependencies for both frontend and backend:
   ```bash
   # Install frontend dependencies
   npm install
   # or
   yarn install

   # Install backend dependencies
   cd server
   npm install
   # or
   yarn install
   ```

## Running the Application

1. Start the backend server:
   ```bash
   cd server
   npm start
   # or
   yarn start
   ```
   The server will run on http://localhost:3001

2. In a new terminal, start the frontend:
   ```bash
   npm start
   # or
   yarn start
   ```
   The application will open in your browser at http://localhost:3000

## Usage

1. **Connect to Service Bus**
   - Enter your Azure Service Bus connection string
   - Click "Connect"

2. **Browse Topics and Subscriptions**
   - View the list of topics
   - Click a topic to view its subscriptions
   - See message counts for each subscription

3. **View Messages**
   - Click "View Messages" on a subscription to see active messages
   - Click "View DLQ" to see dead-letter queue messages
   - Messages are displayed with key information
   - Click a message to expand and see full details

4. **Manage Messages**
   - Select messages using checkboxes
   - Use "Delete Selected" to remove specific messages
   - Use "Clear All" to remove all messages
   - Use "Resubmit Selected" to send messages back to the topic

## Development

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).
The backend uses Express.js and the [@azure/service-bus](https://www.npmjs.com/package/@azure/service-bus) SDK.
