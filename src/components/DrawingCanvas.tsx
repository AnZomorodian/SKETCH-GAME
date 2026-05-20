import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Ellipse, RegularPolygon, Text as KonvaText } from 'react-konva';
import { Undo2, Redo2, MousePointer2, Pencil, Eraser, Square, Circle as CircleIcon, Move, Type, Triangle, Hexagon } from 'lucide-react';

interface DrawingCanvasProps {
  isDrawer: boolean;
  drawingData: any[];
  onDraw?: (data: any[]) => void;
  onFinish?: () => void;
}

export default function DrawingCanvas({ isDrawer, drawingData, onDraw, onFinish }: DrawingCanvasProps) {
  const [lines, setLines] = useState<any[]>(drawingData);
  const [redoStack, setRedoStack] = useState<any[][]>([]);
  const isDrawing = useRef(false);
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [tool, setTool] = useState<'pen' | 'eraser' | 'rect' | 'circle' | 'ellipse' | 'polygon' | 'text' | 'pan'>('pen');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [dash, setDash] = useState<number[] | undefined>(undefined);
  const [fontSize, setFontSize] = useState(20);
  const [fontFamily, setFontFamily] = useState('Space Grotesk');
  const [polygonSides, setPolygonSides] = useState(6); // Default to Hexagon
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoomSensitivity, setZoomSensitivity] = useState(0.1); 

  const colors = ['#000000', '#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', '#FF9F43', '#A29BFE', '#FFFFFF'];

  useEffect(() => {
    setLines(drawingData);
  }, [drawingData]);

  // Handle stage resize dynamically using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    
    observer.observe(containerRef.current);
    
    // Set initial size
    const initialWidth = containerRef.current.offsetWidth;
    const initialHeight = containerRef.current.offsetHeight;
    if (initialWidth > 0 && initialHeight > 0) {
      setDimensions({ width: initialWidth, height: initialHeight });
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  // Listen for reset canvas focus event
  useEffect(() => {
    const handleResetFocus = () => {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    };

    window.addEventListener('reset-canvas-focus', handleResetFocus);
    return () => {
      window.removeEventListener('reset-canvas-focus', handleResetFocus);
    };
  }, []);

  const handleMouseDown = (e: any) => {
    if (!isDrawer || tool === 'pan') return;
    
    isDrawing.current = true;
    const stage = e.target.getStage();
    const pos = stage.getRelativePointerPosition();
    
    let newLine: any;
    if (tool === 'pen' || tool === 'eraser') {
      newLine = {
        tool,
        points: [pos.x, pos.y],
        stroke: tool === 'eraser' ? '#FFFFFF' : color,
        strokeWidth: strokeWidth,
        dash: dash,
        type: 'line'
      };
    } else if (tool === 'rect') {
      newLine = {
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        stroke: color,
        strokeWidth: strokeWidth,
        dash: dash,
        type: 'rect'
      };
    } else if (tool === 'circle') {
      newLine = {
        x: pos.x,
        y: pos.y,
        radius: 0,
        stroke: color,
        strokeWidth: strokeWidth,
        dash: dash,
        type: 'circle'
      };
    } else if (tool === 'ellipse') {
      newLine = {
        x: pos.x,
        y: pos.y,
        radiusX: 0,
        radiusY: 0,
        stroke: color,
        strokeWidth: strokeWidth,
        dash: dash,
        type: 'ellipse'
      };
    } else if (tool === 'polygon') {
      newLine = {
        x: pos.x,
        y: pos.y,
        sides: polygonSides,
        radius: 0,
        stroke: color,
        strokeWidth: strokeWidth,
        dash: dash,
        type: 'polygon'
      };
    } else if (tool === 'text') {
      const textValue = prompt('Enter text:');
      if (textValue) {
        newLine = {
          x: pos.x,
          y: pos.y,
          text: textValue,
          fontSize: fontSize,
          fontFamily: fontFamily,
          fill: color,
          type: 'text'
        };
      } else {
        isDrawing.current = false;
        return;
      }
    }

    const newLines = [...lines, newLine];
    setLines(newLines);
    setRedoStack([]); // Clear redo on new action
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current || !isDrawer || tool === 'pan') return;

    const stage = e.target.getStage();
    const pos = stage.getRelativePointerPosition();
    const lastIndex = lines.length - 1;
    const lastItem = { ...lines[lastIndex] };

    if (tool === 'pen' || tool === 'eraser') {
      lastItem.points = lastItem.points.concat([pos.x, pos.y]);
    } else if (tool === 'rect') {
      lastItem.width = pos.x - lastItem.x;
      lastItem.height = pos.y - lastItem.y;
    } else if (tool === 'circle') {
      lastItem.radius = Math.sqrt(Math.pow(pos.x - lastItem.x, 2) + Math.pow(pos.y - lastItem.y, 2));
    } else if (tool === 'ellipse') {
      lastItem.radiusX = Math.abs(pos.x - lastItem.x);
      lastItem.radiusY = Math.abs(pos.y - lastItem.y);
    } else if (tool === 'polygon') {
      lastItem.radius = Math.sqrt(Math.pow(pos.x - lastItem.x, 2) + Math.pow(pos.y - lastItem.y, 2));
    }

    const newLines = lines.slice(0, lastIndex).concat(lastItem);
    setLines(newLines);
  };

  const handleMouseUp = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      if (onDraw) onDraw(lines);
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const speed = 1 + (zoomSensitivity * direction);
    const newScale = oldScale * speed;

    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const undo = useCallback(() => {
    if (lines.length === 0) return;
    const newLines = lines.slice(0, -1);
    const removedItem = lines[lines.length - 1];
    setRedoStack(prev => [...prev, [removedItem]]);
    setLines(newLines);
    if (onDraw) onDraw(newLines);
  }, [lines, onDraw]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const lastRedoBatch = redoStack[redoStack.length - 1];
    const newLines = [...lines, ...lastRedoBatch];
    setRedoStack(prev => prev.slice(0, -1));
    setLines(newLines);
    if (onDraw) onDraw(newLines);
  }, [lines, redoStack, onDraw]);

  const clearCanvas = () => {
    setLines([]);
    setRedoStack([]);
    if (onDraw) onDraw([]);
  };

  return (
    <div ref={containerRef} className="bg-white overflow-hidden aspect-[4/3] relative group w-full h-full border-2 border-black">
      <Stage
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        onWheel={handleWheel}
        ref={stageRef}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable={tool === 'pan'}
        style={{ cursor: tool === 'pan' ? 'grab' : isDrawer ? 'crosshair' : 'default' }}
      >
        <Layer>
          {lines.map((item, i) => {
            if (item.type === 'rect') {
              return <Rect key={i} {...item} fill="transparent" />;
            } else if (item.type === 'circle') {
              return <Circle key={i} {...item} fill="transparent" />;
            } else if (item.type === 'ellipse') {
              return <Ellipse key={i} {...item} fill="transparent" />;
            } else if (item.type === 'polygon') {
              return <RegularPolygon key={i} {...item} fill="transparent" />;
            } else if (item.type === 'text') {
              return <KonvaText key={i} {...item} />;
            }
            return (
              <Line
                key={i}
                points={item.points}
                stroke={item.stroke || '#000000'}
                strokeWidth={item.strokeWidth || 5}
                dash={item.dash}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={item.tool === 'eraser' ? 'destination-out' : 'source-over'}
              />
            );
          })}
        </Layer>
      </Stage>
      
      {isDrawer && (
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
          {/* History Controls */}
          <div className="flex gap-2 bg-white border-2 border-black p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <button onClick={undo} className="p-2 hover:bg-gray-100 disabled:opacity-30" disabled={lines.length === 0} title="Undo (Control + Z)">
              <Undo2 size={16} />
            </button>
            <button onClick={redo} className="p-2 hover:bg-gray-100 disabled:opacity-30" disabled={redoStack.length === 0} title="Redo (Control + Y)">
              <Redo2 size={16} />
            </button>
            <button onClick={clearCanvas} className="p-2 hover:bg-red-50 text-red-600 font-black text-[10px] uppercase" title="Clear All - Remove everything from the canvas">
              CLR
            </button>
            <button 
              onClick={onFinish} 
              className="p-2 bg-black text-white hover:bg-sketch-green transition-colors font-black text-[10px] uppercase"
              title="Finish Drawing - Let others guess the word!"
            >
              FIN
            </button>
          </div>

          {/* Tools Selection */}
          <div className="bg-white border-2 border-black p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-1">
              <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} icon={<Pencil size={18} />} title="Pencil Tool: Draw freehand lines with your current color and stroke settings" />
              <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} icon={<Eraser size={18} />} title="Eraser Tool: Remove parts of your drawing by drawing over them" />
              <ToolBtn active={tool === 'rect'} onClick={() => setTool('rect')} icon={<Square size={18} />} title="Rectangle Tool: Click and drag to create perfect rectangles or squares" />
              <ToolBtn active={tool === 'circle'} onClick={() => setTool('circle')} icon={<CircleIcon size={18} />} title="Circle Tool: Click and drag to create uniform circles" />
              <ToolBtn active={tool === 'ellipse'} onClick={() => setTool('ellipse')} icon={<CircleIcon size={18} className="scale-x-125" />} title="Ellipse Tool: Create oval shapes by dragging" />
              <ToolBtn active={tool === 'polygon'} onClick={() => setTool('polygon')} icon={<Hexagon size={18} />} title="Polygon Tool: Click and drag to create custom polygons with adjustable sides (e.g. Hexagon, Octagon)" />
              <ToolBtn active={tool === 'text'} onClick={() => setTool('text')} icon={<Type size={18} />} title="Text Tool: Click anywhere on the canvas to type a label or message" />
              <ToolBtn active={tool === 'pan'} onClick={() => setTool('pan')} icon={<Move size={18} />} title="Pan & Zoom Tool: Click and drag to navigate the canvas. Use mouse wheel to zoom." />
              <button 
                className="w-8 h-8 flex items-center justify-center border-2 border-transparent hover:border-black/20 text-[10px] font-black"
                onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
                title="Reset View: Snap back to 100% zoom and center position"
              >
                1:1
              </button>
            </div>

            <div className="border-t border-black/10 pt-2 flex flex-col gap-1">
              <label className="text-[8px] font-black uppercase text-black/40 tracking-widest">Line Style</label>
              <div className="flex gap-1">
                <button 
                  onClick={() => setDash(undefined)}
                  className={`flex-1 h-6 border-2 flex items-center justify-center ${dash === undefined ? 'border-black bg-black/5' : 'border-transparent bg-gray-50'}`}
                  title="Solid Line"
                >
                  <div className="w-4 h-0.5 bg-black" />
                </button>
                <button 
                  onClick={() => setDash([10, 10])}
                  className={`flex-1 h-6 border-2 flex items-center justify-center ${dash?.[0] === 10 ? 'border-black bg-black/5' : 'border-transparent bg-gray-50'}`}
                  title="Dashed Line"
                >
                  <div className="w-4 h-0.5 border-b border-dashed border-black" />
                </button>
                <button 
                  onClick={() => setDash([2, strokeWidth * 2])}
                  className={`flex-1 h-6 border-2 flex items-center justify-center ${dash?.[0] === 2 ? 'border-black bg-black/5' : 'border-transparent bg-gray-50'}`}
                  title="Dotted Line - Small dots (Perfect for tracing or subtle effects)"
                >
                  <div className="flex gap-1">
                    <div className="w-1 h-1 bg-black rounded-full" />
                    <div className="w-1 h-1 bg-black rounded-full" />
                    <div className="w-1 h-1 bg-black rounded-full" />
                  </div>
                </button>
              </div>
            </div>

            <div className="border-t border-black/10 pt-2 flex flex-col gap-1">
              <label className="text-[8px] font-black uppercase text-black/40 tracking-widest">Sensitivity</label>
              <input 
                type="range"
                min="0.05"
                max="0.4"
                step="0.05"
                value={zoomSensitivity}
                onChange={(e) => setZoomSensitivity(parseFloat(e.target.value))}
                className="w-full h-1 bg-black/10 appearance-none rounded-full accent-black cursor-pointer"
                title="Adjust how fast you zoom in and out"
              />
            </div>

            {tool === 'polygon' && (
              <div className="border-t border-black/10 pt-2 flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[8px] font-black uppercase text-black/40 tracking-widest">
                  <span>Sides</span>
                  <span className="text-[10px] font-bold font-mono bg-black text-white px-1.5 py-0.5 rounded-sm">{polygonSides} SIDES</span>
                </div>
                <input 
                  type="range"
                  min="3"
                  max="12"
                  step="1"
                  value={polygonSides}
                  onChange={(e) => setPolygonSides(parseInt(e.target.value))}
                  className="w-full h-1 bg-black/10 appearance-none rounded-full accent-black cursor-pointer"
                  title="Adjust the number of sides for the polygon"
                />
                <div className="grid grid-cols-4 gap-1 mt-1">
                  {[3, 5, 6, 8].map(sides => (
                    <button
                      key={sides}
                      onClick={() => setPolygonSides(sides)}
                      className={`py-1 text-[8px] font-black border uppercase transition-all ${polygonSides === sides ? 'border-black bg-sketch-yellow' : 'border-black/10 text-black/50 hover:border-black'}`}
                      title={`${sides === 3 ? 'Triangle' : sides === 5 ? 'Pentagon' : sides === 6 ? 'Hexagon' : 'Octagon'}`}
                    >
                      {sides === 3 ? 'Tri' : sides === 5 ? 'Pent' : sides === 6 ? 'Hex' : 'Oct'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tool === 'text' && (
              <div className="border-t border-black/10 pt-2 flex flex-col gap-2">
                <select 
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="text-[10px] font-black border border-black/10 p-1 uppercase focus:outline-none"
                  title="Choose font style for text"
                >
                  <option value="Space Grotesk">Sans</option>
                  <option value="JetBrains Mono">Mono</option>
                  <option value="Serif">Serif</option>
                </select>
                <div className="flex gap-1">
                  {[12, 20, 32].map(s => (
                    <button
                      key={s}
                      onClick={() => setFontSize(s)}
                      className={`flex-1 text-[10px] font-black border-2 ${fontSize === s ? 'border-black bg-sketch-yellow' : 'border-transparent bg-gray-50'}`}
                      title={`Font size: ${s}px`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-black/10 pt-2 grid grid-cols-4 gap-1">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 border-2 transition-transform hover:scale-110 ${color === c ? 'border-black scale-110 z-10' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  title={`Color: ${c === '#FFFFFF' ? 'White / Eraser' : c === '#000000' ? 'Black' : c}`}
                />
              ))}
            </div>

            <div className="border-t border-black/10 pt-2 flex flex-col gap-1">
              <label className="text-[8px] font-black uppercase text-black/40 tracking-widest">Stroke Size</label>
              <div className="flex flex-col gap-1">
                {[3, 8, 15].map((size) => (
                  <button
                    key={size}
                    onClick={() => setStrokeWidth(size)}
                    className={`w-full h-5 relative flex items-center justify-center border-2 ${strokeWidth === size ? 'border-black bg-black/5' : 'border-transparent'}`}
                    title={`Select Stroke Size: ${size === 3 ? 'Fine' : size === 8 ? 'Medium' : 'Thick'} (${size}px)`}
                  >
                    <div className="bg-black rounded-full" style={{ width: size, height: size }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View controls for spectators */}
      {!isDrawer && (
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          <ToolBtn active={tool === 'pan'} onClick={() => setTool(tool === 'pan' ? 'pen' : 'pan')} icon={<Move size={18} />} title="Toggle Pan Mode - Click and drag to move around" />
          <button 
            className="w-10 h-10 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center font-black text-xs"
            onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
            title="Reset View - Return to default zoom and focus"
          >
            1:1
          </button>
        </div>
      )}
    </div>
  );
}

function ToolBtn({ active, onClick, icon, title }: { active: boolean, onClick: () => void, icon: React.ReactNode, title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 flex items-center justify-center border-2 transition-all ${active ? 'bg-sketch-yellow border-black' : 'bg-white border-transparent hover:border-black/20'}`}
    >
      {icon}
    </button>
  );
}
