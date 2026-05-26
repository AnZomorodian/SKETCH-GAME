# Sketch Royale - Real-Time Multiplayer Board Game

This application is a real-time multiplayer drawing and guessing game built with React, Vite, Express, and Socket.io. Developed by the DeepInk Team.

## How to Run Locally

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Steps
1. **Clone the repository** (if you have it as a git repo) or enter the project directory.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run the development server**:
   ```bash
   npm run dev
   ```
4. **Access the application**:
   Open your browser and navigate to `http://localhost:3000`.

---

## How to Run on a VPS (Linux/Ubuntu)

### 1. Install Node.js
If not already installed, use NVM for the easiest installation:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
```

### 2. Setup the Application
Upload your files to the VPS and navigate to the directory.
```bash
npm install
npm run build
```

### 3. Run with a Process Manager (Recommended: PM2)
PM2 keeps your app running in the background and restarts it if it crashes.
```bash
npm install -g pm2
pm2 start dist/server.cjs --name "sketch-royale"
```

### 4. Setup Reverse Proxy (Nginx)
To expose your app on port 80 (HTTP) or 443 (HTTPS), use Nginx.

Install Nginx:
```bash
sudo apt update
sudo apt install nginx
```

Configure Nginx (`/etc/nginx/sites-available/default`):
```nginx
server {
    listen 80;
    server_name your_domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Restart Nginx:
```bash
sudo systemctl restart nginx
```

---

## Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
NODE_ENV=production
```

## Features
- **Real-time Drawing Synchronization**: Powered by Socket.io and Konva.
- **Lobby System**: Players join via room codes.
- **Game Mechanics**: Automated turn-based drawing and point calculation.
- **Responsive UI**: Built with Tailwind CSS and Framer Motion.

