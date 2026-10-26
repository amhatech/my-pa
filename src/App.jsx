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
  X,
  Mic,
  Volume2,
  Bell
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

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

export default function App() {
  const [currentTab, setCurrentTab] = useState('home');
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('sign-in');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [profileUsername, setProfileUsername] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileNeedsUsername, setProfileNeedsUsername] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceNeedsSetup, setWorkspaceNeedsSetup] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [notificationPermission, setNotificationPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  
  // Chat state
  const [messages, setMessages] = useLocalStorageState('my-pa-messages', [
    { sender: 'mercy', text: "Good morning! I'm Mercy, your personal PA. How can I help you organize your day or manage your goals today?" }
  ]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatMessagesRef = useRef(null);
  const recognitionRef = useRef(null);

  // Schedule / Time Management State
  const [scheduleItems, setScheduleItems] = useLocalStorageState('my-pa-schedule', [
    { id: 1, title: "Meeting with Tawheed", time: "2:00 PM", type: "Meeting", completed: false },
    { id: 2, title: "Gym Session", time: "5:00 PM", type: "Fitness", completed: false }
  ]);
  const [newScheduleTitle, setNewScheduleTitle] = useState('');
  const [newScheduleTime, setNewScheduleTime] = useState('');
  const [newScheduleType, setNewScheduleType] = useState('Task');
  const [newReminderMinutes, setNewReminderMinutes] = useState(10);
  const [scheduleError, setScheduleError] = useState('');
  const [minimumScheduleTime] = useState(() => (
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  ));

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
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setAuthUser(data.session?.user ?? null);
      setAuthLoading(false);
    }).catch(error => {
      if (!active) return;
      setAuthError(error.message);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setProfileUsername('');
      setProfileNeedsUsername(false);
      setProfileError('');
      setWorkspaceReady(false);
      setWorkspaceNeedsSetup(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser || !supabase) {
      setProfileLoading(false);
      return undefined;
    }

    let active = true;
    setProfileLoading(true);
    setProfileError('');
    supabase.from('profiles').select('username').eq('user_id', authUser.id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setProfileError(`Could not load your profile: ${error.message}`);
          return;
        }
        if (data?.username) {
          setProfileUsername(data.username);
          setProfileNeedsUsername(false);
        } else {
          setProfileNeedsUsername(true);
        }
      })
      .catch(error => {
        if (active) setProfileError(`Could not load your profile: ${error.message}`);
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authUser]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (notificationPermission !== 'granted') return undefined;
    let lastCheckedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      scheduleItems.forEach(item => {
        if (!item.startsAt || item.completed) return;
        const notifyAt = new Date(item.startsAt).getTime() - (item.reminderMinutes ?? 10) * 60_000;
        const storageKey = `my-pa-notified-${authUser?.id ?? 'local'}-${item.id}-${item.startsAt}`;
        if (notifyAt > lastCheckedAt && notifyAt <= now && !window.localStorage.getItem(storageKey)) {
          window.localStorage.setItem(storageKey, 'true');
          new Notification(`Upcoming: ${item.title}`, {
            body: `Your event starts at ${item.time}.`,
            icon: '/pwa-icon.svg',
            tag: storageKey,
          });
        }
      });
      lastCheckedAt = now;
    }, 15_000);
    return () => window.clearInterval(intervalId);
  }, [scheduleItems, notificationPermission, authUser]);

  useEffect(() => {
    if (!authUser || !supabase || profileLoading || profileNeedsUsername || profileError || !profileUsername) return undefined;

    let active = true;
    setWorkspaceLoading(true);
    setWorkspaceReady(false);
    supabase.from('user_workspace').select('data').eq('user_id', authUser.id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          if (!navigator.onLine) {
            setSyncError('Offline — showing this browser’s saved copy. Changes will sync when you reconnect.');
            setWorkspaceReady(true);
            return;
          }
          setSyncError(`Could not load cloud data: ${error.message}`);
          setWorkspaceNeedsSetup(true);
          return;
        }
        if (!data) {
          setWorkspaceNeedsSetup(true);
          return;
        }

        const workspace = data.data;
        if (Array.isArray(workspace.messages)) setMessages(workspace.messages);
        if (Array.isArray(workspace.scheduleItems)) setScheduleItems(workspace.scheduleItems);
        if (Array.isArray(workspace.goals)) setGoals(workspace.goals);
        if (Array.isArray(workspace.memories)) setMemories(workspace.memories);
        setWorkspaceReady(true);
        setSyncError('');
      })
      .catch(error => {
        if (active) setSyncError(`Could not load cloud data: ${error.message}`);
      })
      .finally(() => {
        if (active) setWorkspaceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authUser, profileLoading, profileNeedsUsername, profileError, profileUsername, setMessages, setScheduleItems, setGoals, setMemories]);

  useEffect(() => {
    if (!authUser || !workspaceReady || workspaceNeedsSetup || !supabase || !isOnline) return undefined;

    const timeoutId = window.setTimeout(async () => {
      const { error } = await supabase.from('user_workspace').upsert({
        user_id: authUser.id,
        data: { messages, scheduleItems, goals, memories },
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.error('Could not save cloud workspace:', error);
        setSyncError(`Cloud save failed: ${error.message}`);
      } else {
        setSyncError('');
      }
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [authUser, workspaceReady, isOnline, messages, scheduleItems, goals, memories]);

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

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

  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    setNotificationPermission(await Notification.requestPermission());
  };

  const startVoiceInput = () => {
    const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionApi) {
      setVoiceError('Voice typing is not supported here. You can still type your message.');
      return;
    }

    setVoiceError('');
    const recognition = new SpeechRecognitionApi();
    recognition.lang = navigator.language;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setInputText(previous => `${previous}${previous ? ' ' : ''}${transcript}`);
    };
    recognition.onerror = () => {
      setVoiceError('Microphone access failed. Check browser permission, or type your message instead.');
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const speakMessage = (text) => {
    if (!('speechSynthesis' in window)) {
      setVoiceError('Spoken replies are not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');
    if (!supabase) return;

    const result = authMode === 'sign-up'
      ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
      : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });

    if (result.error) {
      setAuthError(result.error.message);
      return;
    }
    if (authMode === 'sign-up' && !result.data.session) {
      setAuthNotice('Check your email to confirm your account, then sign in.');
    }
    setAuthPassword('');
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthNotice('');
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError(`Could not start Google sign-in: ${error.message}`);
  };

  const handleSaveUsername = async (event) => {
    event.preventDefault();
    const username = usernameInput.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      setProfileError('Choose 3–20 characters using lowercase letters, numbers, or underscores.');
      return;
    }
    if (!supabase || !authUser) return;

    setProfileError('');
    const { error } = await supabase.from('profiles').upsert(
      { user_id: authUser.id, username },
      { onConflict: 'user_id' },
    );
    if (error) {
      setProfileError(error.code === '23505'
        ? 'That username is already taken. Please choose another.'
        : `Could not save your username: ${error.message}`);
      return;
    }

    setProfileUsername(username);
    setProfileNeedsUsername(false);
  };

  const importLocalWorkspace = async () => {
    if (!supabase || !authUser) return;
    setSyncError('');
    const localWorkspace = {
      messages: JSON.parse(window.localStorage.getItem('my-pa-messages') || '[]'),
      scheduleItems: JSON.parse(window.localStorage.getItem('my-pa-schedule') || '[]'),
      goals: JSON.parse(window.localStorage.getItem('my-pa-goals') || '[]'),
      memories: JSON.parse(window.localStorage.getItem('my-pa-memories') || '[]'),
    };
    const { error } = await supabase.from('user_workspace').upsert({
      user_id: authUser.id,
      data: localWorkspace,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setSyncError(`Could not import this browser's data: ${error.message}`);
      return;
    }

    setMessages(localWorkspace.messages);
    setScheduleItems(localWorkspace.scheduleItems);
    setGoals(localWorkspace.goals);
    setMemories(localWorkspace.memories);
    setWorkspaceNeedsSetup(false);
    setWorkspaceReady(true);
  };

  const startWithEmptyWorkspace = async () => {
    if (!supabase || !authUser) return;
    const emptyWorkspace = { messages: [], scheduleItems: [], goals: [], memories: [] };
    const { error } = await supabase.from('user_workspace').upsert({
      user_id: authUser.id,
      data: emptyWorkspace,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setSyncError(`Could not create cloud workspace: ${error.message}`);
      return;
    }
    setMessages([]);
    setScheduleItems([]);
    setGoals([]);
    setMemories([]);
    setWorkspaceNeedsSetup(false);
    setWorkspaceReady(true);
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(`Could not sign out: ${error.message}`);
      return;
    }
    ['my-pa-messages', 'my-pa-schedule', 'my-pa-goals', 'my-pa-memories'].forEach(key => {
      window.localStorage.removeItem(key);
    });
    setMessages([]);
    setScheduleItems([]);
    setGoals([]);
    setMemories([]);
  };

  const exportWorkspace = () => {
    const data = JSON.stringify({ messages, scheduleItems, goals, memories }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `my-pa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearCloudWorkspace = async () => {
    if (!supabase || !authUser || !window.confirm('Permanently delete your saved My PA records from the cloud? Download a backup first if you need one.')) return;
    const { error } = await supabase.from('user_workspace').delete().eq('user_id', authUser.id);
    if (error) {
      setSyncError(`Could not delete cloud data: ${error.message}`);
      return;
    }
    setMessages([]);
    setScheduleItems([]);
    setGoals([]);
    setMemories([]);
    setWorkspaceNeedsSetup(true);
    setWorkspaceReady(false);
  };

  const deleteAccount = async () => {
    if (!supabase || !window.confirm('Permanently delete your account and all associated My PA data? This cannot be undone.')) return;
    setSyncError('');
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      setSyncError(`Could not delete account: ${error.message}`);
      return;
    }
    await handleSignOut();
  };

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
        text: message.text
      }));
      const { data, error } = await supabase.functions.invoke('mercy-chat', {
        body: {
          message: userMessage,
          history,
          context: { scheduleItems, goals, memories },
        },
      });
      if (error) throw error;

      const mercyReply = data?.reply || "I couldn't get a reply just now. Please try again.";
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
    setScheduleError('');
    if (!newScheduleTitle.trim() || !newScheduleTime.trim()) {
      setScheduleError('Enter an event name and date/time.');
      return;
    }
    const startsAt = new Date(newScheduleTime);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      setScheduleError('Choose a valid date and time in the future.');
      return;
    }
    setScheduleItems(prev => [
      ...prev, 
      {
        id: Date.now(),
        title: newScheduleTitle.trim(),
        time: startsAt.toLocaleString(),
        startsAt: startsAt.toISOString(),
        reminderMinutes: Number(newReminderMinutes),
        type: newScheduleType,
        completed: false,
      }
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

  if (authLoading || profileLoading || workspaceLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f4f8fc] p-6">
        <p className="text-sm text-sky-800">Connecting securely to your My PA account…</p>
      </main>
    );
  }

  if (!isSupabaseConfigured || !authUser || workspaceNeedsSetup || profileNeedsUsername || profileError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f4f8fc] p-6">
        <section className="w-full max-w-md rounded-3xl border border-sky-100 bg-white p-6 shadow-xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white">
              <Sparkles size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">My PA</h1>
              <p className="text-sm text-slate-500">Your personal assistant and second brain</p>
            </div>
          </div>

          {!isSupabaseConfigured ? (
            <div className="space-y-3 text-sm text-slate-700">
              <h2 className="font-semibold">Finish connecting your Supabase project</h2>
              <p>
                Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to a root
                <code> .env.local</code> file, then restart the development server. Never put a
                service-role key or Gemini key in this file.
              </p>
            </div>
          ) : profileError ? (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-900">Could not load your profile</h2>
              <p role="alert" className="text-sm text-red-700">{profileError}</p>
              <p className="text-xs text-slate-600">The Supabase profile table must be created by running the project migration.</p>
              <button onClick={handleSignOut} className="w-full py-2 text-sm text-slate-500">Sign out</button>
            </div>
          ) : profileNeedsUsername ? (
            <form onSubmit={handleSaveUsername} className="space-y-3">
              <h2 className="font-semibold text-slate-900">Choose your username</h2>
              <p className="text-sm text-slate-600">This unique handle identifies your My PA account. Use 3–20 lowercase letters, numbers, or underscores.</p>
              <input
                type="text"
                autoComplete="username"
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]{3,20}"
                required
                value={usernameInput}
                onChange={event => setUsernameInput(event.target.value)}
                placeholder="e.g. alex_2026"
                className="w-full rounded-xl border border-sky-200 px-4 py-3 text-sm"
              />
              {profileError && <p role="alert" className="text-sm text-red-600">{profileError}</p>}
              <button type="submit" className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white">
                Save username
              </button>
              <button type="button" onClick={handleSignOut} className="w-full py-2 text-sm text-slate-500">Sign out</button>
            </form>
          ) : authUser && workspaceNeedsSetup ? (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-900">Choose your first cloud workspace</h2>
              <p className="text-sm text-slate-600">
                Import the records from this browser into your private account, or start with an empty workspace.
              </p>
              <button onClick={importLocalWorkspace} className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white">
                Import this browser’s data
              </button>
              <button onClick={startWithEmptyWorkspace} className="w-full rounded-xl border border-sky-200 px-4 py-3 text-sm font-semibold text-sky-800">
                Start with an empty workspace
              </button>
              <button onClick={handleSignOut} className="w-full py-2 text-sm text-slate-500">Sign out</button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full rounded-xl border border-sky-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-sky-50"
                >
                  Continue with Google
                </button>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span>or use email</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
              </div>
              <form onSubmit={handleAuthSubmit} className="space-y-3">
              <h2 className="font-semibold text-slate-900">
                {authMode === 'sign-in' ? 'Sign in to your account' : 'Create your account'}
              </h2>
              <input
                type="email"
                autoComplete="email"
                required
                value={authEmail}
                onChange={event => setAuthEmail(event.target.value)}
                placeholder="Email address"
                className="w-full rounded-xl border border-sky-200 px-4 py-3 text-sm"
              />
              <input
                type="password"
                autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                minLength={8}
                required
                value={authPassword}
                onChange={event => setAuthPassword(event.target.value)}
                placeholder="Password (at least 8 characters)"
                className="w-full rounded-xl border border-sky-200 px-4 py-3 text-sm"
              />
              {authError && <p role="alert" className="text-sm text-red-600">{authError}</p>}
              {authNotice && <p role="status" className="text-sm text-emerald-700">{authNotice}</p>}
              <button type="submit" className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white">
                {authMode === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in');
                  setAuthError('');
                  setAuthNotice('');
                }}
                className="w-full py-2 text-sm text-sky-700"
              >
                {authMode === 'sign-in' ? 'New here? Create an account' : 'Already registered? Sign in'}
              </button>
              </form>
            </>
          )}
          {syncError && <p role="alert" className="mt-4 text-sm text-red-600">{syncError}</p>}
          {!isOnline && <p className="mt-3 text-sm text-amber-700">You’re offline. Sign-in and cloud sync need an internet connection.</p>}
        </section>
      </main>
    );
  }

  if (!workspaceReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f4f8fc] p-6">
        <p role="alert" className="text-sm text-red-700">{syncError || 'Could not load your cloud workspace.'}</p>
      </main>
    );
  }

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
            <p className={`mt-1 text-[10px] ${isOnline && !syncError ? 'text-emerald-700' : 'text-amber-700'}`}>
              {!isOnline ? 'Offline — changes will sync when you reconnect' : syncError || 'Private cloud workspace'}
            </p>
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
                      {msg.sender === 'mercy' && (
                        <button type="button" onClick={() => speakMessage(msg.text)} aria-label="Speak Mercy's reply" className="ml-2 inline-flex text-sky-700 align-middle">
                          <Volume2 size={13} />
                        </button>
                      )}
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

              {voiceError && <p role="status" className="text-[11px] text-amber-800">{voiceError}</p>}
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-2 shrink-0">
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask Mercy to help plan your day..." 
                  className="flex-1 bg-sky-50/60 border border-sky-200 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:border-sky-500 text-slate-800"
                />
                <button type="button" onClick={() => {
                  if (isListening) {
                    recognitionRef.current?.stop();
                    setIsListening(false);
                  } else {
                    startVoiceInput();
                  }
                }} aria-label={isListening ? 'Stop voice typing' : 'Start voice typing'} className={`p-3 rounded-2xl border ${isListening ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-sky-200 text-sky-700'}`}>
                  <Mic size={16} />
                </button>
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
                    type="datetime-local"
                    value={newScheduleTime}
                    onChange={(e) => setNewScheduleTime(e.target.value)}
                    aria-label="Event date and time"
                    min={minimumScheduleTime}
                    className="min-w-0 flex-1 bg-sky-50/50 border border-sky-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                {scheduleError && <p role="alert" className="text-[11px] text-red-700">{scheduleError}</p>}
                <div className="flex justify-between items-center pt-1">
                  <label className="flex items-center gap-1 text-[10px] text-slate-600">
                    Reminder
                    <select value={newReminderMinutes} onChange={e => setNewReminderMinutes(e.target.value)} className="bg-sky-50 border border-sky-200 rounded-lg px-1.5 py-1">
                      <option value={0}>At time</option>
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={30}>30 min</option>
                    </select>
                  </label>
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
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5"><Clock size={10} /> {item.startsAt ? new Date(item.startsAt).toLocaleString() : item.time}</p>
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
                  <span className="text-xs font-medium text-slate-800">Username</span>
                  <span className="text-xs font-bold text-sky-600">@{profileUsername}</span>
                </div>
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

              <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Reminders</h3>
                <p className="text-xs text-slate-600">Allow browser notifications to receive schedule reminders. The app must remain open; reminders are not guaranteed after closing the browser.</p>
                <button type="button" onClick={enableNotifications} disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'} className="w-full inline-flex justify-center items-center gap-2 rounded-xl border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-800 disabled:opacity-50">
                  <Bell size={14} />
                  {notificationPermission === 'granted' ? 'Notifications enabled' : notificationPermission === 'denied' ? 'Notifications blocked in browser settings' : notificationPermission === 'unsupported' ? 'Notifications unsupported' : 'Enable notifications'}
                </button>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Your data</h3>
                <p className="text-xs text-slate-600">Export a backup or delete your saved My PA records from Supabase.</p>
                <button onClick={exportWorkspace} className="w-full rounded-xl border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-800">
                  Download data backup
                </button>
                {syncError && <p role="alert" className="text-xs text-red-600">{syncError}</p>}
                <button onClick={clearCloudWorkspace} className="w-full rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                  Delete cloud records
                </button>
                <button onClick={deleteAccount} className="w-full rounded-xl border border-red-300 px-3 py-2 text-xs font-semibold text-red-800">
                  Permanently delete account
                </button>
                <button onClick={handleSignOut} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                  Sign out
                </button>
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