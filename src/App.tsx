import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Users, Trophy, Send, Terminal, Play, LogIn, Plus, Info, X, LogOut, Settings, ShieldCheck, UserMinus, Pause, Check } from 'lucide-react';
import DrawingCanvas from './components/DrawingCanvas';
import { GameState, Player } from './types';
import confetti from 'canvas-confetti';

const socket: Socket = io();

export default function App() {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [joined, setJoined] = useState(false);
  const [guess, setGuess] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.on('room_update', (state: GameState) => {
      setGameState(state);
    });

    socket.on('drawing_sync', (drawingData: any[]) => {
      setGameState(prev => prev ? { ...prev, drawingData } : null);
    });

    socket.on('correct_guess', ({ playerName, word }) => {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    });

    socket.on('timer_update', (timeLeft: number) => {
      setGameState(prev => prev ? { ...prev, roundTimeLeft: timeLeft } : null);
    });

    socket.on('error', (msg: string) => {
      alert(msg);
      setJoined(false);
    });

    return () => {
      socket.off('room_update');
      socket.off('drawing_sync');
      socket.off('correct_guess');
      socket.off('timer_update');
      socket.off('error');
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState?.guesses]);

  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<any>(null);

  useEffect(() => {
    if (gameState && !pendingSettings && showSettings) {
      setPendingSettings(gameState.settings);
    }
  }, [showSettings, gameState]);

  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [copied]);

  const joinRoom = (id: string) => {
    if (!playerName) return;
    socket.emit('join_room', { roomId: id, playerName });
    setRoomId(id);
    setJoined(true);
  };

  const updateSettings = (settings: any) => {
    if (gameState) {
      socket.emit('update_settings', { roomId: gameState.id, settings });
      setShowSettings(false);
    }
  };

  const togglePause = () => {
    if (gameState && isHost) {
      socket.emit('toggle_pause', { roomId: gameState.id });
    }
  };

  const kickPlayer = (playerId: string) => {
    if (gameState) {
      socket.emit('kick_player', { roomId: gameState.id, playerId });
    }
  };

  const createRoom = () => {
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    joinRoom(newId);
  };

  const startGame = () => {
    if (gameState) {
      socket.emit('start_game', { roomId: gameState.id });
    }
  };

  const sendGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guess.trim() || !gameState) return;
    socket.emit('guess', { roomId: gameState.id, text: guess });
    setGuess('');
  };

  const handleDraw = (drawingData: any[]) => {
    if (gameState) {
      socket.emit('draw_event', { roomId: gameState.id, drawingData });
    }
  };

  const handleFinish = () => {
    if (gameState && isDrawer) {
      socket.emit('finish_drawing', { roomId: gameState.id });
    }
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4 font-sans uppercase">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-12 rounded-none border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] w-full max-w-md"
        >
          <div className="flex flex-col items-center gap-2 mb-10 text-center">
            <h1 className="text-5xl font-black italic tracking-tighter leading-none">DEEP SKETCH</h1>
            <div className="bg-sketch-yellow border-2 border-black px-4 py-1 text-[10px] font-bold tracking-[0.2em]">
              MULTIPLAYER
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <label className="block text-xs font-black mb-2 tracking-widest">Artist Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="TYPE HERE..."
                className="w-full px-4 py-4 border-2 border-black text-sm font-bold focus:outline-none focus:bg-sketch-yellow/10 transition-all placeholder:text-black/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <button
                onClick={createRoom}
                disabled={!playerName}
                className="flex flex-col items-center justify-center p-6 border-2 border-black bg-white hover:bg-sketch-yellow transition-colors disabled:opacity-50 active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <Plus className="w-8 h-8 mb-2" />
                <span className="text-[10px] font-black">NEW GAME</span>
              </button>
              
              <div className="relative">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  className="w-full h-full px-4 pt-10 pb-4 border-2 border-black text-center font-black tracking-widest focus:outline-none focus:bg-sketch-blue/10 transition-all placeholder:text-black/10"
                />
                <span className="absolute top-3 left-0 right-0 text-[9px] font-black text-black/40 text-center pointer-events-none tracking-widest">ROOM CODE</span>
              </div>
            </div>

            <button
              onClick={() => joinRoom(roomId)}
              disabled={!playerName || !roomId}
              className="w-full py-5 bg-black text-white font-black text-sm tracking-widest hover:bg-sketch-red transition-all disabled:opacity-50 flex items-center justify-center gap-3 active:translate-y-1"
            >
              <LogIn className="w-5 h-5" />
              JOIN MATCH ⏎
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!gameState) return <div className="flex items-center justify-center h-screen font-mono">Connecting...</div>;

  const isHost = socket.id === gameState.hostId;
  const isDrawer = socket.id === gameState.currentDrawerId;

  return (
    <div className="h-screen bg-cream flex flex-col font-sans overflow-hidden">
      {/* Header Bar */}
      <header className="h-20 bg-white border-b-2 border-black flex items-center justify-between px-8 z-30">
        <div className="flex items-center gap-6">
          <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none">DEEP SKETCH</h1>
          <div 
            onClick={() => {
              navigator.clipboard.writeText(gameState.id);
              setCopied(true);
            }}
            className="bg-black text-white px-4 py-1 text-[10px] font-bold tracking-[0.2em] cursor-pointer hover:bg-sketch-red transition-colors"
          >
            {copied ? 'COPIED!' : `ROOM: #${gameState.id}`}
          </div>
          <button 
            onClick={() => setShowRules(true)}
            className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-sketch-yellow transition-colors group"
            title="Rules"
          >
            <Info className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
          {isHost && (
            <button 
              onClick={() => setShowControls(true)}
              className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-sketch-green transition-colors group"
              title="Control Room"
            >
              <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
          )}
          {isHost && gameState.status === 'lobby' && (
            <button 
              onClick={() => setShowSettings(true)}
              className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-sketch-blue transition-colors group"
              title="Room Settings"
            >
              <Settings className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
          )}
          <button 
            onClick={() => window.location.reload()}
            className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-sketch-red hover:text-white transition-colors group"
            title="Exit Game"
          >
            <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
          
          {isHost && gameState.status === 'playing' && (
            <button 
              onClick={togglePause}
              className={`w-10 h-10 border-2 border-black flex items-center justify-center transition-colors group ${gameState.isPaused ? 'bg-sketch-green animate-pulse' : 'hover:bg-sketch-yellow'}`}
              title={gameState.isPaused ? "Resume Game" : "Pause Game"}
            >
              {gameState.isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-10">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase font-black text-black/30 leading-none mb-1">Time Left</span>
            <span className="text-3xl font-mono font-bold leading-none">
              {gameState.isPaused ? (
                <span className="text-sketch-red animate-pulse">PAUSED</span>
              ) : (
                `00:${gameState.roundTimeLeft.toString().padStart(2, '0')}`
              )}
            </span>
          </div>
          
          <div className="h-12 w-[2px] bg-black/10" />

          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-black text-black/30 leading-none mb-1">
              {gameState.phase === 'guessing' ? 'GUESS NOW!' : 'The Word'}
            </span>
            <div className="flex gap-1">
              {isDrawer || gameState.phase === 'guessing' ? (
                <span className={`text-xl font-black tracking-widest border-b-2 border-black italic px-2 ${gameState.phase === 'guessing' ? 'bg-sketch-green text-white animate-bounce' : 'bg-sketch-yellow'}`}>
                  {gameState.phase === 'guessing' && !isDrawer ? '???' : gameState.currentWord}
                </span>
              ) : (
                gameState.currentWord?.split('').map((_, i) => (
                  <span key={i} className="w-6 h-8 border-b-2 border-black/20 flex items-center justify-center text-xl font-black opacity-30">_</span>
                ))
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Players */}
        <aside className="w-72 border-r-2 border-black bg-white flex flex-col">
          <div className="p-4 border-b border-black/10 flex justify-between items-center bg-gray-50">
            <span className="text-[10px] font-black uppercase tracking-widest text-black/50">Players</span>
            <span className="text-xs font-mono font-bold">{gameState.players.length}/08</span>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {gameState.players.sort((a, b) => b.points - a.points).map((player, idx) => (
                <motion.div
                  key={player.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`p-6 border-b border-black/10 flex items-center gap-4 group transition-colors ${
                    player.id === gameState.currentDrawerId ? 'bg-sketch-yellow/20' : player.id === socket.id ? 'bg-sketch-blue/10' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-10 h-10 border-2 border-black flex items-center justify-center font-bold text-sm ${
                    idx === 0 ? 'bg-sketch-yellow' : idx === 1 ? 'bg-sketch-blue' : idx === 2 ? 'bg-sketch-red' : 'bg-white'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm truncate uppercase tracking-tight">
                        {player.name} {player.id === socket.id && '(YOU)'}
                      </span>
                      {player.id === gameState.currentDrawerId && (
                        <div className="bg-black text-white px-2 py-0.5 text-[8px] font-bold tracking-widest uppercase italic animate-pulse">DRAWING</div>
                      )}
                    </div>
                    <div className="text-[10px] font-mono font-bold text-black/40 uppercase tracking-tighter">
                      {player.points} PTS
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="p-4 border-t-2 border-black bg-white">
            {gameState.status === 'lobby' && (
              isHost ? (
                <button
                  onClick={startGame}
                  className="w-full py-4 bg-black text-white font-black text-xs uppercase tracking-widest hover:bg-sketch-red transition-all active:translate-y-1"
                >
                  START MATCH ⏎
                </button>
              ) : (
                <div className="text-center p-4 border-2 border-dashed border-black/10 text-[10px] font-black uppercase text-black/30 animate-pulse italic">
                  Waiting for host...
                </div>
              )
            )}
            {gameState.status === 'playing' && (
              <div className="text-center text-[10px] font-black uppercase tracking-widest text-black/40 py-2">
                ROUND IN PROGRESS
              </div>
            )}
          </div>
        </aside>

        {/* Center: Canvas Area */}
        <section className="flex-1 flex flex-col bg-[#EEE] relative overflow-hidden">
          <div className="m-12 flex-1 bg-white border-2 border-black shadow-[16px_16px_0px_0px_rgba(0,0,0,0.05)] relative overflow-hidden group">
            <DrawingCanvas
              isDrawer={isDrawer && gameState.status === 'playing'}
              drawingData={gameState.drawingData}
              onDraw={handleDraw}
              onFinish={handleFinish}
            />

            {gameState.status === 'round_end' && (
              <div className="absolute inset-0 z-40 bg-black/90 flex items-center justify-center backdrop-blur-sm">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center text-white"
                >
                  <Trophy className="w-24 h-24 mx-auto mb-6 text-sketch-yellow" />
                  <h2 className="text-6xl font-black italic tracking-tighter mb-4 uppercase">Round Over!</h2>
                  <div className="inline-block border-2 border-white px-8 py-3 bg-sketch-red">
                    <p className="text-sm font-black uppercase tracking-[0.2em] mb-1 opacity-70">The Word Was</p>
                    <p className="text-3xl font-black uppercase tracking-widest">{gameState.currentWord}</p>
                  </div>
                </motion.div>
              </div>
            )}

            {gameState.status === 'game_over' && (
              <div className="absolute inset-0 z-50 bg-black flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center text-white p-12"
                >
                  <Trophy className="w-32 h-32 mx-auto mb-8 text-sketch-yellow animate-bounce" />
                  <h2 className="text-7xl font-black italic tracking-tighter mb-4 uppercase">Game Over!</h2>
                  <div className="mb-12">
                    <p className="text-xl font-black uppercase tracking-[0.3em] text-sketch-yellow mb-2">The Winner is</p>
                    <p className="text-5xl font-black uppercase bg-white text-black py-4 px-10 inline-block italic">
                      {gameState.players.sort((a, b) => b.points - a.points)[0]?.name}
                    </p>
                  </div>
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-10 py-5 bg-sketch-red text-white font-black text-xl tracking-widest hover:bg-white hover:text-black transition-all uppercase border-4 border-white"
                  >
                    PLAY AGAIN ⏎
                  </button>
                </motion.div>
              </div>
            )}
          </div>

          <div className="h-20 px-12 flex items-center gap-6 bg-white border-t-2 border-black">
            <div className="h-3 flex-1 bg-black/5 border border-black/10 overflow-hidden relative">
              <motion.div 
                className="h-full bg-black"
                initial={{ width: "100%" }}
                animate={{ width: `${(gameState.roundTimeLeft / gameState.settings.roundTime) * 100}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
            <div className="text-[12px] font-black uppercase italic tracking-widest flex items-center gap-2">
              <span className={`w-2 h-2 animate-pulse ${gameState.phase === 'guessing' ? 'bg-sketch-green' : 'bg-sketch-red'}`} />
              {gameState.status === 'playing' ? (gameState.phase === 'guessing' ? 'GUESSING PHASE' : 'SKETCHING PHASE') : 'MATCH STANDBY'}
            </div>
          </div>
        </section>

        {/* Right Sidebar: Chat/Guesses */}
        <aside className="w-80 border-l-2 border-black bg-white flex flex-col">
          <div className="p-4 border-b border-black/10 bg-gray-50 flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-black/50">Live Activity</span>
            <div className="h-2 w-2 bg-sketch-green rounded-full animate-pulse" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-[11px] font-bold">
            {gameState.guesses.map((g, i) => (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                key={i} 
                className={`flex gap-3 leading-tight ${
                  g.isCorrect ? 'text-sketch-green bg-sketch-green/5 p-2 border border-sketch-green/20' : 'text-black/60'
                }`}
              >
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex justify-between w-full opacity-40 text-[9px]">
                    <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <div>
                    <span className={`uppercase ${g.isCorrect ? 'font-black' : ''}`}>
                      {g.playerName || gameState.players.find(p => p.id === g.playerId)?.name}:
                    </span>
                    <span className="ml-2 font-normal">
                      {g.isCorrect ? (
                        <span className="font-black italic bg-sketch-green text-white px-2 py-0.5 rounded-sm">GUESSED THE WORD! 🎉</span>
                      ) : (
                        g.text
                      )}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
            <div ref={chatEndRef} />
            
            {gameState.guesses.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-10 grayscale text-center p-10">
                <Terminal className="w-12 h-12 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">No guesses yet...</p>
              </div>
            )}
          </div>

          <div className="p-6 border-t-2 border-black bg-white">
            <form onSubmit={sendGuess} className="relative group">
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                disabled={isDrawer || gameState.status !== 'playing' || gameState.phase !== 'guessing'}
                placeholder={isDrawer ? "CAN'T GUESS WHILE DRAWING" : gameState.phase !== 'guessing' ? "WAIT FOR DRAWING TO FINISH" : "TYPE YOUR GUESS..."}
                className="w-full border-2 border-black p-4 text-[11px] font-black uppercase tracking-widest focus:outline-none focus:bg-sketch-yellow/10 transition-all placeholder:text-black/20 disabled:bg-gray-100 disabled:opacity-50"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20 font-black text-xs pointer-events-none group-focus-within:opacity-100 transition-opacity">
                RET ⏎
              </div>
            </form>
          </div>
        </aside>
      </main>

      <footer className="h-10 bg-black text-white flex items-center justify-between px-8 text-[9px] uppercase font-black tracking-[0.2em]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-sketch-green rounded-full" />
            SERVER: CONNECTED
          </span>
          <span className="opacity-40">LATENCY: 42MS</span>
        </div>
        <div className="flex gap-8">
          <span>UID: {socket.id?.substring(0, 8)}</span>
          <span className="text-sketch-yellow">DeepInk Team</span>
        </div>
      </footer>

      {/* Rules Modal */}
      <AnimatePresence>
        {showRules && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 uppercase"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white border-4 border-black p-8 max-w-lg w-full relative shadow-[16px_16px_0px_0px_rgba(0,0,0,1)]"
            >
              <button 
                onClick={() => setShowRules(false)}
                className="absolute top-4 right-4 w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-sketch-red transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-4xl font-black italic tracking-tighter mb-8 border-b-4 border-black pb-2">Deep Sketch Rules</h2>
              
              <div className="space-y-6 list-none font-bold text-sm tracking-tight text-black/80">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-sketch-yellow border-2 border-black flex items-center justify-center shrink-0 font-black italic">ART</div>
                  <div>
                    <p className="font-black text-black uppercase tracking-tight">The Sketching Phase</p>
                    <p className="text-[11px] leading-tight">Artist gets a secret word. Visualize it before time runs out! NO LETTERS OR NUMBERS.</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-sketch-blue border-2 border-black flex items-center justify-center shrink-0 font-black italic text-white text-xs">FIN</div>
                  <div>
                    <p className="font-black text-black uppercase tracking-tight">Guessing Phase (+100 PTS)</p>
                    <p className="text-[11px] leading-tight">Guessers earn <span className="bg-sketch-green text-white px-1">100 points</span> for a correct word. Artist earns <span className="bg-sketch-yellow px-1">50 points</span> per correct guess!</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-sketch-red border-2 border-black flex items-center justify-center shrink-0 font-black italic text-white text-xs">WIN</div>
                  <div>
                    <p className="font-black text-black uppercase tracking-tight">Victory Condition</p>
                    <p className="text-[11px] leading-tight">First player to reach the winning point threshold (default 1000) wins the entire match!</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-black text-white border-2 border-black flex items-center justify-center shrink-0 text-xs italic font-black">TIP</div>
                  <p className="text-[11px]">Dashed lines ([ - - - ]) are perfect for drawing invisible paths, movement, or abstract concepts!</p>
                </div>
              </div>

              <button 
                onClick={() => setShowRules(false)}
                className="w-full py-4 bg-black text-white font-black text-xs tracking-widest hover:bg-sketch-green transition-all uppercase mt-10 active:translate-y-1"
              >
                GOT IT! ⏎
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Host Controls Modal */}
      <AnimatePresence>
        {showControls && gameState && isHost && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 uppercase"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white border-4 border-black p-8 max-w-lg w-full relative shadow-[16px_16px_0px_0px_rgba(0,0,0,1)]"
            >
              <button 
                onClick={() => setShowControls(false)}
                className="absolute top-4 right-4 w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-sketch-red transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-4xl font-black italic tracking-tighter mb-8 border-b-4 border-black pb-2">Control Room</h2>
              
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                <p className="text-[10px] font-black text-black/40 tracking-[0.2em] mb-4">Manage Players</p>
                
                {gameState.players.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-4 border-2 border-black bg-gray-50">
                    <div className="flex flex-col">
                      <span className="font-black text-sm">{p.name}</span>
                      <span className="text-[9px] font-mono opacity-40">{p.id.substring(0, 8)}</span>
                    </div>
                    {p.id !== socket.id && (
                      <button 
                        onClick={() => kickPlayer(p.id)}
                        className="bg-black text-white p-2 hover:bg-sketch-red transition-colors"
                        title="Kick Player"
                      >
                        <UserMinus size={16} />
                      </button>
                    )}
                    {p.id === socket.id && (
                      <span className="text-[9px] font-black bg-sketch-green px-2 py-1">HOST</span>
                    )}
                  </div>
                ))}

                {gameState.players.length === 1 && (
                  <div className="text-center py-10 border-2 border-dashed border-black/10 text-[10px] font-black opacity-30 italic">
                    Invite some rivals!
                  </div>
                )}
              </div>

              <button 
                onClick={() => setShowControls(false)}
                className="w-full py-4 bg-black text-white font-black text-xs tracking-widest hover:bg-sketch-green transition-all uppercase mt-10 active:translate-y-1"
              >
                BACK TO GAME ⏎
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && gameState && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 uppercase"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white border-4 border-black p-8 max-w-lg w-full relative shadow-[16px_16px_0px_0px_rgba(0,0,0,1)]"
            >
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-4 right-4 w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-sketch-red transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-4xl font-black italic tracking-tighter mb-8 border-b-4 border-black pb-2">Room Settings</h2>
              
              <div className="space-y-8 font-bold text-sm tracking-tight">
                {pendingSettings && (
                  <>
                    <div>
                      <label className="block text-[10px] font-black mb-3 text-black/40 tracking-widest">Language</label>
                      <div className="flex gap-4">
                        {['en', 'fa'].map(lang => (
                          <button
                            key={lang}
                            onClick={() => setPendingSettings({ ...pendingSettings, language: lang })}
                            className={`flex-1 py-3 border-2 border-black font-black transition-all ${
                              pendingSettings.language === lang ? 'bg-sketch-green text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white hover:bg-gray-50'
                            }`}
                          >
                            {lang === 'en' ? 'ENGLISH' : 'FARSI (FA)'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black mb-3 text-black/40 tracking-widest">Guessing Time After Drawn (Seconds)</label>
                      <div className="flex gap-4">
                        {[15, 30, 45, 60].map(time => (
                          <button
                            key={time}
                            onClick={() => setPendingSettings({ ...pendingSettings, guessingTimeAfterFinish: time })}
                            className={`flex-1 py-3 border-2 border-black font-black transition-all ${
                              pendingSettings.guessingTimeAfterFinish === time ? 'bg-sketch-red text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white hover:bg-gray-50'
                            }`}
                          >
                            {time}S
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black mb-3 text-black/40 tracking-widest">Round Time (Seconds)</label>
                      <div className="flex gap-4">
                        {[30, 60, 90, 120].map(time => (
                          <button
                            key={time}
                            onClick={() => setPendingSettings({ ...pendingSettings, roundTime: time })}
                            className={`flex-1 py-3 border-2 border-black font-black transition-all ${
                              pendingSettings.roundTime === time ? 'bg-sketch-yellow shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white hover:bg-gray-50'
                            }`}
                          >
                            {time}S
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black mb-3 text-black/40 tracking-widest">Max Players</label>
                      <div className="flex gap-4">
                        {[4, 8, 12, 16].map(max => (
                          <button
                            key={max}
                            onClick={() => setPendingSettings({ ...pendingSettings, maxPlayers: max })}
                            className={`flex-1 py-3 border-2 border-black font-black transition-all ${
                              pendingSettings.maxPlayers === max ? 'bg-sketch-blue shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white hover:bg-gray-50'
                            }`}
                          >
                            {max}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black mb-3 text-black/40 tracking-widest">Winning Points</label>
                      <div className="flex gap-4">
                        {[500, 1000, 2000, 5000].map(points => (
                          <button
                            key={points}
                            onClick={() => setPendingSettings({ ...pendingSettings, winningPoints: points })}
                            className={`flex-1 py-3 border-2 border-black font-black transition-all ${
                              pendingSettings.winningPoints === points ? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]' : 'bg-white hover:bg-gray-50'
                            }`}
                          >
                            {points}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-4 mt-10">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="flex-1 py-4 border-2 border-black font-black text-xs tracking-widest hover:bg-gray-100 transition-all uppercase active:translate-y-1"
                >
                  CANCEL
                </button>
                <button 
                  onClick={() => updateSettings(pendingSettings)}
                  className="flex-1 py-4 bg-black text-white font-black text-xs tracking-widest hover:bg-sketch-green transition-all uppercase active:translate-y-1 flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  CONFIRM ⏎
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
