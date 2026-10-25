import React, { useState, useRef, useEffect } from 'react';
import { 
  Home, 
  MessageSquare, 
  Calendar, 
  Target, 
  BookOpen, 
  Settings, 
  Sparkles, 
  CheckCircle2, 
  ChevronRight,
  Send,
  Loader2,
  Plus,
  Trash2,
  Bookmark,
  Clock,
  Search,
  Pencil,
  X
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      return storedValue ? JSON.parse(storedValue) : initialValue;
    } catch (error) {
      console.error(`Could not load ${key} from local storage:`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Could not save ${key} to local storage:`, error);
    }
  }, [key, value]);

  return [value, setValue];
}

const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
  httpOptions: {
    timeout: 30000,
    retryOptions: { attempts: 1 },
  },
});

export default function App() {
  const [currentTab, setCurrentTab] = useState('home');
  
  // Chat state
  const [messages, setMessages] = useLocalStorageState('my-pa-messages', [
    { sender: 'mercy', text: "Good morning! I'm Mercy, your personal PA. How can I help you organize your day or manage your goals today?" }
  ]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatMessagesRef = useRef(null);

  // Schedule / Time Management State
  const [scheduleItems, setScheduleItems] = useLocalStorageState('my-pa-schedule', [
    { id: 1, title: "Meeting with Tawheed", time: "2:00 PM", type: "Meeting", completed: false },
    { id: 2, title: "Gym Session", time: "5:00 PM", type: "Fitness", completed: false }
  ]);
  const [newScheduleTitle, setNewScheduleTitle] = useState('');
  const [newScheduleTime, setNewScheduleTime] = useState('');
  const [newScheduleType, setNewScheduleType] = useState('Task');

  // Goals State
  const [goals, setGoals] = useLocalStorageState('my-pa-goals', [
    { id: 1, title: "Finish Writing Book Manuscript", progress: 30, category: "Writing", deadline: "End of Month" },
    { id: 2, title: "Learn Advanced React & AI Apps", progress: 60, category: "Skills", deadline: "Next Month" }
  ]);
  const [newGoalTitle, setNewGoalTitle] = useState('');

  // Memory / Notes State
  const [memories, setMemories] = useLocalStorageState('my-pa-memories', [
    { id: 1, title: "Morning Routine", content: "Work on important projects between 8 AM and 11 AM when focus is highest.", category: "Preference" },
    { id: 2, title: "App Idea Note", content: "Keep My PA clean, distraction-free, and beautiful with light-blue gradients.", category: "Idea" }
  ]);
  const [newMemoryTitle, setNewMemoryTitle] = useState('');
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [memorySearch, setMemorySearch] = useState('');
  const [editingMemoryId, setEditingMemoryId] = useState(null);

  // State for Mercy's Movable Floating Button Position
  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const phoneFrameRef = useRef(null);
  const mercyButtonRef = useRef(null);
  const dragMovedRef = useRef(false);

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleMouseDown = () => {
    const frame = phoneFrameRef.current;
    const button = mercyButtonRef.current;
    dragMovedRef.current = false;
    if (frame && button) {
      const frameBounds = frame.getBoundingClientRect();
      const buttonBounds = button.getBoundingClientRect();
      setPosition({ x: buttonBounds.left - frameBounds.left, y: buttonBounds.top - frameBounds.top });
    }
    setIsDragging(true);
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const frame = phoneFrameRef.current;
    const button = mercyButtonRef.current;
    if (!frame || !button) return;

    const bounds = frame.getBoundingClientRect();
    const newX = Math.max(12, Math.min(frame.clientWidth - button.offsetWidth - 12, e.clientX - bounds.left - button.offsetWidth / 2));
    const newY = Math.max(12, Math.min(frame.clientHeight - button.offsetHeight - 12, e.clientY - bounds.top - button.offsetHeight / 2));
    dragMovedRef.current = true;
    setPosition({ x: newX, y: newY });
  };
  const handleMouseUp = () => setIsDragging(false);

  // Send message to Gemini AI (Mercy) with full context
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || isThinking) return;

    const userMessage = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    setIsThinking(true);

    try {
      const history = messages.slice(-12).map(message => ({
        role: message.sender === 'user' ? 'user' : 'model',
        parts: [{ text: message.text }]
      }));
      const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are Mercy, an intelligent, warm personal assistant for My PA. Use the user's saved schedule, goals, and notes when relevant. Do not claim to create or change anything unless the app confirms that action. Keep responses concise and practical.\n\nSchedule: ${JSON.stringify(scheduleItems)}\nGoals: ${JSON.stringify(goals)}\nSaved notes: ${JSON.stringify(memories)}`
              }
            ]
          },
          ...history,
          { role: 'user', parts: [{ text: userMessage }] }
        ]
      });

      const mercyReply = response.text || "I'm here for you, let's keep moving forward!";
      setMessages(prev => [...prev, { sender: 'mercy', text: mercyReply }]);
    } catch (error) {
      console.error('Error connecting to Mercy AI:', error);
      const errorStatus = error instanceof Error && 'status' in error ? error.status : undefined;
      const errorMessage = errorStatus === 503 || errorStatus === 504
        ? "Mercy's AI is taking longer than expected. Please try again shortly."
        : "Mercy couldn't connect to the AI service. Please check your internet connection and try again.";
      setMessages(prev => [...prev, { sender: 'mercy', text: errorMessage }]);
    } finally {
      setIsThinking(false);
    }
  };

  // Add schedule item
  const handleAddSchedule = (e) => {
    e.preventDefault();
    if (!newScheduleTitle.trim() || !newScheduleTime.trim()) return;
    setScheduleItems(prev => [
      ...prev, 
      { id: Date.now(), title: newScheduleTitle, time: newScheduleTime, type: newScheduleType, completed: false }
    ]);
    setNewScheduleTitle('');
    setNewScheduleTime('');
  };

  // Toggle schedule completion
  const toggleScheduleComplete = (id) => {
    setScheduleItems(prev => prev.map(item => item.id === id ? { ...item, completed: !item.completed } : item));
  };

  // Delete schedule item
  const deleteScheduleItem = (id) => {
    setScheduleItems(prev => prev.filter(item => item.id !== id));
  };

  // Add a new goal
  const handleAddGoal = (e) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;
    setGoals(prev => [...prev, { id: Date.now(), title: newGoalTitle, progress: 10, category: "General", deadline: "Soon" }]);
    setNewGoalTitle('');
  };

  // Add a new memory note
  const handleAddMemory = (e) => {
    e.preventDefault();
    if (!newMemoryTitle.trim() || !newMemoryContent.trim()) return;
    if (editingMemoryId !== null) {
      setMemories(prev => prev.map(memory => memory.id === editingMemoryId
        ? { ...memory, title: newMemoryTitle.trim(), content: newMemoryContent.trim() }
        : memory));
    } else {
      setMemories(prev => [...prev, { id: Date.now(), title: newMemoryTitle.trim(), content: newMemoryContent.trim(), category: "Note" }]);
    }
    setNewMemoryTitle('');
    setNewMemoryContent('');
    setShowAddMemory(false);
    setEditingMemoryId(null);
  };

  const startEditingMemory = (memory) => {
    setEditingMemoryId(memory.id);
    setNewMemoryTitle(memory.title);
    setNewMemoryContent(memory.content);
    setShowAddMemory(true);
  };

  const cancelMemoryEdit = () => {
    setEditingMemoryId(null);
    setNewMemoryTitle('');
    setNewMemoryContent('');
    setShowAddMemory(false);
  };

  const deleteMemory = (id) => {
    setMemories(prev => prev.filter(memory => memory.id !== id));
    if (editingMemoryId === id) cancelMemoryEdit();
  };

  const filteredMemories = memories.filter(memory =>
    `${memory.title} ${memory.content} ${memory.category}`.toLowerCase().includes(memorySearch.toLowerCase())
  );

  return (
    <div 
      className="min-h-screen bg-[#f4f8fc] flex justify-center items-center p-0 md:p-6 select-none overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Phone Frame Container */}
      <div ref={phoneFrameRef} className="w-full md:max-w-[430px] h-screen md:h-[880px] bg-white md:rounded-[40px] shadow-2xl flex flex-col justify-between relative overflow-hidden border border-sky-100">
        
        {/* TOP HEADER */}
        <div className="pt-12 px-6 pb-4 bg-gradient-to-b from-sky-50 to-white flex justify-between items-center border-b border-sky-100/60 shrink-0">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 bg-sky-100 px-2.5 py-1 rounded-full">
              My PA Assistant
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Good morning ☀️</h1>
          </div>
          <div className="w-10 h-10 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center shadow-md shadow-sky-200">
            M
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          
          {/* TAB 1: HOME DASHBOARD */}
          {currentTab === 'home' && (
            <>
              {/* Daily 10 AM Motivation Card */}
              <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-3xl p-5 text-white shadow-lg shadow-sky-200 relative overflow-hidden">
                <div className="absolute right-[-10px] bottom-[-10px] text-sky-400/30">
                  <Sparkles size={100} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={18} className="text-sky-200 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-sky-100">Mercy's Daily Note</span>
                </div>
                <p className="text-sm font-medium leading-relaxed text-sky-50">
                  "Don't let the whole day pass without making progress on something that matters. Work quietly, stay consistent."
                </p>
              </div>

              {/* Today's Priority */}
              <div className="bg-white rounded-2xl p-4 border border-sky-100 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    Main Priority
                  </h3>
                  <span className="text-xs text-sky-600 font-semibold bg-sky-50 px-2 py-0.5 rounded">In Progress</span>
                </div>
                <div className="bg-sky-50/50 rounded-xl p-3 border border-sky-100 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Complete Book Chapter 4</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Target: Finish manuscript editing</p>
                  </div>
                  <CheckCircle2 className="text-sky-500" size={22} />
                </div>
              </div>

              {/* Today's Schedule Overview */}
              <div className="bg-white rounded-2xl p-4 border border-sky-100 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-slate-800">Today's Schedule</h3>
                  <button onClick={() => setCurrentTab('schedule')} className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5">
                    View all <ChevronRight size={14} />
                  </button>
                </div>
                
                <div className="space-y-2.5">
                  {scheduleItems.slice(0, 2).map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-sky-50/50 transition-colors border border-slate-100">
                      <div className="text-xs font-bold text-sky-600 bg-sky-100 px-2.5 py-1 rounded-lg">{item.time}</div>
                      <div className="flex-1">
                        <h5 className={`text-xs font-bold ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.title}</h5>
                        <p className="text-[11px] text-slate-500">{item.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: MERCY AI CHAT */}
          {currentTab === 'ai' && (
            <div className="flex flex-col h-full space-y-3">
              <div className="bg-sky-50 p-2.5 rounded-2xl border border-sky-100 text-center shrink-0">
                <p className="text-xs font-medium text-sky-800">✨ Powered by Gemini — Talk to Mercy</p>
              </div>
              
              <div ref={chatMessagesRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
                {messages.map((msg, index) => (
                  <div key={index} className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.sender === 'mercy' && (
                      <div className="w-7 h-7 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center text-[11px] shrink-0 mt-1">M</div>
                    )}
                    <div className={`p-3 rounded-2xl text-xs max-w-[80%] leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-sky-500 text-white rounded-tr-none shadow-sm shadow-sky-200' 
                        : 'bg-sky-100/70 text-slate-800 rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                
                {isThinking && (
                  <div className="flex gap-2 items-center text-sky-600 text-xs italic">
                    <div className="w-7 h-7 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center text-[11px]">M</div>
                    <div className="bg-sky-50 p-3 rounded-2xl flex items-center gap-2">
                      <Loader2 className="animate-spin" size={14} />
                      Mercy is thinking...
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-2 shrink-0">
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask Mercy to help plan your day..." 
                  className="flex-1 bg-sky-50/60 border border-sky-200 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:border-sky-500 text-slate-800"
                />
                <button type="submit" className="bg-sky-500 text-white p-3 rounded-2xl hover:bg-sky-600 transition-colors shadow-sm shadow-sky-200">
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: SCHEDULE */}
          {currentTab === 'schedule' && (
            <div className="space-y-4">
              <div className="bg-sky-50 p-3 rounded-2xl border border-sky-100">
                <h3 className="text-sm font-bold text-sky-900">Your Time & Schedule</h3>
                <p className="text-xs text-sky-700 mt-0.5">Manage your daily appointments and commitments.</p>
              </div>

              {/* Add Schedule Form */}
              <form onSubmit={handleAddSchedule} className="bg-white p-3 rounded-2xl border border-sky-100 shadow-sm space-y-2">
                <h4 className="text-xs font-bold text-slate-800">Add New Schedule Item</h4>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={newScheduleTitle}
                    onChange={(e) => setNewScheduleTitle(e.target.value)}
                    placeholder="Event title (e.g. Call Tawheed)..."
                    className="flex-1 bg-sky-50/50 border border-sky-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-sky-500"
                  />
                  <input 
                    type="text"
                    value={newScheduleTime}
                    onChange={(e) => setNewScheduleTime(e.target.value)}
                    placeholder="Time (e.g. 4 PM)..."
                    className="w-24 bg-sky-50/50 border border-sky-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex justify-between items-center pt-1">
                  <select 
                    value={newScheduleType}
                    onChange={(e) => setNewScheduleType(e.target.value)}
                    className="bg-sky-50 border border-sky-200 rounded-xl px-2 py-1 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="Meeting">Meeting</option>
                    <option value="Fitness">Fitness</option>
                    <option value="Task">Task</option>
                  </select>
                  <button type="submit" className="bg-sky-500 text-white px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-sky-600 shadow-sm">
                    Add Event
                  </button>
                </div>
              </form>

              {/* Schedule List */}
              <div className="space-y-2.5">
                {scheduleItems.map(item => (
                  <div key={item.id} className="bg-white p-3.5 rounded-2xl border border-sky-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => toggleScheduleComplete(item.id)}
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${item.completed ? 'bg-sky-500 border-sky-500 text-white' : 'border-sky-300 bg-white'}`}
                      >
                        {item.completed && <CheckCircle2 size={14} />}
                      </button>
                      <div>
                        <span className="text-[9px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded uppercase">{item.type}</span>
                        <h4 className={`text-xs font-bold mt-0.5 ${item.completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>{item.title}</h4>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5"><Clock size={10} /> {item.time}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteScheduleItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: GOALS & PROJECTS */}
          {currentTab === 'goals' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Active Goals</h3>
                  <p className="text-xs text-slate-500">Track milestones and progress</p>
                </div>
              </div>

              <form onSubmit={handleAddGoal} className="flex gap-2">
                <input 
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="Add a new goal or project..."
                  className="flex-1 bg-sky-50/50 border border-sky-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-sky-500"
                />
                <button type="submit" className="bg-sky-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-sky-600 transition-colors shadow-sm">
                  Add
                </button>
              </form>

              <div className="space-y-3">
                {goals.map(goal => (
                  <div key={goal.id} className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">{goal.category}</span>
                        <h4 className="text-xs font-bold text-slate-900 mt-1">{goal.title}</h4>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500">{goal.deadline}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Progress</span>
                        <span>{goal.progress}%</span>
                      </div>
                      <div className="w-full bg-sky-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-sky-500 h-full rounded-full" style={{ width: `${goal.progress}%` }}></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: MEMORY (SECOND BRAIN) */}
          {currentTab === 'memory' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Second Brain Memory</h3>
                  <p className="text-xs text-slate-500">Saved on this device and available to Mercy</p>
                </div>
                <button 
                  onClick={() => showAddMemory ? cancelMemoryEdit() : setShowAddMemory(true)} 
                  className="bg-sky-500 text-white p-2 rounded-xl text-xs font-bold hover:bg-sky-600 transition-colors flex items-center gap-1 shadow-sm"
                >
                  {showAddMemory ? <X size={14} /> : <Plus size={14} />}
                  {showAddMemory ? 'Cancel' : 'New Note'}
                </button>
              </div>

              <label className="flex items-center gap-2 bg-white border border-sky-200 rounded-xl px-3 py-2">
                <Search size={15} className="text-sky-500" />
                <input
                  type="search"
                  value={memorySearch}
                  onChange={(e) => setMemorySearch(e.target.value)}
                  placeholder="Search your notes..."
                  className="w-full text-xs outline-none"
                />
              </label>

              {showAddMemory && (
                <form onSubmit={handleAddMemory} className="bg-sky-50/70 p-3 rounded-2xl border border-sky-200 space-y-2">
                  <h4 className="text-xs font-bold text-sky-900">{editingMemoryId === null ? 'Save to Memory' : 'Edit Note'}</h4>
                  <input 
                    type="text"
                    value={newMemoryTitle}
                    onChange={(e) => setNewMemoryTitle(e.target.value)}
                    placeholder="Note title (e.g. Book Outline)..."
                    className="w-full bg-white border border-sky-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-sky-500"
                  />
                  <textarea 
                    value={newMemoryContent}
                    onChange={(e) => setNewMemoryContent(e.target.value)}
                    placeholder="What should Mercy remember?"
                    rows="2"
                    className="w-full bg-white border border-sky-200 rounded-xl p-3 text-xs focus:outline-none focus:border-sky-500 resize-none"
                  ></textarea>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={cancelMemoryEdit} className="px-3 py-1.5 text-xs text-slate-500 font-medium">Cancel</button>
                    <button type="submit" className="bg-sky-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-sky-600 shadow-sm">
                      {editingMemoryId === null ? 'Save Note' : 'Update Note'}
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {filteredMemories.map(mem => (
                  <div key={mem.id} className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">{mem.category}</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startEditingMemory(mem)} aria-label={`Edit ${mem.title}`} className="text-slate-400 hover:text-sky-600">
                          <Pencil size={14} />
                        </button>
                        <button type="button" onClick={() => deleteMemory(mem.id)} aria-label={`Delete ${mem.title}`} className="text-slate-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                        <Bookmark size={14} className="text-sky-400" />
                      </div>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">{mem.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">{mem.content}</p>
                  </div>
                ))}
                {filteredMemories.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-500">
                    {memories.length === 0 ? 'No notes saved yet.' : 'No notes match your search.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: SETTINGS */}
          {currentTab === 'settings' && (
            <div className="space-y-4">
              <div className="bg-sky-50 p-3 rounded-2xl border border-sky-100">
                <h3 className="text-sm font-bold text-sky-900">App Preferences</h3>
                <p className="text-xs text-sky-700 mt-0.5">Manage your profile and Mercy's behavior.</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-xs font-medium text-slate-800">Assistant Name</span>
                  <span className="text-xs font-bold text-sky-600">Mercy</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-xs font-medium text-slate-800">Theme</span>
                  <span className="text-xs font-bold text-sky-600">Light Blue (iOS Style)</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs font-medium text-slate-800">AI Model</span>
                  <span className="text-xs font-bold text-sky-600">Gemini Flash Lite</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* BOTTOM NAVIGATION BAR */}
        <div className="bg-white border-t border-sky-100 px-4 py-2 flex justify-around items-center shrink-0">
          <button onClick={() => setCurrentTab('home')} className={`flex flex-col items-center gap-1 p-2 transition-colors ${currentTab === 'home' ? 'text-sky-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Home size={20} />
            <span className="text-[10px] font-medium">Home</span>
          </button>
          
          <button onClick={() => setCurrentTab('ai')} className={`flex flex-col items-center gap-1 p-2 transition-colors ${currentTab === 'ai' ? 'text-sky-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <MessageSquare size={20} />
            <span className="text-[10px] font-medium">Mercy AI</span>
          </button>

          <button onClick={() => setCurrentTab('schedule')} className={`flex flex-col items-center gap-1 p-2 transition-colors ${currentTab === 'schedule' ? 'text-sky-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Calendar size={20} />
            <span className="text-[10px] font-medium">Schedule</span>
          </button>

          <button onClick={() => setCurrentTab('goals')} className={`flex flex-col items-center gap-1 p-2 transition-colors ${currentTab === 'goals' ? 'text-sky-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Target size={20} />
            <span className="text-[10px] font-medium">Goals</span>
          </button>

          <button onClick={() => setCurrentTab('memory')} className={`flex flex-col items-center gap-1 p-2 transition-colors ${currentTab === 'memory' ? 'text-sky-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <BookOpen size={20} />
            <span className="text-[10px] font-medium">Memory</span>
          </button>

          <button onClick={() => setCurrentTab('settings')} className={`flex flex-col items-center gap-1 p-2 transition-colors ${currentTab === 'settings' ? 'text-sky-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Settings size={20} />
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </div>

        {/* MOVABLE FLOATING MERCY BUTTON */}
        <div 
          ref={mercyButtonRef}
          style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
          onMouseDown={handleMouseDown}
          onClick={() => {
            if (dragMovedRef.current) {
              dragMovedRef.current = false;
              return;
            }
            setCurrentTab('ai');
          }}
          className={`absolute z-50 cursor-grab active:cursor-grabbing group flex items-center gap-2 bg-gradient-to-r from-sky-500 to-sky-600 text-white p-3 rounded-full shadow-xl shadow-sky-300 hover:scale-105 transition-transform ${position ? '' : 'right-5 bottom-24'}`}
          title="Drag me anywhere or click to talk to Mercy!"
        >
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white/20 text-white font-bold">
            <Sparkles size={18} />
          </div>
          <span className="text-xs font-semibold pr-2 hidden group-hover:inline-block transition-all">Talk to Mercy</span>
        </div>

      </div>
    </div>
  );
}