require("dotenv").config();

const WebSocket = require('ws');

const method = process.env.USE_WSS ? 'wss://' : 'ws://';
const path = process.env.HYDRA_HOST;
const port = process.env.HYDRA_PORT;

// WebSocket server URL
const url = `${method}${path}:${port}`;

console.log(`Connecting to Hydra at ${url}`)

// Create a WebSocket client
const ws = new WebSocket(url);

// Connection opened
ws.on('open', () => {
    console.log('Connected to WebSocket server.');
});

// Message received from the server
ws.on('message', (message) => {
    const json_message = JSON.parse(message);
    console.log('Received message:', json_message);


    if (json_message.headStatus === 'Idle') {
        console.log("Head is idle, trying to initialize!");
        ws.send(JSON.stringify({tag: "Init"}));
    }
});


// Handle any errors
ws.on('error', (error) => {
    console.error('WebSocket error:', error);
});

// Handle connection closure
ws.on('close', () => {
    console.log('Disconnected from WebSocket server.');
});

module.exports = {
    ws
};