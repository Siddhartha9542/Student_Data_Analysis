#!/bin/bash

# 1. Kill any old processes using port 5000 (Cleans up previous runs)
echo "🧹 Cleaning up old connections..."
fuser -k 5000/tcp > /dev/null 2>&1

# 2. Start Python Server in the background
echo "🚀 Starting Python Backend..."
python proxy.py > /dev/null 2>&1 &
SERVER_PID=$! # Save the Process ID of Python

# 3. Wait a few seconds for Python to wake up
echo "⏳ Waiting for server to initialize..."
sleep 5

# 4. Start Cloudflare Tunnel
echo "✅ Server is Running!"
echo "-----------------------------------------------------"
echo "👉 COPY THE LINK BELOW (ending in .trycloudflare.com)"
echo "-----------------------------------------------------"
cloudflared tunnel --url http://localhost:5000

# 5. When you press CTRL+C to stop Cloudflare, kill Python too
kill $SERVER_PID
echo "🛑 Server Stopped."

