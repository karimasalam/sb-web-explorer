const express = require('express');
const cors = require('cors');
const { ServiceBusClient, ServiceBusAdministrationClient, delay } = require('@azure/service-bus');

const app = express();
app.use(cors());
app.use(express.json());

// Store connection string temporarily (in production, use proper secret management)
let serviceBusConnection = null;

app.post('/api/connect', async (req, res) => {
    try {
        const { connectionString } = req.body;
        
        // Test the connection
        const adminClient = new ServiceBusAdministrationClient(connectionString);
        await adminClient.listQueues().next(); // Test if we can list queues
        
        serviceBusConnection = connectionString;
        res.json({ success: true });
    } catch (error) {
        console.error('Connection error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/entities', async (req, res) => {
    try {
        if (!serviceBusConnection) {
            return res.status(400).json({ error: 'No connection string provided' });
        }

        const adminClient = new ServiceBusAdministrationClient(serviceBusConnection);
        
        // Fetch queues
        const queues = [];
        for await (const queue of adminClient.listQueues()) {
            try {
                const runtimeProperties = await adminClient.getQueueRuntimeProperties(queue.name);
                console.log(`Queue ${queue.name} runtime properties:`, JSON.stringify(runtimeProperties, null, 2));
                
                // Get the actual message count properties
                const totalMessageCount = typeof runtimeProperties.messageCount === 'number' 
                    ? runtimeProperties.messageCount 
                    : (runtimeProperties.totalMessageCount || 0);
                    
                const dlqCount = typeof runtimeProperties.deadLetterMessageCount === 'number'
                    ? runtimeProperties.deadLetterMessageCount
                    : 0;

                // Calculate active messages (total minus DLQ)
                const activeMessageCount = Math.max(0, totalMessageCount - dlqCount);

                queues.push({
                    name: queue.name,
                    status: queue.status,
                    createdAt: queue.createdAt,
                    messageCount: totalMessageCount,
                    activeMessageCount: activeMessageCount,
                    dlqMessageCount: dlqCount
                });
            } catch (error) {
                console.error(`Error getting runtime properties for queue ${queue.name}:`, error);
                queues.push({
                    name: queue.name,
                    status: queue.status,
                    createdAt: queue.createdAt,
                    messageCount: 0,
                    activeMessageCount: 0,
                    dlqMessageCount: 0
                });
            }
        }

        // Fetch topics and their subscriptions
        const topics = [];
        for await (const topic of adminClient.listTopics()) {
            const subscriptions = [];
            for await (const subscription of adminClient.listSubscriptions(topic.name)) {
                try {
                    const runtimeProperties = await adminClient.getSubscriptionRuntimeProperties(
                        topic.name,
                        subscription.subscriptionName
                    );
                    console.log(`Subscription ${topic.name}/${subscription.subscriptionName} runtime properties:`, 
                        JSON.stringify(runtimeProperties, null, 2));

                    // Get the actual message count properties
                    const totalMessageCount = typeof runtimeProperties.messageCount === 'number'
                        ? runtimeProperties.messageCount
                        : (runtimeProperties.totalMessageCount || 0);
                        
                    const dlqCount = typeof runtimeProperties.deadLetterMessageCount === 'number'
                        ? runtimeProperties.deadLetterMessageCount
                        : 0;

                    // Calculate active messages (total minus DLQ)
                    const activeMessageCount = Math.max(0, totalMessageCount - dlqCount);

                    subscriptions.push({
                        subscriptionName: subscription.subscriptionName,
                        status: subscription.status,
                        createdAt: subscription.createdAt,
                        messageCount: totalMessageCount,
                        activeMessageCount: activeMessageCount,
                        dlqMessageCount: dlqCount
                    });
                } catch (error) {
                    console.error(`Error getting runtime properties for subscription ${topic.name}/${subscription.subscriptionName}:`, error);
                    subscriptions.push({
                        subscriptionName: subscription.subscriptionName,
                        status: subscription.status,
                        createdAt: subscription.createdAt,
                        messageCount: 0,
                        activeMessageCount: 0,
                        dlqMessageCount: 0
                    });
                }
            }
            topics.push({
                name: topic.name,
                status: topic.status,
                createdAt: topic.createdAt,
                subscriptions: subscriptions
            });
        }

        console.log('Final response:', JSON.stringify({ queues, topics }, null, 2));
        res.json({ queues, topics });
    } catch (error) {
        console.error('Error fetching entities:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get messages from a subscription
app.get('/api/topics/:topicName/subscriptions/:subscriptionName/messages', async (req, res) => {
    try {
        const { topicName, subscriptionName } = req.params;
        const { page = 0, isDlq = false } = req.query;
        const pageSize = 100;
        const skip = parseInt(page) * pageSize;
        const isDeadLetter = isDlq === 'true';

        // Get total message count first
        const adminClient = new ServiceBusAdministrationClient(serviceBusConnection);
        const runtimeProperties = await adminClient.getSubscriptionRuntimeProperties(
            topicName, 
            subscriptionName
        );

        console.log('Runtime properties:', runtimeProperties);
        
        // Use activeMessageCount for active messages and deadLetterMessageCount for DLQ
        const totalMessages = isDeadLetter
            ? (runtimeProperties.deadLetterMessageCount || 0)
            : (runtimeProperties.activeMessageCount || 0);

        // Calculate total pages
        const totalPages = Math.max(1, Math.ceil(totalMessages / pageSize));

        // Get messages for current page
        const client = new ServiceBusClient(serviceBusConnection);
        const receiver = client.createReceiver(topicName, subscriptionName, {
            receiveMode: "peekLock",
            subQueueType: isDeadLetter ? "deadLetter" : undefined
        });

        try {
            console.log(`Fetching messages for ${topicName}/${subscriptionName}:`, {
                page,
                skip,
                pageSize,
                totalMessages,
                totalPages,
                isDlq: isDeadLetter
            });

            const messages = await receiver.peekMessages(pageSize, { skip });
            console.log(`Retrieved ${messages.length} messages`);
            
            const formattedMessages = messages.map(message => ({
                messageId: message.messageId,
                body: message.body,
                enqueuedTime: message.enqueuedTimeUtc,
                properties: message.applicationProperties,
                sequenceNumber: message.sequenceNumber
            }));

            res.json({ 
                messages: formattedMessages,
                totalMessages,
                currentPage: parseInt(page),
                totalPages,
                hasMore: parseInt(page) < totalPages - 1
            });
        } finally {
            await receiver.close();
            await client.close();
        }
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete messages from a subscription
app.delete('/api/topics/:topicName/subscriptions/:subscriptionName/messages', async (req, res) => {
    try {
        console.log('Deleting messages from subscription:', {
            params: req.params,
            body: req.body,
            isDlq: req.body.isDlq
        });

        const { topicName, subscriptionName } = req.params;
        const { messageIds, isDlq = false } = req.body;

        if (!serviceBusConnection) {
            return res.status(400).json({ error: 'No connection string provided' });
        }

        const client = new ServiceBusClient(serviceBusConnection);
        const receiver = client.createReceiver(topicName, subscriptionName, {
            receiveMode: "peekLock",
            subQueueType: isDlq === true ? "deadLetter" : undefined
        });

        try {
            if (messageIds && messageIds.length > 0) {
                console.log('Deleting specific messages:', messageIds);
                let deletedCount = 0;
                let maxAttempts = 3;
                let attempt = 0;

                while (deletedCount < messageIds.length && attempt < maxAttempts) {
                    attempt++;
                    console.log(`Attempt ${attempt} to delete messages`);

                    // Receive a batch of messages
                    const messages = await receiver.receiveMessages(32, { 
                        maxWaitTimeInMs: 5000 
                    });

                    console.log(`Received ${messages.length} messages to process`);
                    console.log('Message IDs in batch:', messages.map(m => m.messageId));

                    // Process each message
                    for (const message of messages) {
                        if (messageIds.includes(message.messageId)) {
                            try {
                                await receiver.completeMessage(message);
                                deletedCount++;
                                console.log('Successfully deleted message:', message.messageId);
                            } catch (error) {
                                console.error('Error completing message:', message.messageId, error);
                                // Abandon the message if we can't complete it
                                try {
                                    await receiver.abandonMessage(message);
                                } catch (abandonError) {
                                    console.error('Error abandoning message:', abandonError);
                                }
                            }
                        } else {
                            // Abandon messages we don't want to delete
                            try {
                                await receiver.abandonMessage(message);
                            } catch (abandonError) {
                                console.error('Error abandoning message:', abandonError);
                            }
                        }
                    }

                    if (deletedCount === messageIds.length) {
                        break; // We've deleted all requested messages
                    }

                    // Add a delay between attempts
                    if (attempt < maxAttempts) {
                        await delay(1000);
                    }
                }

                console.log(`Completed deletion. Deleted ${deletedCount} out of ${messageIds.length} messages`);
                res.json({ 
                    success: true, 
                    deletedCount,
                    totalRequested: messageIds.length 
                });
            } else {
                // Delete all messages in batches
                console.log('Deleting all messages');
                let deletedCount = 0;
                while (true) {
                    const messages = await receiver.receiveMessages(20, { maxWaitTimeInMs: 5000 });
                    if (messages.length === 0) break;
                    
                    for (const message of messages) {
                        try {
                            await receiver.completeMessage(message);
                            deletedCount++;
                            console.log('Deleted message:', message.messageId);
                        } catch (error) {
                            console.error('Error deleting message:', message.messageId, error);
                        }
                    }

                    console.log(`Deleted batch of ${messages.length} messages. Total: ${deletedCount}`);
                    await delay(100);
                }
                
                res.json({ 
                    success: true, 
                    deletedCount 
                });
            }
        } finally {
            await receiver.close();
            await client.close();
        }
    } catch (error) {
        console.error('Error deleting messages:', error);
        res.status(500).json({ 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Resubmit messages from DLQ
app.post('/api/topics/:topicName/subscriptions/:subscriptionName/resubmit', async (req, res) => {
    const { topicName, subscriptionName } = req.params;
    const { messageIds, isDlq } = req.body;

    try {
        const client = new ServiceBusClient(serviceBusConnection);
        const receiver = client.createReceiver(topicName, subscriptionName, { 
            subQueueType: "deadLetter",
            receiveMode: "peekLock"
        });
        const sender = client.createSender(topicName);

        let messages = [];
        try {
            if (messageIds && messageIds.length > 0) {
                // Resubmit specific messages
                for (const messageId of messageIds) {
                    const receivedMessages = await receiver.receiveMessages(1);
                    if (receivedMessages.length > 0) {
                        messages.push(receivedMessages[0]);
                    }
                }
            } else {
                // Resubmit all messages
                let batch;
                do {
                    batch = await receiver.receiveMessages(20);
                    messages.push(...batch);
                } while (batch.length === 20);
            }
        } catch (error) {
            console.error('Error receiving messages:', error);
            throw new Error(`Failed to receive messages: ${error.message}`);
        }

        console.log(`Processing ${messages.length} messages for resubmit`);

        const results = {
            success: [],
            failed: []
        };

        // Resubmit messages and delete from DLQ
        for (const message of messages) {
            try {
                // Send to main queue
                await sender.sendMessages({
                    body: message.body,
                    applicationProperties: message.applicationProperties,
                    correlationId: message.correlationId,
                    messageId: `resubmit-${message.messageId}`,
                    contentType: message.contentType,
                    subject: message.subject
                });

                // Complete (delete) from DLQ
                await receiver.completeMessage(message);
                console.log(`Successfully resubmitted and deleted message ${message.messageId}`);
                results.success.push(message.messageId);
            } catch (error) {
                console.error(`Error processing message ${message.messageId}:`, error);
                // Abandon the message if there was an error
                await receiver.abandonMessage(message);
                results.failed.push({
                    messageId: message.messageId,
                    error: error.message
                });
            }
        }

        await receiver.close();
        await sender.close();

        // Return appropriate status based on results
        if (results.failed.length > 0) {
            res.status(207).json({
                success: false,
                message: `${results.success.length} messages resubmitted, ${results.failed.length} failed`,
                details: {
                    successCount: results.success.length,
                    failedCount: results.failed.length,
                    successfulMessages: results.success,
                    failedMessages: results.failed
                }
            });
        } else if (results.success.length === 0) {
            res.status(404).json({
                success: false,
                message: 'No messages found to resubmit'
            });
        } else {
            res.json({
                success: true,
                message: `Successfully resubmitted ${results.success.length} messages`,
                details: {
                    successCount: results.success.length,
                    successfulMessages: results.success
                }
            });
        }
    } catch (error) {
        console.error('Error in resubmit operation:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            error: error.toString()
        });
    }
});

// Refresh subscription details
app.get('/api/topics/:topicName/subscriptions/:subscriptionName/details', async (req, res) => {
    try {
        const { topicName, subscriptionName } = req.params;

        if (!serviceBusConnection) {
            return res.status(400).json({ error: 'No connection string provided' });
        }

        const adminClient = new ServiceBusAdministrationClient(serviceBusConnection);
        const runtimeProperties = await adminClient.getSubscriptionRuntimeProperties(
            topicName,
            subscriptionName
        );

        // Get the actual message count properties
        const totalMessageCount = typeof runtimeProperties.messageCount === 'number'
            ? runtimeProperties.messageCount
            : (runtimeProperties.totalMessageCount || 0);
            
        const dlqCount = typeof runtimeProperties.deadLetterMessageCount === 'number'
            ? runtimeProperties.deadLetterMessageCount
            : 0;

        // Calculate active messages (total minus DLQ)
        const activeMessageCount = Math.max(0, totalMessageCount - dlqCount);

        res.json({
            messageCount: totalMessageCount,
            activeMessageCount: activeMessageCount,
            dlqMessageCount: dlqCount
        });
    } catch (error) {
        console.error('Error refreshing subscription details:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
