# 🏷️ Reddit Tags

> Tag, organize, and remember every Reddit conversation — right inside your browser.

---

## What is Reddit Tags?

Reddit Tags is a free Chrome extension that lets you add color-coded tags and personal notes to your Reddit DM conversations. Never forget who someone is, what you talked about, or why they matter — all without leaving Reddit.

---

## ✨ Features

- 🏷️ **One-click tagging** — Tag any Reddit DM conversation directly from the chat list
- 🎨 **Color-coded tags** — Choose from 6 pastel colors to visually organize contacts
- 📝 **Personal descriptions** — Add private notes about each person
- 🔍 **Filter & search** — Instantly filter tagged conversations by tag name or username
- 🔗 **Quick access** — Jump back to any conversation with a single click
- 💾 **Local storage** — All data stays on your device, completely private
- 🚫 **No account needed** — Install and use immediately

---

## 📦 Installation (Developer Mode)

Since this extension is not yet on the Chrome Web Store, follow these steps to install it manually.

### Step 1 — Download the extension

1. Go to the GitHub repository page
2. Click the green **Code** button
3. Click **Download ZIP**
4. Extract the ZIP file anywhere on your computer (e.g. Desktop)

### Step 2 — Open Chrome Extensions

1. Open Google Chrome
2. Type `chrome://extensions` in the address bar and press Enter
3. Toggle **Developer Mode** ON using the switch in the top right corner

### Step 3 — Load the extension

1. Click **Load Unpacked**
2. Select the extracted folder (the one containing `manifest.json`)
3. Reddit Tags will appear in your extensions list

### Step 4 — Pin it (optional but recommended)

1. Click the puzzle piece 🧩 icon in Chrome's toolbar
2. Find **Reddit Tags** and click the pin 📌 icon
3. The Reddit Tags icon will now always be visible in your toolbar

---

## 🚀 How to Use

### Opening the sidebar

1. Go to [reddit.com/chat](https://www.reddit.com/chat)
2. The sidebar will open automatically when you tag a conversation
3. Or click the Reddit Tags icon in your toolbar to open it manually

### Tagging a conversation

1. Open Reddit Chat at `reddit.com/chat/`
2. You will see an orange **Tag** button next to each conversation in the left sidebar
3. Click **Tag** on any conversation
4. The Reddit Tags sidebar will open on the right
5. Pick a **color** for your tag
6. Enter a **tag label** (e.g. `friend`, `work`, `follow-up`)
7. Optionally add a **description** or personal note
8. Click **Save**

### Viewing tagged conversations

All your tagged conversations appear in the **Tagged Conversations** section of the sidebar, sorted by most recent.

Each entry shows:
- The color-coded tag label
- The Reddit username
- Your personal description (if added)
- Date and time tagged
- A direct link to open that chat

### Filtering

Use the **Filter** box to search through your tagged conversations by tag name or username in real time.

### Deleting tags

- Click **Delete** on any individual tag to remove it (confirmation required)
- Click **Clear All** to remove all tags at once (confirmation required)

---

## 🔒 Privacy

Reddit Tags stores all data **locally on your device** using Chrome's built-in storage. No data is sent to any server. No account is required. Your tags are completely private.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Manifest V3 |
| Content Script | Vanilla JavaScript |
| Storage | chrome.storage.local |
| UI | HTML + CSS (DM Sans font) |
| Architecture | Shadow DOM traversal |
---

## 🤝 Contributing

Pull requests are welcome! If you find a bug or have a feature request, please open an issue on GitHub.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

Made with ❤️ for the Reddit community
