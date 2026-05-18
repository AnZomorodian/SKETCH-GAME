import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;

interface Player {
  id: string;
  name: string;
  points: number;
}

interface GameSettings {
  roundTime: number;
  maxPlayers: number;
  language: 'en' | 'fa';
  guessingTimeAfterFinish: number;
  winningPoints: number;
}

interface GameState {
  id: string;
  hostId: string;
  players: Player[];
  status: 'lobby' | 'playing' | 'round_end' | 'game_over';
  phase?: 'drawing' | 'guessing';
  currentDrawerId: string | null;
  currentWord: string | null;
  roundTimeLeft: number;
  isPaused: boolean;
  guesses: { playerId: string; text: string; isCorrect: boolean }[];
  drawingData: any[]; // Lines/objects
  settings: GameSettings;
}

const rooms = new Map<string, GameState>();

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Socket logic
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room', ({ roomId, playerName }) => {
      let room = rooms.get(roomId);
      
      if (!room) {
        // Create new room if not exists
        room = {
          id: roomId,
          hostId: socket.id,
          players: [],
          status: 'lobby',
          phase: 'drawing',
          currentDrawerId: null,
          currentWord: null,
          roundTimeLeft: 60,
          isPaused: false,
          guesses: [],
          drawingData: [],
          settings: {
            roundTime: 60,
            maxPlayers: 8,
            language: 'en',
            guessingTimeAfterFinish: 45,
            winningPoints: 1000
          }
        };
        rooms.set(roomId, room);
      }

      const newPlayer: Player = {
        id: socket.id,
        name: playerName || `Player ${room.players.length + 1}`,
        points: 0
      };

      if (room.players.length >= room.settings.maxPlayers) {
        socket.emit('error', 'Room is full');
        return;
      }

      room.players.push(newPlayer);
      socket.join(roomId);
      
      io.to(roomId).emit('room_update', room);
    });

    socket.on('update_settings', ({ roomId, settings }) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id && room.status === 'lobby') {
        room.settings = settings;
        io.to(roomId).emit('room_update', room);
      }
    });

    socket.on('start_game', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        startNewRound(roomId);
      }
    });

    socket.on('finish_drawing', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (room && room.currentDrawerId === socket.id && room.status === 'playing' && room.phase === 'drawing') {
        room.phase = 'guessing';
        room.roundTimeLeft = room.settings.guessingTimeAfterFinish; 
        room.isPaused = false; // Auto unpause on phase change
        io.to(roomId).emit('timer_update', room.roundTimeLeft);
        io.to(roomId).emit('room_update', room);
      }
    });

    socket.on('toggle_pause', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id && room.status === 'playing') {
        room.isPaused = !room.isPaused;
        io.to(roomId).emit('room_update', room);
      }
    });

    socket.on('draw_event', ({ roomId, drawingData }) => {
      const room = rooms.get(roomId);
      if (room && room.currentDrawerId === socket.id) {
        room.drawingData = drawingData;
        socket.to(roomId).emit('drawing_sync', drawingData);
      }
    });

    socket.on('guess', ({ roomId, text }) => {
      const room = rooms.get(roomId);
      if (!room || room.status !== 'playing' || room.phase !== 'guessing' || socket.id === room.currentDrawerId) return;

      const isCorrect = text.toLowerCase().trim() === room.currentWord?.toLowerCase().trim();
      const player = room.players.find(p => p.id === socket.id);
      
      const guess = { playerId: socket.id, playerName: player?.name, text, isCorrect };
      room.guesses.push(guess);

      if (isCorrect) {
        const drawer = room.players.find(p => p.id === room.currentDrawerId);
        
        if (player) player.points += 100;
        if (drawer) drawer.points += 50;

        io.to(roomId).emit('correct_guess', { 
          playerId: socket.id, 
          playerName: player?.name,
          word: room.currentWord 
        });
        
        endRound(roomId);
      } else {
        io.to(roomId).emit('new_guess', guess);
      }
    });

    socket.on('kick_player', ({ roomId, playerId }) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id && playerId !== socket.id) {
        const kickedSocket = io.sockets.sockets.get(playerId);
        if (kickedSocket) {
          kickedSocket.leave(roomId);
          kickedSocket.emit('error', 'You have been kicked from the room');
        }
        room.players = room.players.filter(p => p.id !== playerId);
        io.to(roomId).emit('room_update', room);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      rooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          
          if (room.players.length === 0) {
            rooms.delete(roomId);
          } else {
            if (room.hostId === socket.id) {
              room.hostId = room.players[0].id;
            }
            if (room.currentDrawerId === socket.id) {
              endRound(roomId);
            }
            io.to(roomId).emit('room_update', room);
          }
        }
      });
    });
  });

  const timers = new Map<string, NodeJS.Timeout>();

  const faWords = [
    'سیب', 'خانه', 'ماشین', 'خورشید', 'درخت', 'گربه', 'سگ', 'کوه', 'اقیانوس', 'کامپیوتر', 'پیتزا', 'دوچرخه',
    'فیل', 'گیتار', 'همبرگر', 'جزیره', 'مشتری', 'کانگورو', 'فانوس دریایی', 'قارچ', 'دفترچه', 'هشت‌پا',
    'پنگوئن', 'ملکه', 'موشک', 'توت‌فرنگی', 'تلسکوپ', 'چتر', 'آتشفشان', 'نهنگ', 'کزیلوفون', 'قایق تفریحی', 'گورخر',
    'هواپیما', 'بادکنک', 'قلعه', 'اژدها', 'عقاب', 'گل', 'یخچال طبیعی', 'هلیکوپتر', 'توده یخ', 'جنگل', 'کوالا',
    'لیمو', 'پری دریایی', 'نینجا', 'شترمرغ', 'دزد دریایی', 'لحاف', 'ربات', 'سفینه فضایی', 'ببر', 'تک‌شاخ', 'ویولن', 'جادوگر',
    'تخت', 'صندلی', 'میز', 'کمد', 'پنجره', 'در', 'دیوار', 'سقف', 'فرش', 'لامپ', 'کتاب', 'مداد', 'دفتر', 'پاک‌کن', 'کاغذ',
    'کفش', 'جوراب', 'شلوار', 'پیراهن', 'کلاه', 'عینک', 'ساعت', 'دستبند', 'گردنبند', 'انگشتر', 'گوشواره', 'کیف', 'پول',
    'نان', 'پنیر', 'کره', 'مربا', 'عسل', 'شیر', 'چای', 'قهوه', 'آب', 'آبغوره', 'سرکه', 'روغن', 'برنج', 'گوشت', 'مرغ', 'ماهی',
    'لبخند', 'گریه', 'دوست', 'دشمن', 'جوان', 'پیر', 'بزرگ', 'کوچک', 'گرم', 'سرد', 'روشن', 'تاریک', 'خوب', 'بد', 'زشت', 'زیبا'
  ];

  function startNewRound(roomId: string) {
    const room = rooms.get(roomId);
    if (!room || room.players.length === 0) return;

    // Clear existing timer
    if (timers.has(roomId)) {
      clearInterval(timers.get(roomId)!);
      timers.delete(roomId);
    }

    // Pick next drawer
    const currentIndex = room.players.findIndex(p => p.id === room.currentDrawerId);
    const nextIndex = (currentIndex + 1) % room.players.length;
    room.currentDrawerId = room.players[nextIndex].id;

    // Pick word
    const enWords = [
      'apple', 'house', 'car', 'sun', 'tree', 'cat', 'dog', 'mountain', 'ocean', 'computer', 'pizza', 'bicycle',
      'elephant', 'guitar', 'hamburger', 'island', 'jupiter', 'kangaroo', 'lighthouse', 'mushroom', 'notebook', 'octopus',
      'penguin', 'queen', 'rocket', 'strawberry', 'telescope', 'umbrella', 'volcano', 'whale', 'xylophone', 'yacht', 'zebra',
      'airplane', 'balloon', 'castle', 'dragon', 'eagle', 'flower', 'glacier', 'helicopter', 'iceberg', 'jungle', 'koala',
      'lemon', 'mermaid', 'ninja', 'ostrich', 'pirate', 'quilt', 'robot', 'spaceship', 'tiger', 'unicorn', 'violin', 'wizard',
      'bed', 'chair', 'table', 'cabinet', 'window', 'door', 'wall', 'ceiling', 'carpet', 'lamp', 'book', 'pencil', 'notebook', 'eraser', 'paper',
      'shoe', 'sock', 'pants', 'shirt', 'hat', 'glasses', 'watch', 'bracelet', 'necklace', 'ring', 'earring', 'bag', 'money',
      'bread', 'cheese', 'butter', 'jam', 'honey', 'milk', 'tea', 'coffee', 'water', 'juice', 'vinegar', 'oil', 'rice', 'meat', 'chicken', 'fish',
      'smile', 'cry', 'friend', 'enemy', 'young', 'old', 'big', 'small', 'hot', 'cold', 'bright', 'dark', 'good', 'bad', 'ugly', 'beautiful'
    ];
    
    const words = room.settings.language === 'fa' ? faWords : enWords;
    room.currentWord = words[Math.floor(Math.random() * words.length)];
    
    room.status = 'playing';
    room.phase = 'drawing';
    room.isPaused = false;
    room.drawingData = [];
    room.guesses = [];
    room.roundTimeLeft = room.settings.roundTime;

    io.to(roomId).emit('room_update', room);

    // Start countdown
    const timer = setInterval(() => {
      const currentRoom = rooms.get(roomId);
      if (currentRoom && currentRoom.status === 'playing') {
        currentRoom.roundTimeLeft--;
        if (currentRoom.roundTimeLeft <= 0) {
          if (currentRoom.phase === 'drawing') {
            currentRoom.phase = 'guessing';
            currentRoom.roundTimeLeft = currentRoom.settings.guessingTimeAfterFinish;
            io.to(roomId).emit('room_update', currentRoom);
          } else {
            endRound(roomId);
          }
        } else {
          io.to(roomId).emit('timer_update', currentRoom.roundTimeLeft);
        }
      } else {
        clearInterval(timer);
        timers.delete(roomId);
      }
    }, 1000);
    timers.set(roomId, timer);
  }

  function endRound(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return;

    // Check for winner
    const winner = room.players.find(p => p.points >= room.settings.winningPoints);
    if (winner) {
      room.status = 'game_over';
      io.to(roomId).emit('room_update', room);
      if (timers.has(roomId)) {
        clearInterval(timers.get(roomId)!);
        timers.delete(roomId);
      }
      return;
    }

    room.status = 'round_end';
    io.to(roomId).emit('room_update', room);

    if (timers.has(roomId)) {
      clearInterval(timers.get(roomId)!);
      timers.delete(roomId);
    }

    setTimeout(() => {
      if (rooms.has(roomId)) {
        startNewRound(roomId);
      }
    }, 5000);
  }

  // Vite middlewar setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
