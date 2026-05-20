import express from "express";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";

interface Player {
  id: string;
  name: string;
  points: number;
}

interface Guess {
  playerId: string;
  playerName: string;
  text: string;
  isCorrect: boolean;
  timestamp: number;
}

interface RoomSettings {
  roundTime: number;
  maxPlayers: number;
  language: string;
  guessingTimeAfterFinish: number;
  winningPoints: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface Room {
  id: string;
  hostId: string;
  players: Player[];
  status: 'lobby' | 'playing' | 'round_end' | 'game_over';
  phase: 'drawing' | 'guessing';
  currentDrawerId: string | null;
  currentWord: string | null;
  roundTimeLeft: number;
  isPaused: boolean;
  guesses: Guess[];
  drawingData: any[];
  settings: RoomSettings;
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;
  const rooms = new Map<string, Room>();

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
            maxPlayers: 12,
            language: 'en',
            guessingTimeAfterFinish: 45,
            winningPoints: 1000,
            difficulty: 'medium'
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
      if (room && room.hostId === socket.id) {
        room.settings = { ...room.settings, ...settings };
        io.to(roomId).emit('room_update', room);
      }
    });

    socket.on('start_game', (data) => {
      const roomId = typeof data === 'string' ? data : data.roomId;
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id && room.players.length > 0) {
        startNewRound(roomId);
      }
    });

    socket.on('toggle_pause', (data) => {
      const roomId = typeof data === 'string' ? data : data.roomId;
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        room.isPaused = !room.isPaused;
        io.to(roomId).emit('room_update', room);
      }
    });

    socket.on('pause_game', (roomId) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        room.isPaused = !room.isPaused;
        io.to(roomId).emit('room_update', room);
      }
    });

    socket.on('draw_event', ({ roomId, drawingData }) => {
      const room = rooms.get(roomId);
      if (room && room.currentDrawerId === socket.id && !room.isPaused) {
        room.drawingData = drawingData;
        socket.to(roomId).emit('drawing_update', drawingData);
      }
    });

    socket.on('draw', ({ roomId, drawData }) => {
      const room = rooms.get(roomId);
      if (room && room.currentDrawerId === socket.id && !room.isPaused) {
        room.drawingData.push(drawData);
        socket.to(roomId).emit('drawing_update', drawData);
      }
    });

    socket.on('finish_drawing', (data) => {
      const roomId = typeof data === 'string' ? data : data.roomId;
      const room = rooms.get(roomId);
      if (room && room.currentDrawerId === socket.id && room.phase === 'drawing') {
        room.phase = 'guessing';
        room.roundTimeLeft = room.settings.guessingTimeAfterFinish;
        io.to(roomId).emit('room_update', room);
      }
    });

    socket.on('skip_round', (data) => {
      const roomId = typeof data === 'string' ? data : data.roomId;
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        startNewRound(roomId);
      }
    });

    socket.on('reset_points', (data) => {
      const roomId = typeof data === 'string' ? data : data.roomId;
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        room.players.forEach(p => p.points = 0);
        io.to(roomId).emit('room_update', room);
      }
    });

    socket.on('change_drawer', (data) => {
      const roomId = typeof data === 'string' ? data : data.roomId;
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        startNewRound(roomId);
      }
    });

    socket.on('clear_canvas', (roomId) => {
      const room = rooms.get(roomId);
      if (room && room.currentDrawerId === socket.id) {
        room.drawingData = [];
        io.to(roomId).emit('canvas_cleared');
      }
    });

    socket.on('guess', ({ roomId, text }) => {
      const room = rooms.get(roomId);
      if (room && room.status === 'playing' && socket.id !== room.currentDrawerId) {
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const isCorrect = text.toLowerCase() === room.currentWord?.toLowerCase();
        
        const guess: Guess = {
          playerId: socket.id,
          playerName: player.name,
          text,
          isCorrect,
          timestamp: Date.now()
        };

        room.guesses.push(guess);
        io.to(roomId).emit('new_guess', guess);

        if (isCorrect) {
          // Time-based scoring: Each 10 seconds lost reduces 5 points from base 100
          const totalGuessTime = room.settings.guessingTimeAfterFinish;
          const timeElapsed = Math.max(0, totalGuessTime - room.roundTimeLeft);
          const timePenalty = Math.floor(timeElapsed / 10) * 5;
          const pointsEarned = Math.max(50, 100 - timePenalty);
          
          player.points += pointsEarned;
          
          // Drawer also gets some points
          const drawer = room.players.find(p => p.id === room.currentDrawerId);
          if (drawer) {
            drawer.points += Math.floor(pointsEarned / 2);
          }

          io.to(roomId).emit('room_update', room);
          
          if (room.phase === 'drawing') {
             room.phase = 'guessing';
             room.roundTimeLeft = room.settings.guessingTimeAfterFinish;
             io.to(roomId).emit('room_update', room);
          }
        }
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

  const wordsList: any = {
    en: {
      easy: ['apple', 'house', 'car', 'sun', 'tree', 'cat', 'dog', 'mountain', 'ocean', 'pizza', 'bike', 'star', 'ball', 'book', 'pen', 'hat', 'shoe', 'fish', 'bird', 'bus', 'bed', 'door', 'box', 'key', 'milk', 'egg', 'cake', 'bag', 'fan', 'pot', 'pan', 'net', 'ink', 'jar', 'log', 'nut', 'oil', 'pin', 'rat', 'tie', 'wig', 'arm', 'leg', 'ear', 'eye', 'lip', 'jaw', 'toe', 'rug', 'tub', 'tap', 'mop', 'axe', 'saw', 'bin', 'can', 'cup', 'mud', 'sky', 'fly', 'ant', 'bee', 'pig', 'cow', 'hen', 'fox', 'duck', 'frog', 'goat', 'deer', 'bear', 'lion', 'wolf', 'crab', 'seal', 'rock', 'sand', 'dirt', 'rain', 'snow', 'wind', 'fire', 'leaf', 'seed', 'root', 'stem', 'bark', 'twig', 'hill', 'cave', 'pond', 'lake', 'sea', 'wave', 'boat', 'flag', 'drum', 'bell', 'ring', 'sofa', 'desk', 'oven', 'sink', 'fork', 'belt', 'comb', 'duck', 'goose', 'swan', 'iron', 'jail', 'kite', 'lamp', 'mask', 'nail', 'pear', 'quack', 'road', 'soap', 'tent', 'unit', 'vase', 'wall', 'yard', 'zero', 'atom', 'base', 'chef', 'dice', 'echo', 'fuel', 'gift', 'hike', 'iron', 'jazz', 'keep', 'mint', 'node', 'otto', 'palm', 'quiz', 'rest', 'salt', 'time', 'user', 'view', 'wild', 'yarn', 'zoom', 'acid', 'bank', 'clay', 'deck', 'exit', 'film', 'gate', 'hulk', 'item', 'junk', 'knot', 'lava', 'maze', 'noon', 'ozon', 'park', 'quid', 'ruby', 'safe', 'tide', 'undo', 'visa', 'west', 'yoga', 'zone', 'army', 'baby', 'cake', 'data', 'east', 'face', 'game', 'hand', 'idea', 'joke', 'kind', 'lamp', 'mail', 'neck', 'open', 'page', 'rain', 'ship', 'test', 'unit', 'verb', 'walk', 'year', 'cupcake', 'icecream', 'snowman', 'keychain', 'popcorn', 'rainbow', 'butterfly', 'sunglasses', 'backpack', 'flashlight', 'jellyfish', 'milkshake', 'airplane', 'football', 'watermelon'],
      medium: ['elephant', 'guitar', 'hamburger', 'island', 'jupiter', 'kangaroo', 'lighthouse', 'mushroom', 'notebook', 'octopus', 'penguin', 'queen', 'rocket', 'strawberry', 'telescope', 'umbrella', 'volcano', 'whale', 'xylophone', 'yacht', 'zebra', 'airplane', 'balloon', 'castle', 'dragon', 'eagle', 'flower', 'glacier', 'helicopter', 'iceberg', 'jungle', 'koala', 'lemon', 'mermaid', 'ninja', 'ostrich', 'pirate', 'quilt', 'robot', 'spaceship', 'tiger', 'unicorn', 'violin', 'wizard', 'diamond', 'camera', 'laptop', 'bridge', 'rainbow', 'statue', 'palace', 'desert', 'forest', 'swamp', 'tunnel', 'anchor', 'magnet', 'compass', 'puzzle', 'ladder', 'mirror', 'candle', 'hammer', 'wrench', 'shovel', 'bucket', 'shield', 'helmet', 'sword', 'arrow', 'cannon', 'bottle', 'kettle', 'toaster', 'blender', 'fridge', 'pillow', 'blanket', 'curtain', 'wallet', 'pocket', 'button', 'zipper', 'glasses', 'watch', 'phone', 'radio', 'stereo', 'piano', 'trumpet', 'flute', 'drums', 'harp', 'cello', 'banjo', 'organ', 'accordian', 'bagpipes', 'clarinet', 'harmonica', 'oboe', 'saxophone', 'tambourine', 'trombone', 'tuba', 'ukulele', 'whistle', 'amplifier', 'microphone', 'speaker', 'turntable', 'cassette', 'record', 'trophy', 'asteroid', 'backpack', 'calendar', 'dynamite', 'envelope', 'firework', 'gasmask', 'handcuff', 'inkwell', 'keyboard', 'lipstick', 'necklace', 'ointment', 'passport', 'quicksand', 'revolver', 'suitcase', 'unicycle', 'vacation', 'wardrobe', 'yogurt', 'zeppelin', 'abacus', 'battery', 'chamber', 'dolphin', 'eclipse', 'fungus', 'goblin', 'harvest', 'impact', 'jacket', 'knight', 'lantern', 'mansion', 'nebula', 'ocean', 'parade', 'quartz', 'rebound', 'sculpt', 'traffic', 'unique', 'victory', 'weather', 'yogurt', 'superhero', 'rollercoaster', 'cheeseburger', 'nightmare', 'sandcastle', 'skateboard', 'spaghetti', 'subway', 'treasure', 'waterfall', 'windmill', 'marshmallow', 'firefighter', 'astronaut'],
      hard: ['architecture', 'asymptote', 'bacillus', 'caricature', 'dandelion', 'eccentric', 'fluorescence', 'geometry', 'hieroglyph', 'idiosyncrasy', 'juxtaposition', 'kaleidoscope', 'labyrinth', 'metallurgy', 'nebulous', 'oblivion', 'parliament', 'quarantine', 'renaissance', 'silhouette', 'theatrical', 'ubiquitous', 'ventilation', 'wavelength', 'xenophobia', 'yesterday', 'zenith', 'alchemy', 'botany', 'chemistry', 'dinosaurs', 'evolution', 'fossils', 'genetics', 'hologram', 'infinity', 'journalism', 'knowledge', 'literature', 'microscope', 'navigation', 'optics', 'philosophy', 'quantum', 'rhetoric', 'sociology', 'taxonomy', 'universe', 'velocity', 'weather', 'yearbook', 'zoology', 'abstract', 'baroque', 'classical', 'dramatic', 'expression', 'futurism', 'gothic', 'heritage', 'impressionism', 'jazz', 'kinetic', 'landscape', 'minimalism', 'naturalism', 'opera', 'portrait', 'realism', 'surrealism', 'tragedy', 'utopia', 'vintage', 'western', 'yogurt', 'zodiac', 'avalanche', 'blizzard', 'cyclone', 'earthquake', 'flood', 'hurricane', 'monsoon', 'tornado', 'tsunami', 'typhoon', 'wildfire', 'nebula', 'galaxy', 'meteor', 'asteroid', 'comet', 'satellite', 'gravity', 'station', 'blackhole', 'spectrogram', 'chromosome', 'photosynthesis', 'metamorphosis', 'archaeology', 'cryptography', 'supernova', 'thermostat', 'vacuum', 'xenon', 'yield', 'zygote', 'whisper', 'vortex', 'utopia', 'treason', 'solstice', 'rhapsody', 'quixotic', 'paradox', 'nostalgia', 'melancholy', 'liminal', 'algorithm', 'biosphere', 'cyclotron', 'diaphragm', 'ecosystem', 'feedback', 'gradient', 'harmonic', 'isotope', 'junction', 'kinetics', 'logarithm', 'momentum', 'neptunium', 'oxidation', 'parallax', 'quotient', 'radiation', 'spectrum', 'topology', 'ultraviolet', 'viscosity', 'waveform', 'constellation', 'archipelago', 'subterranean', 'procrastinate', 'philosophical', 'biodiversity', 'luminescence', 'clandestine', 'extraordinary', 'hallucination', 'superposition']
    },
    fa: {
      easy: ['سیب', 'خانه', 'ماشین', 'خورشید', 'درخت', 'گربه', 'سگ', 'کوه', 'پیتزا', 'دوچرخه', 'ماه', 'ستاره', 'توپ', 'کتاب', 'مداد', 'لیوان', 'کلاه', 'کفش', 'ماهی', 'پرنده', 'اتوبوس', 'تخت', 'در', 'جعبه', 'کلید', 'شیر', 'تخم‌مرغ', 'کیک', 'کیف', 'پنکه', 'قابلمه', 'تابه', 'تور', 'جوهر', 'شیشه', 'هیزم', 'گردو', 'روغن', 'سنجاق', 'موش', 'کراوات', 'کلاه‌گیس', 'بازو', 'پا', 'گوش', 'چشم', 'لب', 'فک', 'انگشت', 'قالی', 'وان', 'شیرآب', 'طی', 'تبر', 'اره', 'سطل', 'قوطی', 'فنجان', 'گل', 'آسمان', 'مگس', 'مورچه', 'زنبور', 'خوک', 'گاو', 'مرغ', 'روباه', 'اردک', 'قورباغه', 'بز', 'آهو', 'خرس', 'شیر', 'گرگ', 'خرچنگ', 'فک', 'سنگ', 'شن', 'خاک', 'باران', 'برف', 'باد', 'آتش', 'برگ', 'دانه', 'ریشه', 'ساقه', 'پوست', 'شاخه', 'تپه', 'غار', 'برکه', 'دریاچه', 'دریا', 'موج', 'قایق', 'پرچم', 'طبل', 'زنگ', 'حلقه', 'مبل', 'میز', 'اجاق', 'سینک', 'چنگال', 'کمربند', 'شانه', 'اردک', 'غاز', 'قو', 'اتو', 'زندان', 'بادبادک', 'لامپ', 'ماسک', 'میخ', 'گلابی', 'جاده', 'صابون', 'چادر', 'واحد', 'گلدان', 'دیوار', 'حیاط', 'صفر', 'اتم', 'پایه', 'آشپز', 'تاس', 'پژواک', 'سوخت', 'هدیه', 'پیاده‌روی', 'جاز', 'نعنا', 'نخل', 'نمک', 'زمان', 'اسید', 'بانک', 'گل', 'عرشه', 'خروج', 'فیلم', 'دروازه', 'غول', 'مورد', 'آشغال', 'گره', 'گدازه', 'هزارتو', 'ظهر', 'اوزون', 'پارک', 'پوند', 'یاقوت', 'امن', 'جزرومد', 'برگشت', 'ویزا', 'غرب', 'یوگا', 'منطقه', 'بستنی', 'آدم_برفی', 'پروانه', 'بادبادک', 'هندوانه', 'خرگوش', 'بادمجان', 'ساندویچ', 'شکلات', 'فوتبال', 'خربزه', 'مدادرنگی'],
      medium: ['فیل', 'گیتار', 'همبرگر', 'جزیره', 'مشتری', 'کانگورو', 'فانوس دریایی', 'قارچ', 'دفترچه', 'هشت‌پا', 'پنگوئن', 'ملکه', 'موشک', 'توت‌فرنگی', 'تلسکوپ', 'چتر', 'آتشفشان', 'نهنگ', 'گورخر', 'هواپیما', 'بادکنک', 'قلعه', 'اژدها', 'عقاب', 'گل', 'یخچال طبیعی', 'هلیکوپتر', 'توده یخ', 'جنگل', 'کوالا', 'لیمو', 'پری دریایی', 'نینجا', 'شترمرغ', 'دزد دریایی', 'لحاف', 'ربات', 'سفینه فضایی', 'ببر', 'تک‌شاخ', 'ویولن', 'جادوگر', 'الماس', 'دوربین', 'لپ‌تاپ', 'پل', 'رنگین‌کمان', 'مجسمه', 'کاخ', 'کویر', 'جنگل', 'مرداب', 'تونل', 'لنگر', 'آهنربا', 'قطب‌نما', 'پازل', 'نردبان', 'آینه', 'شمع', 'چکش', 'آچار', 'بیل', 'سطل', 'سپر', 'کلاهخود', 'شمشیر', 'تیر', 'توپ', 'بطری', 'کتری', 'توستر', 'مخلوط‌کن', 'یخچال', 'بالش', 'پتو', 'پرده', 'کیف‌پول', 'جیب', 'دکمه', 'زیپ', 'عینک', 'ساعت', 'تلفن', 'رادیو', 'استریو', 'پیانو', 'شیپور', 'فلوت', 'تنبک', 'چنگ', 'سنتور', 'آکاردئون', 'نی‌انبان', 'کلارینت', 'سازدهنی', 'ابوا', 'ساکسیفون', 'دایره‌زنگی', 'ترومبون', 'توبا', 'یوکللی', 'سوت', 'آمپلی‌فایر', 'میکروفون', 'بلندگو', 'گرامافون', 'کاست', 'صفحه', 'تندیس', 'سیارک', 'کوله_پشتی', 'تقویم', 'دینامیت', 'پاکت_نامه', 'آتش_بازی', 'ماسک_گاز', 'دستبند', 'دوات', 'صفحه_کلید', 'رژ_لب', 'کوهستان', 'گردنبند', 'پماد', 'گذرنامه', 'شن_روان', 'هفت_تیر', 'چمدان', 'تلسکوپ', 'یک_چرخه', 'تعطیلات', 'کمد_لباس', 'زپلین', 'ابرقهرمان', 'ترن_هوایی', 'میکروسکوپ', 'کلوچه', 'رنگین_کمان', 'آتشنشان', 'فضانورد', 'گنجینه', 'ستاره_دریایی', 'آبشار'],
      hard: ['معماری', 'مجانب', 'باسیل', 'کاریکاتور', 'قاصدک', 'گریز از مرکز', 'فلورسانس', 'هندسه', 'هیروگلیف', 'ویژگی خاص', 'همجواری', 'زیبانما', 'ماز', 'متالورژی', 'مبهم', 'فراموشی', 'پارلمان', 'قرنظینه', 'رنسانس', 'ضدنور', 'تئاتری', 'فراگیر', 'تهویه', 'طول موج', 'بیگانه‌هراسی', 'دیروز', 'اوج', 'کیمیاگری', 'گیاه‌شناسی', 'شیمی', 'دایناسورها', 'تکامل', 'فسیل‌ها', 'ژنتیک', 'هولوگرام', 'بی‌نهایت', 'روزنامه‌نگاری', 'دانش', 'ادبیات', 'میکروسکوپ', 'ناوبری', 'اپتیک', 'فلسفه', 'کوانتوم', 'بلاغت', 'جامعه‌شناسی', 'آرایه‌شناسی', 'جهان', 'تندی', 'آب و هوا', 'سالنامه', 'جانورشناسی', 'انتزاعی', 'باروک', 'کلاسیک', 'دراماتیک', 'بیان', 'آینده‌گری', 'گوتیک', 'میراث', 'امپرسیونیسم', 'جاز', 'جنبشی', 'چشم‌انداز', 'مینیمالیسم', 'رئالیسم', 'اپرا', 'پرتره', 'واقع‌گرایی', 'سوررئالیسم', 'تراژدی', 'آرمان‌شهر', 'کلاسیک', 'وسترن', 'ماست', 'منطقه البروج', 'بهمن', 'کولاک', 'طوفان', 'زلزله', 'سیل', 'گردباد', 'مونسون', 'سونامی', 'آتش‌سوزی', 'سحابی', 'کهکشان', 'شهاب', 'سیارک', 'دنباله‌دار', 'ماهواره', 'جاذبه', 'ایستگاه', 'سیاه‌چاله', 'اسپکتروگرام', 'کروموزوم', 'فتوسنتز', 'دگردیسی', 'باستان‌شناسی', 'رمزنگاری', 'ابرنواختر', 'ترموستات', 'خلاء', 'سرعت', 'گزنون', 'بازده', 'زیگوت', 'اوج', 'نجوا', 'گرداب', 'آرمان‌شهر', 'خیانت', 'انقلاب‌تابستانی', 'راپسودی', 'خیالی', 'پارادوکس', 'نوستالژی', 'ملانکولی', 'آستانه‌ای', 'الگوریتم', 'زیست‌کره', 'سیکلوترون', 'دیافراگم', 'اکوسیستم', 'بازخورد', 'گرادیان', 'هارمونیک', 'ایزوتوپ', 'پیوند', 'سینتیک', 'لگاریتم', 'تکانه', 'نپتونیوم', 'اکسیداسیون', 'اختلاف_منظر', 'خارج_قسمت', 'تابش', 'طیف', 'توپولوژی', 'فرابنفش', 'گرانروی', 'شکل_موج', 'صورت_فلکی', 'دایناسور', 'شخصیت_پردازی', 'فضای_مجازی', 'زیست_فناوری', 'متافیزیک', 'ماکاو_آبی', 'میکروارگانیسم', 'برنامه_نویسی']
    }
  };

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

    // Get combined word list based on difficulty
    const lang = room.settings.language || 'en';
    const difficulty = room.settings.difficulty || 'medium';
    let words: string[] = [];
    
    if (difficulty === 'easy') {
      words = wordsList[lang].easy;
    } else if (difficulty === 'medium') {
      words = [...wordsList[lang].easy, ...wordsList[lang].medium];
    } else {
      words = [...wordsList[lang].easy, ...wordsList[lang].medium, ...wordsList[lang].hard];
    }

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
      if (!currentRoom) {
        clearInterval(timer);
        timers.delete(roomId);
        return;
      }

      if (currentRoom.status === 'playing') {
        if (!currentRoom.isPaused) {
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
          // Keep emitting timer update even if paused to ensure UI is in sync
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

  // Vite middleware setup
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
