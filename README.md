# My PA

A personal-assistant dashboard built with React, Vite, and Gemini.

## Getting started

1. Install dependencies with `npm install`.
2. Create a `.env` file in the project root and add `VITE_GEMINI_API_KEY=your_key`.
3. Start the development server with `npm run dev`.

Do not commit `.env` or share its contents.

## Current features

- Mercy AI chat with recent conversation context and your saved schedule, goals, and notes.
- Schedule items with completion controls.
- Goals and progress tracking.
- Searchable notes that can be created, edited, and deleted.
- Chat, schedule, goals, and notes saved in this browser's local storage.
- A draggable Mercy shortcut that stays inside the app frame.

## Data and security

Data is stored in the current browser on this device. It does not sync between browsers or devices. Clearing this site's browser storage will remove the saved data.

The Gemini key uses Vite's `VITE_` client-side environment variable and is therefore included in browser code. This setup is suitable only for private local development. Before publishing the app or allowing other people to use it, move Gemini requests to a server and keep the key on that server.
