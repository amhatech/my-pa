import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { VAPID_PUBLIC_KEY } from './lib/push.js';
import { applyMercyActions, parseMercyActions } from './lib/mercyActions.js';
import { getTodayScheduleItems } from './lib/schedule.js';

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function makeReminderNotification(item) {
  const startsAt = item?.startsAt ? new Date(item.startsAt) : null;
  const when = startsAt && !Number.isNaN(startsAt.getTime())
    ? startsAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : item?.time || 'your event';
  const emotion = item?.type === 'Meeting' || item?.type === 'Appointment'
    ? 'You have an important moment coming up.'
    : 'Keep the momentum going.';
  return {
    title: `Mercy reminder: ${item?.title || 'Your event'}`,
    body: `${emotion} ${item?.title || 'Your event'} is scheduled for ${when}.`,
  };
}

function decodeVapidPublicKey(publicKey) {
  const padding = '='.repeat((4 - publicKey.length % 4) % 4);
  const base64 = `${publicKey}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      if (!storedValue) return initialValue;

      const parsedValue = JSON.parse(storedValue);
      if (key === 'my-pa-messages' && Array.isArray(parsedValue)) {
        return parsedValue.map(message => (
          message.sender === 'mercy' &&
          message.text === "Good morning! I'm Mercy, your personal PA. How can I help you organize your day or manage your goals today?"
            ? { ...message, text: "Hello! I'm Mercy, your personal assistant. How can I help you today?" }
            : message
        ));
      }
      return parsedValue;
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
  const [timeGreeting, setTimeGreeting] = useState(getTimeGreeting);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState('sign-in');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [profileUsername, setProfileUsername] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileNeedsUsername, setProfileNeedsUsername] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [soundEnabled, setSoundEnabled] = useLocalStorageState('my-pa-notification-sound', true);
  const [notificationSound, setNotificationSound] = useLocalStorageState('my-pa-notification-sound-style', 'alarm');
  const [notificationPermission, setNotificationPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [notificationError, setNotificationError] = useState('');
  const [pushSubscriptionEnabled, setPushSubscriptionEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  
  // Chat state
  const [messages, setMessages] = useLocalStorageState('my-pa-messages', [
    { sender: 'mercy', text: "Hello! I'm Mercy, your personal assistant. How can I help you today?" }
  ]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatMessagesRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const dailyNoticeProcessingRef = useRef(new Set());
  const sendMessageRef = useRef(null);

  const playNotificationChime = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!soundEnabled || !audioContext) return;

    const play = () => {
      if (document.visibilityState !== 'visible' || audioContext.state !== 'running') return;

      const startAt = audioContext.currentTime;
      const soundPatterns = {
        chime: [
          { frequency: 523.25, offset: 0, duration: 0.48 },
          { frequency: 659.25, offset: 0.18, duration: 0.5 },
          { frequency: 783.99, offset: 0.52, duration: 0.62 },
          { frequency: 659.25, offset: 1.12, duration: 0.72 },
        ],
        alarm: [
          { frequency: 440, offset: 0, duration: 0.42 },
          { frequency: 587.33, offset: 0.08, duration: 0.5 },
          { frequency: 440, offset: 0.72, duration: 0.42 },
          { frequency: 587.33, offset: 0.8, duration: 0.5 },
          { frequency: 523.25, offset: 1.55, duration: 0.48 },
          { frequency: 698.46, offset: 1.64, duration: 0.58 },
          { frequency: 523.25, offset: 2.45, duration: 0.48 },
          { frequency: 698.46, offset: 2.54, duration: 0.58 },
          { frequency: 440, offset: 3.35, duration: 0.5 },
          { frequency: 659.25, offset: 3.44, duration: 0.62 },
          { frequency: 440, offset: 4.3, duration: 0.5 },
          { frequency: 659.25, offset: 4.39, duration: 0.72 },
        ],
      };
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 8;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      compressor.connect(audioContext.destination);

      (soundPatterns[notificationSound] ?? soundPatterns.alarm).forEach(({ frequency, offset, duration }) => {
        const oscillator = audioContext.createOscillator();
        const volume = audioContext.createGain();
        const start = startAt + offset;

        oscillator.type = 'triangle';
        oscillator.frequency.value = frequency;
        volume.gain.setValueAtTime(0.0001, start);
        volume.gain.exponentialRampToValueAtTime(0.55, start + 0.03);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(volume);
        volume.connect(compressor);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.05);
      });
      window.setTimeout(() => compressor.disconnect(), 6_000);
    };

    if (audioContext.state === 'suspended') {
      audioContext.resume().then(play).catch(error => {
        console.error('Could not resume notification sound:', error);
      });
      return;
    }

    play();
  }, [notificationSound, soundEnabled]);

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
  const todaysScheduleItems = getTodayScheduleItems(scheduleItems);
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const mainPriorityTask = scheduleItems
    .filter(item => item.type === 'Task' && !item.completed)
    .sort((first, second) => (
      (priorityRank[first.priority] ?? 1) - (priorityRank[second.priority] ?? 1)
    ))[0];

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
  const dragStartRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => setTimeGreeting(getTimeGreeting()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

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
      setProfileNotice('');
      setWorkspaceReady(false);
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
    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setProfileError(`Could not load your profile: ${error.message}`);
        return;
      }
      if (data?.username) {
        setProfileUsername(data.username);
        setProfileNeedsUsername(false);
      } else {
        const requestedUsername = authUser.user_metadata?.username;
        if (requestedUsername) {
          const { error: saveError } = await supabase.from('profiles').insert({
            user_id: authUser.id,
            username: requestedUsername,
          });
          if (!active) return;
          if (!saveError) {
            setProfileUsername(requestedUsername);
            setProfileNeedsUsername(false);
            return;
          }
          if (saveError.code === '23505') {
            setUsernameInput(requestedUsername);
            setProfileNotice('That username is already taken. Please choose another.');
          } else {
            setProfileError(`Could not save your username: ${saveError.message}`);
            return;
          }
        }
        setProfileNeedsUsername(true);
      }
    };

    loadProfile()
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
    if (!('serviceWorker' in navigator)) return undefined;
    const handlePushMessage = event => {
      if (event.data?.type === 'MY_PA_PUSH_NOTIFICATION') playNotificationChime();
    };
    navigator.serviceWorker.addEventListener('message', handlePushMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handlePushMessage);
  }, [playNotificationChime]);

  useEffect(() => {
    if (notificationPermission !== 'granted') return undefined;
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      scheduleItems.forEach(item => {
        if (!item.startsAt || item.completed) return;
        const notifyAt = new Date(item.startsAt).getTime() - (item.reminderMinutes ?? 10) * 60_000;
        const reminderAge = now - notifyAt;
        const reminderKey = `my-pa-notified-${authUser?.id ?? 'local'}-${item.id}-${item.startsAt}`;
        if (reminderAge >= 0 && reminderAge <= 120_000 && !window.localStorage.getItem(reminderKey)) {
          window.localStorage.setItem(reminderKey, 'true');
          const reminderNotification = makeReminderNotification(item);
          new Notification(reminderNotification.title, {
            body: reminderNotification.body,
            icon: '/pwa-icon-192.png',
            tag: `schedule-${item.id}-${new Date(item.startsAt).getTime()}`,
            requireInteraction: true,
            vibrate: [180, 80, 180, 80, 220, 100, 280],
          });
          playNotificationChime();
        }

        const lapseAt = new Date(item.startsAt).getTime() + 30 * 60_000;
        const lapseAge = now - lapseAt;
        const lapseKey = `my-pa-lapsed-${authUser?.id ?? 'local'}-${item.id}-${item.startsAt}`;
        if (lapseAge >= 0 && lapseAge <= 120_000 && !window.localStorage.getItem(lapseKey)) {
          window.localStorage.setItem(lapseKey, 'true');
          new Notification(`Mercy check-in: ${item.title}`, {
            body: 'This scheduled time has passed. Mark it complete or reschedule it with a quick update.',
            icon: '/pwa-icon-192.png',
            tag: `schedule-lapsed-${item.id}-${new Date(item.startsAt).getTime()}`,
            requireInteraction: true,
            vibrate: [200, 90, 200, 90, 240],
          });
          playNotificationChime();
        }
      });
    }, 15_000);
    return () => window.clearInterval(intervalId);
  }, [scheduleItems, notificationPermission, pushSubscriptionEnabled, authUser, playNotificationChime]);

  useEffect(() => {
    if (!authUser || !workspaceReady) return undefined;

    let active = true;
    const deliverDailyNotice = async () => {
      const now = new Date();
      if (now.getHours() < 10) return;

      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const storageKey = `my-pa-daily-notice-${authUser.id}-${dateKey}`;
      if (window.localStorage.getItem(storageKey) || dailyNoticeProcessingRef.current.has(storageKey)) return;
      dailyNoticeProcessingRef.current.add(storageKey);

      const todaysEvents = scheduleItems.filter(item =>
        !item.completed && item.startsAt && new Date(item.startsAt).toDateString() === now.toDateString()
      );
      const upcomingGoals = goals.slice(0, 3).map(goal => goal.title);
      const fallbackNotice = [
        `${getTimeGreeting(now)}! Here is your Daily Notice for ${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.`,
        todaysEvents.length
          ? `Today's schedule: ${todaysEvents.map(item => `${item.title} at ${item.time}`).join(', ')}.`
          : 'You have no events saved for today yet.',
        upcomingGoals.length ? `Keep one goal moving forward: ${upcomingGoals[0]}.` : 'Choose one important thing to make progress on today.',
      ].join('\n\n');

      let notice = fallbackNotice;
      try {
        if (supabase) {
          const { data, error } = await supabase.functions.invoke('mercy-chat', {
            body: {
              message: `Write my concise, encouraging Daily Notice for the current local time ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}. Use only the supplied saved records. Mention today's scheduled events and one practical priority. If there are no events or goals, suggest adding one. Do not invent personal details.`,
              history: [],
              context: { scheduleItems, goals, memories },
            },
          });
          if (error) throw error;
          if (typeof data?.reply === 'string' && data.reply.trim()) notice = data.reply.trim();
        }
      } catch (error) {
        console.error('Could not generate Mercy’s daily notice; using the saved-record fallback.', error);
      }

      if (!active) {
        dailyNoticeProcessingRef.current.delete(storageKey);
        return;
      }

      const message = `Mercy's Daily Notice\n\n${notice}`;
      setMessages(previous => [...previous, { sender: 'mercy', text: message }]);
      window.localStorage.setItem(storageKey, 'true');
      if (notificationPermission === 'granted') {
        try {
          new Notification("Mercy's Daily Notice", {
            body: `Good momentum check-in: ${notice.replace(/\s+/g, ' ').slice(0, 180)}`,
            icon: '/pwa-icon-192.png',
            tag: `daily-notice-${dateKey}`,
            vibrate: [200, 80, 200, 80, 300],
            requireInteraction: true,
          });
        } catch (error) {
          console.error('Could not show Mercy’s daily notification:', error);
        }
      }
      playNotificationChime();
      dailyNoticeProcessingRef.current.delete(storageKey);
    };

    const intervalId = window.setInterval(deliverDailyNotice, 15_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') deliverDailyNotice();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    deliverDailyNotice();

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authUser, workspaceReady, scheduleItems, goals, memories, notificationPermission, playNotificationChime, setMessages]);

  useEffect(() => {
    if (
      !authUser ||
      notificationPermission !== 'granted' ||
      !supabase ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return undefined;
    }

    let active = true;
    navigator.serviceWorker.ready
      .then(async registration => {
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return false;
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('endpoint')
          .eq('endpoint', subscription.endpoint)
          .maybeSingle();
        if (error) throw error;
        return Boolean(data);
      })
      .then(enabled => {
        if (active) setPushSubscriptionEnabled(enabled);
      })
      .catch(error => {
        console.error('Could not check background notification status:', error);
      });

    return () => {
      active = false;
    };
  }, [authUser, notificationPermission]);

  useEffect(() => {
    if (!authUser || !supabase || profileLoading || profileNeedsUsername || profileError || !profileUsername) return undefined;

    let active = true;
    setWorkspaceLoading(true);
    setWorkspaceReady(false);
    supabase.from('user_workspace').select('data').eq('user_id', authUser.id).maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) {
          if (!navigator.onLine) {
            setSyncError('Offline — showing this browser’s saved copy. Changes will sync when you reconnect.');
            setWorkspaceReady(true);
            return;
          }
          setSyncError(`Could not load cloud data: ${error.message}`);
          return;
        }
        if (!data) {
          const emptyWorkspace = { messages: [], scheduleItems: [], goals: [], memories: [] };
          const { error: createError } = await supabase.from('user_workspace').insert({
            user_id: authUser.id,
            data: emptyWorkspace,
            updated_at: new Date().toISOString(),
          });
          if (!active) return;
          if (createError) {
            setSyncError(`Could not create your workspace: ${createError.message}`);
            return;
          }
          setMessages([]);
          setScheduleItems([]);
          setGoals([]);
          setMemories([]);
          setWorkspaceReady(true);
          setSyncError('');
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
    if (!authUser || !workspaceReady || !supabase || !isOnline) return undefined;

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
    window.clearTimeout(longPressTimerRef.current);
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  const handlePointerDown = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    const frame = phoneFrameRef.current;
    const button = event.currentTarget;
    dragMovedRef.current = false;
    longPressTriggeredRef.current = false;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      dragMovedRef.current = true;
      setCurrentTab('ai');
      startVoiceInput({ autoSend: true });
    }, 3000);
    if (frame && button) {
      const frameBounds = frame.getBoundingClientRect();
      const buttonBounds = button.getBoundingClientRect();
      const x = buttonBounds.left - frameBounds.left;
      const y = buttonBounds.top - frameBounds.top;
      setPosition({ x, y });
      dragStartRef.current = { pointerX: event.clientX, pointerY: event.clientY, x, y };
      button.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }
  };
  const handlePointerMove = (event) => {
    if (!isDragging) return;
    const frame = phoneFrameRef.current;
    const button = mercyButtonRef.current;
    const start = dragStartRef.current;
    if (!frame || !button || !start) return;

    if (!dragMovedRef.current && Math.hypot(event.clientX - start.pointerX, event.clientY - start.pointerY) < 6) return;
    if (!longPressTriggeredRef.current) window.clearTimeout(longPressTimerRef.current);

    const newX = Math.max(12, Math.min(frame.clientWidth - button.offsetWidth - 12, start.x + event.clientX - start.pointerX));
    const newY = Math.max(12, Math.min(frame.clientHeight - button.offsetHeight - 12, start.y + event.clientY - start.pointerY));
    dragMovedRef.current = true;
    setPosition({ x: newX, y: newY });
  };
  const handlePointerUp = () => {
    window.clearTimeout(longPressTimerRef.current);
    if (longPressTriggeredRef.current) recognitionRef.current?.stop();
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const enablePushNotifications = async () => {
    if (!authUser || !supabase) {
      setNotificationError('Sign in before enabling background notifications.');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotificationError('Background push is not supported by this browser. You can still receive alerts while My PA is open.');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey(VAPID_PUBLIC_KEY),
      });
      const { error } = await supabase.from('push_subscriptions').upsert({
        endpoint: subscription.endpoint,
        user_id: authUser.id,
        subscription: subscription.toJSON(),
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      setPushSubscriptionEnabled(true);
      setNotificationError('');
    } catch (error) {
      console.error('Could not enable background notifications:', error);
      setNotificationError('Could not enable background delivery. Check the push notification setup and try again.');
    }
  };

  const enableNotifications = async () => {
    setNotificationError('');
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    let permissionRequest;
    try {
      permissionRequest = Notification.permission === 'default'
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
    } catch (error) {
      console.error('Could not request notification permission:', error);
      setNotificationError('Could not enable notifications. Check your browser settings.');
      return;
    }

    try {
      if ('AudioContext' in window) {
        audioContextRef.current ??= new window.AudioContext();
        await audioContextRef.current.resume();
      }
    } catch (error) {
      console.error('Could not enable notification sound:', error);
      setNotificationError('Sound could not be enabled in this browser.');
    }

    try {
      const permission = await permissionRequest;
      setNotificationPermission(permission);
      if (permission === 'granted') await enablePushNotifications();
      else if (permission === 'denied') setNotificationError('Notifications are blocked. Allow them for My PA in your browser or device settings.');
    } catch (error) {
      console.error('Could not request notification permission:', error);
      setNotificationError('Could not enable notifications. Check your browser settings.');
    }
  };

  const testNotificationSound = async () => {
    try {
      if (!('AudioContext' in window)) {
        setNotificationError('Sound is not supported in this browser.');
        return;
      }
      audioContextRef.current ??= new window.AudioContext();
      await audioContextRef.current.resume();
      playNotificationChime();
      setNotificationError('');
    } catch (error) {
      console.error('Could not play notification sound:', error);
      setNotificationError('Could not play the sound. Check your device volume and browser settings.');
    }
  };

  const startVoiceInput = ({ autoSend = false } = {}) => {
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
      if (!transcript) return;
      setInputText(previous => `${previous}${previous ? ' ' : ''}${transcript}`);
      if (autoSend) window.setTimeout(() => sendMessageRef.current?.(transcript), 0);
    };
    recognition.onerror = () => {
      setVoiceError('Microphone access failed. Check browser permission, or type your message instead.');
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch (error) {
      console.error('Could not start voice typing:', error);
      setIsListening(false);
      setVoiceError('Could not start voice typing. Check microphone permission and try again.');
    }
  };

  const speakMessage = (text) => {
    if (!('speechSynthesis' in window)) {
      setVoiceError('Spoken replies are not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const language = navigator.language.toLowerCase();
    const feminineVoice = voices.find(voice =>
      voice.lang.toLowerCase().startsWith(language.split('-')[0]) &&
      /female|woman|samantha|victoria|karen|moira|tessa|serena|ava|aria|jenny|zira|susan/i.test(voice.name)
    ) || voices.find(voice =>
      /female|woman|samantha|victoria|karen|moira|tessa|serena|ava|aria|jenny|zira|susan/i.test(voice.name)
    );
    if (feminineVoice) utterance.voice = feminineVoice;
    else utterance.lang = navigator.language;
    window.speechSynthesis.speak(utterance);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');
    if (!supabase) {
      setAuthError('Email sign-in is unavailable because Supabase is not configured.');
      return;
    }

    const username = signupUsername.trim().toLowerCase();
    if (authMode === 'sign-up' && !/^[a-z0-9_]{3,20}$/.test(username)) {
      setAuthError('Choose a username using 3–20 letters, numbers, or underscores.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const email = authEmail.trim().toLowerCase();
      const result = authMode === 'sign-up'
        ? await supabase.auth.signUp({
          email,
          password: authPassword,
          options: { data: { username } },
        })
        : await supabase.auth.signInWithPassword({ email, password: authPassword });

      if (result.error) {
        const message = result.error.message.toLowerCase();
        setAuthError(message.includes('invalid login credentials')
          ? 'That email and password do not match. Check them and try again.'
          : message.includes('email not confirmed')
            ? 'Please confirm your email using the link in your inbox, then sign in.'
            : result.error.message);
        return;
      }
      if (authMode === 'sign-up' && !result.data.session) {
        setAuthNotice('Check your email to confirm your account, then sign in. Your chosen username will be saved after confirmation.');
      }
      setAuthPassword('');
    } catch (error) {
      console.error('Email authentication failed:', error);
      setAuthError('Could not connect to email sign-in. Check your internet connection and try again.');
    } finally {
      setAuthSubmitting(false);
    }
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
    setProfileNotice('');
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

  const handleSignOut = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const pushSubscription = registration.pushManager
          ? await registration.pushManager.getSubscription()
          : null;
        if (pushSubscription) {
          if (supabase && authUser) {
            const { error: deleteSubscriptionError } = await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', pushSubscription.endpoint)
              .eq('user_id', authUser.id);
            if (deleteSubscriptionError) throw deleteSubscriptionError;
          }
          const unsubscribed = await pushSubscription.unsubscribe();
          if (!unsubscribed) throw new Error('The browser did not remove the push subscription.');
        }
      }
    } catch (error) {
      console.error('Could not disable push notifications before sign-out:', error);
      setNotificationError('Could not turn off background notifications. Check your connection and try again before signing out.');
      return;
    }

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
    setPushSubscriptionEnabled(false);
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
    const emptyWorkspace = { messages: [], scheduleItems: [], goals: [], memories: [] };
    const { error } = await supabase.from('user_workspace').upsert({
      user_id: authUser.id,
      data: emptyWorkspace,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setSyncError(`Could not delete cloud data: ${error.message}`);
      return;
    }
    setMessages([]);
    setScheduleItems([]);
    setGoals([]);
    setMemories([]);
    setWorkspaceReady(true);
    setSyncError('');
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
    e?.preventDefault?.();
    const messageToSend = typeof e === 'string' ? e : inputText;
    if (!messageToSend.trim() || isThinking) return;

    const userMessage = messageToSend.trim();
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
          context: {
            scheduleItems,
            goals,
            memories,
            currentDateTime: new Date().toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          },
        },
      });
      if (error) throw error;

      const existingTaskIds = new Set(
        scheduleItems.filter(item => item.type === 'Task').map(item => String(item.id))
      );
      const existingGoalIds = new Set(goals.map(goal => String(goal.id)));
      const actions = parseMercyActions(data?.actions, new Date(), existingTaskIds, existingGoalIds);
      const applied = applyMercyActions(actions, scheduleItems, memories, goals);
      if (applied.appliedCount) {
        setScheduleItems(applied.scheduleItems);
        setMemories(applied.memories);
        setGoals(applied.goals);
      }

      const mercyReply = typeof data?.reply === 'string' && data.reply.trim()
        ? data.reply.trim()
        : "I couldn't get a reply just now. Please try again.";
      const actionConfirmation = applied.appliedCount
        ? `\n\nI’ve saved ${applied.appliedCount} update${applied.appliedCount === 1 ? '' : 's'} for you.`
        : '';
      setMessages(prev => [...prev, { sender: 'mercy', text: `${mercyReply}${actionConfirmation}` }]);
    } catch (error) {
      console.error('Error connecting to Mercy AI:', error);
      const errorStatus = error?.context?.status ?? error?.status;
      const errorMessage = errorStatus === 401
        ? 'Your session may have expired. Please sign in again, then try once more.'
        : "I'm sorry, I'm having trouble responding right now. Your message is still here—please try again in a little while.";
      setMessages(prev => [...prev, { sender: 'mercy', text: errorMessage }]);
    } finally {
      setIsThinking(false);
    }
  };
  useEffect(() => {
    sendMessageRef.current = handleSendMessage;
  });

  const updateTaskProposal = (messageIndex, update) => {
    setMessages(previous => previous.map((message, index) => (
      index === messageIndex && message.taskProposal?.status === 'pending'
        ? { ...message, taskProposal: update(message.taskProposal) }
        : message
    )));
  };

  const applyTaskProposal = (messageIndex) => {
    const proposal = messages[messageIndex]?.taskProposal;
    if (!proposal || proposal.status !== 'pending') return;

    setScheduleItems(previous => {
      const currentTasks = previous.filter(item => item.type === 'Task');
      const tasksById = new Map(currentTasks.map(item => [String(item.id), item]));
      const usedIds = new Set();
      const reorderedTasks = [];

      proposal.tasks.forEach((task, index) => {
        if (task.existingTaskId !== null) {
          const existingTask = tasksById.get(task.existingTaskId);
          if (existingTask && !usedIds.has(task.existingTaskId)) {
            reorderedTasks.push({ ...existingTask, title: task.title });
            usedIds.add(task.existingTaskId);
          }
          return;
        }
        reorderedTasks.push({
          id: Date.now() + index,
          title: task.title,
          time: 'Not scheduled',
          type: 'Task',
          completed: false,
        });
      });

      currentTasks.forEach(task => {
        if (!usedIds.has(String(task.id))) reorderedTasks.push(task);
      });

      let taskIndex = 0;
      const updatedSchedule = previous.map(item => (
        item.type === 'Task' ? reorderedTasks[taskIndex++] : item
      ));
      return [...updatedSchedule, ...reorderedTasks.slice(taskIndex)];
    });
    updateTaskProposal(messageIndex, current => ({ ...current, status: 'applied' }));
  };

  const dismissTaskProposal = (messageIndex) => {
    updateTaskProposal(messageIndex, current => ({ ...current, status: 'dismissed' }));
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
      <main className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[#f4f8fc] p-6" aria-live="polite">
        <img src="/my-pa-logo.png" alt="My PA" className="h-24 w-24 rounded-3xl object-cover shadow-lg shadow-sky-200 animate-logo-spin" />
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">My PA</h1>
          <p className="mt-2 text-sm text-sky-800">Connecting securely to your My PA account…</p>
        </div>
      </main>
    );
  }

  if (!isSupabaseConfigured || !authUser || profileNeedsUsername || profileError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f4f8fc] p-6">
        <section className="w-full max-w-md rounded-3xl border border-sky-100 bg-white p-6 shadow-xl">
          <div className="mb-5 flex items-center gap-3">
            <img src="/my-pa-logo.png" alt="My PA" className="h-16 w-16 rounded-2xl object-cover" />
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
              {profileNotice && <p role="status" className="text-sm text-amber-700">{profileNotice}</p>}
              {profileError && <p role="alert" className="text-sm text-red-600">{profileError}</p>}
              <button type="submit" className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white">
                Save username
              </button>
              <button type="button" onClick={handleSignOut} className="w-full py-2 text-sm text-slate-500">Sign out</button>
            </form>
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
              {authMode === 'sign-up' && (
                <input
                  type="text"
                  autoComplete="username"
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]{3,20}"
                  required
                  value={signupUsername}
                  onChange={event => setSignupUsername(event.target.value)}
                  placeholder="Username (3–20 letters, numbers, or underscores)"
                  className="w-full rounded-xl border border-sky-200 px-4 py-3 text-sm"
                />
              )}
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
                minLength={authMode === 'sign-up' ? 8 : undefined}
                required
                value={authPassword}
                onChange={event => setAuthPassword(event.target.value)}
                placeholder={authMode === 'sign-up' ? 'Password (at least 8 characters)' : 'Password'}
                className="w-full rounded-xl border border-sky-200 px-4 py-3 text-sm"
              />
              {authError && <p role="alert" className="text-sm text-red-600">{authError}</p>}
              {authNotice && <p role="status" className="text-sm text-emerald-700">{authNotice}</p>}
              <button type="submit" disabled={authSubmitting} className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {authSubmitting ? 'Connecting…' : authMode === 'sign-in' ? 'Sign in' : 'Create account'}
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
    >
      {/* Phone Frame Container */}
      <div ref={phoneFrameRef} className="w-full md:max-w-[430px] h-screen md:h-[880px] bg-white md:rounded-[40px] shadow-2xl flex flex-col justify-between relative overflow-hidden border border-sky-100">
        
        {/* TOP HEADER */}
        <div className="pt-12 px-6 pb-4 bg-gradient-to-b from-sky-50 to-white flex justify-between items-center border-b border-sky-100/60 shrink-0">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-600 bg-sky-100 px-2 py-1 rounded-full">
              <img src="/pwa-icon-192.png" alt="" className="h-5 w-5 rounded-md" />
              My PA Assistant
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">{timeGreeting}</h1>
            <p className={`mt-1 text-[10px] ${isOnline && !syncError ? 'text-emerald-700' : 'text-amber-700'}`}>
              {!isOnline ? 'Offline — changes will sync when you reconnect' : syncError || 'Private cloud workspace'}
            </p>
          </div>
          <img src="/my-pa-logo.png" alt="My PA" className="h-10 w-10 rounded-full bg-white object-cover shadow-md shadow-sky-200" />
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
                  <span className="text-xs font-semibold uppercase tracking-wider text-sky-100">A little encouragement</span>
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
                  {mainPriorityTask && (
                    <span className="text-xs text-sky-600 font-semibold bg-sky-50 px-2 py-0.5 rounded">
                      {mainPriorityTask.priority ?? 'Next up'}
                    </span>
                  )}
                </div>
                <div className="bg-sky-50/50 rounded-xl p-3 border border-sky-100 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">
                      {mainPriorityTask?.title ?? 'No tasks yet'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {mainPriorityTask?.notes ?? 'Tell Mercy what you need to do and she’ll organise it for you.'}
                    </p>
                  </div>
                  {mainPriorityTask ? (
                    <CheckCircle2 className="text-sky-500" size={22} />
                  ) : (
                    <button onClick={() => setCurrentTab('ai')} className="text-xs font-semibold text-sky-700">
                      Add with Mercy
                    </button>
                  )}
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
                  {todaysScheduleItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-sky-50/50 transition-colors border border-slate-100">
                      <div className="text-xs font-bold text-sky-600 bg-sky-100 px-2.5 py-1 rounded-lg">{item.time}</div>
                      <div className="flex-1">
                        <h5 className={`text-xs font-bold ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.title}</h5>
                        <p className="text-[11px] text-slate-500">{item.type}</p>
                      </div>
                    </div>
                  ))}
                  {todaysScheduleItems.length === 0 && (
                    <p className="py-2 text-xs text-slate-500">Nothing scheduled for today. Ask Mercy to add it whenever you’re ready.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: MERCY AI CHAT */}
          {currentTab === 'ai' && (
            <div className="flex flex-col h-full space-y-3">
              <div className="bg-sky-50 p-2.5 rounded-2xl border border-sky-100 text-center shrink-0">
                <p className="text-xs font-medium text-sky-800">Talk to Mercy about your day, goals, and saved notes.</p>
              </div>
              
              <div ref={chatMessagesRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
                {messages.map((msg, index) => (
                  <div key={index} className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.sender === 'mercy' && (
                      <img src="/my-pa-logo.png" alt="Mercy" className="w-8 h-8 rounded-full bg-white object-cover shrink-0 mt-1" />
                    )}
                    <div className={`p-3 rounded-2xl text-xs max-w-[80%] leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-sky-500 text-white rounded-tr-none shadow-sm shadow-sky-200' 
                        : 'bg-sky-100/70 text-slate-800 rounded-tl-none'
                    }`}>
                      {msg.text}
                      {msg.sender === 'mercy' && msg.taskProposal?.status === 'pending' && (
                        <div className="mt-3 space-y-2 border-t border-sky-200 pt-3">
                          <p className="text-[11px] font-semibold text-slate-700">{msg.taskProposal.summary}</p>
                          {msg.taskProposal.tasks.map((task, taskIndex) => (
                            <div key={`${task.existingTaskId ?? 'new'}-${taskIndex}`} className="flex items-center gap-2">
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                task.priority === 'high' ? 'bg-rose-100 text-rose-700' :
                                  task.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                                    'bg-slate-100 text-slate-600'
                              }`}>{task.priority}</span>
                              <input
                                aria-label={`Edit proposed task ${taskIndex + 1}`}
                                value={task.title}
                                maxLength={120}
                                onChange={event => updateTaskProposal(index, proposal => ({
                                  ...proposal,
                                  tasks: proposal.tasks.map((entry, entryIndex) => (
                                    entryIndex === taskIndex ? { ...entry, title: event.target.value } : entry
                                  )),
                                }))}
                                className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-[11px] text-slate-800"
                              />
                              {task.existingTaskId === null && <span className="shrink-0 text-[9px] text-sky-700">New</span>}
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => applyTaskProposal(index)}
                              disabled={msg.taskProposal.tasks.some(task => !task.title.trim())}
                              className="flex-1 rounded-lg bg-sky-600 px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              Apply plan
                            </button>
                            <button
                              type="button"
                              onClick={() => dismissTaskProposal(index)}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {msg.sender === 'mercy' && msg.taskProposal?.status === 'applied' && (
                        <p className="mt-2 border-t border-sky-200 pt-2 text-[10px] font-medium text-emerald-700">Plan applied to your tasks.</p>
                      )}
                      {msg.sender === 'mercy' && msg.taskProposal?.status === 'dismissed' && (
                        <p className="mt-2 border-t border-sky-200 pt-2 text-[10px] text-slate-500">Plan cancelled; your tasks were not changed.</p>
                      )}
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
                    <img src="/my-pa-logo.png" alt="Mercy" className="w-8 h-8 rounded-full bg-white object-cover" />
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
                        {item.type === 'Task' && item.priority && (
                          <span className="ml-1 text-[9px] font-semibold text-slate-500">{item.priority} priority</span>
                        )}
                        <h4 className={`text-xs font-bold mt-0.5 ${item.completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>{item.title}</h4>
                        {item.notes && <p className="mt-0.5 text-[10px] text-slate-500">{item.notes}</p>}
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
                        {goal.notes && <p className="mt-1 text-[10px] text-slate-500">{goal.notes}</p>}
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {goal.deadline && goal.deadline !== 'Not set' ? goal.deadline : 'No deadline'}
                      </span>
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
                <h3 className="text-sm font-bold text-sky-900">Your account</h3>
                <p className="text-xs text-sky-700 mt-0.5">Manage your account, reminders, and saved data.</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-xs font-medium text-slate-800">Username</span>
                  <span className="text-xs font-bold text-sky-600">@{profileUsername}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs font-medium text-slate-800">Email</span>
                  <span className="text-xs font-bold text-sky-600">{authUser.email}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Reminders</h3>
                <p className="text-xs text-slate-600">Enable pop-ups here for schedule reminders and Mercy’s 10:00 AM Daily Notice. Your browser will ask you to allow notifications. Background delivery also requires push setup for this app.</p>
                <button type="button" onClick={enableNotifications} disabled={notificationPermission === 'denied' || notificationPermission === 'unsupported'} className="w-full inline-flex justify-center items-center gap-2 rounded-xl border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-800 disabled:opacity-50">
                  <Bell size={14} />
                  {notificationPermission === 'denied'
                    ? 'Notifications blocked in browser settings'
                    : notificationPermission === 'unsupported'
                      ? 'Notifications unsupported'
                      : pushSubscriptionEnabled
                        ? 'Push subscription saved'
                        : notificationPermission === 'granted'
                          ? 'Enable background notifications'
                          : 'Enable pop-up notifications'}
                </button>
                <label className="flex items-center justify-between gap-3 text-xs text-slate-700">
                  <span>Play a sound with reminders</span>
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={event => setSoundEnabled(event.target.checked)}
                    className="h-4 w-4 accent-sky-600"
                  />
                </label>
                <label className="block space-y-1 text-xs text-slate-700">
                  <span>Reminder sound</span>
                  <select
                    value={notificationSound}
                    onChange={event => setNotificationSound(event.target.value)}
                    disabled={!soundEnabled}
                    className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs text-slate-800 disabled:opacity-50"
                  >
                    <option value="alarm">Loud, longer alarm (about 5 seconds)</option>
                    <option value="chime">Short, bright chime (about 2 seconds)</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={testNotificationSound}
                  disabled={!soundEnabled}
                  className="w-full rounded-xl border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-800 disabled:opacity-50"
                >
                  Test selected sound
                </button>
                <p className="text-[10px] text-slate-500">The selected sound plays while My PA is open. Device volume and browser settings still control how loud it can be.</p>
                {notificationError && <p role="alert" className="text-xs text-amber-800">{notificationError}</p>}
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
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={() => {
            if (longPressTriggeredRef.current) {
              longPressTriggeredRef.current = false;
              return;
            }
            if (dragMovedRef.current) {
              dragMovedRef.current = false;
              return;
            }
            setCurrentTab('ai');
          }}
          className={`absolute z-50 touch-none cursor-grab active:cursor-grabbing group flex items-center gap-2 ${isListening ? 'bg-red-500' : 'bg-gradient-to-r from-sky-500 to-sky-600'} text-white p-3 rounded-full shadow-xl shadow-sky-300 hover:scale-105 transition-transform ${position ? '' : 'right-5 bottom-24'}`}
          title="Tap to chat, hold for 3 seconds to talk"
        >
          <img src="/pwa-icon-192.png" alt="" className="relative w-8 h-8 rounded-full" />
          <span className="text-xs font-semibold pr-2 hidden group-hover:inline-block transition-all">{isListening ? 'Listening…' : 'Tap to chat · hold to talk'}</span>
        </div>

      </div>
    </div>
  );
}